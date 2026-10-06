"""cb_model.py - Keras implementation of the Cascade Cyberbullying Classifier.

Dual embedding (word + hashed char n-gram) -> fusion -> bidirectional Transformer encoder
-> learned attention pooling -> Stage-1 gate head (Linear+Sigmoid) + Stage-2 category head (Linear+Softmax).

Only stock Keras layers plus a few tiny *stateless* custom layers are used, so the model
saves to .keras cleanly and converts to TFLite with built-in ops.
"""
import json, math, os
import numpy as np
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers

PAD, UNK, MASK = 0, 1, 2
_reg = keras.utils.register_keras_serializable(package="cb")


def _dim(x, axis):
    """static dim if known, else dynamic tensor dim"""
    return x.shape[axis] if x.shape[axis] is not None else tf.shape(x)[axis]


# ------------------------------------------------------------------ stateless helper layers
@_reg
class PadMask(layers.Layer):
    """word_ids (B,L) -> float mask (B,L), 1 = real token, 0 = padding."""
    def call(self, w):
        return tf.cast(tf.not_equal(w, PAD), tf.float32)


@_reg
class PositionIds(layers.Layer):
    """word_ids (B,L) -> position ids (B,L) = 0..L-1."""
    def call(self, w):
        L = tf.shape(w)[1]
        return tf.zeros_like(w) + tf.range(L, dtype=w.dtype)[tf.newaxis, :]


@_reg
class CharMaskedMean(layers.Layer):
    """[emb (B,L,K,D), ids (B,L,K)] -> mean of the non-PAD n-gram embeddings per word (B,L,D)."""
    def call(self, inputs):
        emb, ids = inputs
        m = tf.cast(tf.not_equal(ids, PAD), tf.float32)
        s = tf.reduce_sum(emb * m[..., tf.newaxis], axis=2)
        n = tf.maximum(tf.reduce_sum(m, axis=2, keepdims=True), 1.0)
        return s / n


@_reg
class AttentionCore(layers.Layer):
    """Multi-head scaled dot-product attention (bidirectional, padding-masked). inputs: [q, k, v, mask]."""
    def __init__(self, num_heads, dropout=0.0, **kw):
        super().__init__(**kw)
        self.num_heads, self.dropout = int(num_heads), float(dropout)

    def call(self, inputs, training=None):
        q, k, v, mask = inputs
        H = self.num_heads
        d = q.shape[-1]
        dh = d // H
        L = _dim(q, 1)

        def split(x):
            return tf.transpose(tf.reshape(x, [-1, L, H, dh]), [0, 2, 1, 3])      # (B,H,L,dh)

        qh, kh, vh = split(q), split(k), split(v)
        scores = tf.matmul(qh, kh, transpose_b=True) / math.sqrt(dh)              # (B,H,L,L)
        scores = scores + (1.0 - mask[:, tf.newaxis, tf.newaxis, :]) * -1e9
        probs = tf.nn.softmax(scores, axis=-1)
        if training and self.dropout > 0:
            probs = tf.nn.dropout(probs, rate=self.dropout)
        ctx = tf.transpose(tf.matmul(probs, vh), [0, 2, 1, 3])                    # (B,L,H,dh)
        return tf.reshape(ctx, [-1, L, d])

    def get_config(self):
        c = super().get_config(); c.update(num_heads=self.num_heads, dropout=self.dropout); return c


@_reg
class AttentionPoolCore(layers.Layer):
    """Learned attention pooling. inputs: [x (B,L,D), scores (B,L,H), mask (B,L)] -> pooled (B,D).
    `H` independent attention distributions each pool one slice of the channels."""
    def __init__(self, num_heads, **kw):
        super().__init__(**kw)
        self.num_heads = int(num_heads)

    def call(self, inputs):
        x, s, mask = inputs
        H = self.num_heads
        D = x.shape[-1]
        L = _dim(x, 1)
        s = s + (1.0 - mask[:, :, tf.newaxis]) * -1e9
        a = tf.nn.softmax(s, axis=1)                                              # (B,L,H) softmax over tokens
        xh = tf.reshape(x, [-1, L, H, D // H])
        pooled = tf.reduce_sum(a[..., tf.newaxis] * xh, axis=1)                   # (B,H,dh)
        return tf.reshape(pooled, [-1, D])

    def get_config(self):
        c = super().get_config(); c.update(num_heads=self.num_heads); return c


# ------------------------------------------------------------------ model builder
def _encoder_block(x, mask, cfg, i):
    d, p = cfg["d_model"], cfg["dropout"]
    h = layers.LayerNormalization(epsilon=1e-5, name=f"l{i}_ln1")(x)               # pre-LN
    q = layers.Dense(d, name=f"l{i}_q")(h)
    k = layers.Dense(d, name=f"l{i}_k")(h)
    v = layers.Dense(d, name=f"l{i}_v")(h)
    a = AttentionCore(cfg["num_heads"], p, name=f"l{i}_attn")([q, k, v, mask])     # Multi-Head Self-Attention
    a = layers.Dropout(p, name=f"l{i}_attn_drop")(layers.Dense(d, name=f"l{i}_o")(a))
    x = layers.Add(name=f"l{i}_add1")([x, a])                                      # Add (& Norm at next input)
    h = layers.LayerNormalization(epsilon=1e-5, name=f"l{i}_ln2")(x)
    h = layers.Dense(cfg["d_ff"], activation="gelu", name=f"l{i}_ff1")(h)          # Feed Forward
    h = layers.Dropout(p, name=f"l{i}_ff_drop1")(h)
    h = layers.Dropout(p, name=f"l{i}_ff_drop2")(layers.Dense(d, name=f"l{i}_ff2")(h))
    return layers.Add(name=f"l{i}_add2")([x, h])


def build_model(cfg, num_classes, seq_len=None, export=False):
    """Returns (model, encoder_model, word_emb_layer).
    export=False : outputs [gate_logit (B,1), cat_logits (B,C)]   (used for training)
    export=True  : outputs [gate_prob  (B,1), cat_probs  (B,C)]   (sigmoid / softmax applied)
    seq_len=None gives a variable-length model (training); seq_len=max_words gives the fixed-length
    model that is saved as .keras / converted to TFLite. Layer names are identical, so weights copy by name."""
    K, d, p = cfg["max_ngrams"], cfg["d_model"], cfg["dropout"]
    w_in = keras.Input((seq_len,), dtype="int32", name="word_ids")
    c_in = keras.Input((seq_len, K), dtype="int32", name="char_ids")
    mask = PadMask(name="pad_mask")(w_in)

    # ---- Dual embedding: word + char n-gram ----
    word_emb = layers.Embedding(cfg["vocab_w"], cfg["d_w"], name="word_emb",
                                embeddings_initializer=keras.initializers.RandomNormal(stddev=0.02))
    we = layers.LayerNormalization(epsilon=1e-5, name="word_norm")(word_emb(w_in))
    ce = layers.Embedding(cfg["vocab_c"], cfg["d_c"], name="char_emb",
                          embeddings_initializer=keras.initializers.RandomNormal(stddev=0.1))(c_in)
    ce = CharMaskedMean(name="char_mean")([ce, c_in])
    ce = layers.LayerNormalization(epsilon=1e-5, name="char_norm")(ce)
    # ---- Fusion (concat + linear) + positions ----
    x = layers.Dense(d, name="fusion")(layers.Concatenate(name="fuse_concat")([we, ce]))
    pos = layers.Embedding(cfg["max_words"], d, name="pos_emb",
                           embeddings_initializer=keras.initializers.RandomNormal(stddev=0.02))(
        PositionIds(name="pos_ids")(w_in))
    x = layers.Add(name="add_pos")([x, pos])
    x = layers.Dropout(p, name="emb_drop")(layers.LayerNormalization(epsilon=1e-5, name="emb_norm")(x))

    # ---- Bidirectional Transformer encoder x L ----
    for i in range(cfg["num_layers"]):
        x = _encoder_block(x, mask, cfg, i)
    x_enc = layers.LayerNormalization(epsilon=1e-5, name="final_norm")(x)
    encoder_model = keras.Model([w_in, c_in], x_enc, name="encoder")

    # ---- Learned attention pooling ----
    h = layers.Dense(d, activation="tanh", name="pool_proj")(x_enc)
    s = layers.Dense(cfg["pool_heads"], use_bias=False, name="pool_score")(h)
    pooled = AttentionPoolCore(cfg["pool_heads"], name="attn_pool")([x_enc, s, mask])

    # ---- Stage 1 gate head (Linear + Sigmoid) / Stage 2 category head (Linear + Softmax) ----
    gate = layers.Dense(1, name="gate_logit")(layers.Dropout(p, name="gate_drop")(pooled))
    cat = layers.Dense(num_classes, name="cat_logit")(layers.Dropout(p, name="cat_drop")(pooled))
    if export:
        gate = layers.Activation("sigmoid", name="gate_prob")(gate)
        cat = layers.Softmax(name="cat_probs")(cat)
    model = keras.Model([w_in, c_in], [gate, cat], name="cascade_cyberbullying")
    return model, encoder_model, word_emb


def copy_weights(src, dst):
    """copy weights layer-by-layer (by name) from one model to another with the same architecture."""
    for l in dst.layers:
        if l.weights:
            l.set_weights(src.get_layer(l.name).get_weights())


# ------------------------------------------------------------------ inference wrapper (cascade + early exit)
class CascadePredictor:
    """Loads meta.json + a .keras or .tflite file and runs the real cascade:
         P(bullying) < gate_threshold  -> exit "Clean" (category head output is ignored)
         otherwise                     -> categories = top-1 plus any with prob >= cat_threshold"""
    def __init__(self, meta_path, model_path, backend="auto"):
        from .cb_text import DualEncoder
        meta = json.load(open(meta_path, encoding="utf-8"))
        self.cfg, self.categories = meta["config"], meta["categories"]
        self.gate_threshold, self.cat_threshold = meta["gate_threshold"], meta["cat_threshold"]
        self.enc = DualEncoder(meta["word2idx"], self.cfg)
        self.backend = ("tflite" if str(model_path).endswith(".tflite") else "keras") if backend == "auto" else backend
        if self.backend == "keras":
            self.model = keras.models.load_model(model_path)
        else:
            self.interp = tf.lite.Interpreter(model_path=str(model_path))
            self.interp.allocate_tensors()
            ins = self.interp.get_input_details()
            self._in_w = next(d for d in ins if len(d["shape"]) == 2)["index"]
            self._in_c = next(d for d in ins if len(d["shape"]) == 3)["index"]
            outs = self.interp.get_output_details()
            self._out_g = next(d for d in outs if d["shape"][-1] == 1)["index"]
            self._out_c = next(d for d in outs if d["shape"][-1] == len(self.categories))["index"]

    def predict_raw(self, texts):
        """-> (p_bullying (N,), category_probs (N,C)); both heads are always computed here."""
        if isinstance(texts, str):
            texts = [texts]
        W, C = self.enc.encode_many(texts)
        W, C = W.astype(np.int32), C.astype(np.int32)
        if self.backend == "keras":
            g, c = self.model.predict([W, C], batch_size=128, verbose=0)
            return g[:, 0], c
        gs, cs = [], []
        for i in range(len(W)):
            self.interp.set_tensor(self._in_w, W[i:i + 1]); self.interp.set_tensor(self._in_c, C[i:i + 1])
            self.interp.invoke()
            gs.append(self.interp.get_tensor(self._out_g)[0, 0]); cs.append(self.interp.get_tensor(self._out_c)[0])
        return np.array(gs, dtype=np.float32), np.stack(cs)

    def predict(self, texts):
        single = isinstance(texts, str)
        texts = [texts] if single else list(texts)
        pg, pc = self.predict_raw(texts)
        res = []
        for t, g, c in zip(texts, pg, pc):
            if g < self.gate_threshold:                      # ---- early exit ----
                res.append({"text": t, "p_bullying": float(g), "label": "Clean", "categories": [],
                            "stage": "Stage 1: early exit (Clean)"})
                continue
            order = np.argsort(-c)
            cats = [{"name": self.categories[j], "prob": float(c[j])}
                    for r, j in enumerate(order) if r == 0 or c[j] >= self.cat_threshold]
            res.append({"text": t, "p_bullying": float(g), "label": "Bullying", "categories": cats,
                        "stage": "Stage 1 passed -> Stage 2 category head"})
        return res[0] if single else res
