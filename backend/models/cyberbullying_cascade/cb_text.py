"""cb_text.py - text normalisation + dual (word / hashed char n-gram) tokenisation.
Pure python + numpy (no TensorFlow). Shipped next to the .keras / .tflite model."""
import re, math, zlib, unicodedata
import numpy as np

PAD, UNK, MASK = 0, 1, 2

_EMOJI     = "\U0001F300-\U0001FAFF\u2600-\u27BF"
_URL_RE    = re.compile(r"https?://\S+|www\.\S+")
_MENTION   = re.compile(r"@\w+")
_SPELLED   = re.compile(r"\b(?:[a-z][\s.\-_*]+){3,}[a-z]\b")        # "f u c k", "l.o.s.e.r"  (>= 4 letters)
_SEP       = re.compile(r"[\s.\-_*]+")
_STRIP     = re.compile(r"[^\w\s" + _EMOJI + "]")
_EMOJI_RE  = re.compile("([" + _EMOJI + "])")
_REPEAT    = re.compile(r"(.)\1{2,}")                                # 3+ same char -> 2
_NUM_UNIT  = re.compile(r"^\d+[a-z]{1,2}$")                          # 10pm, 3rd, 5k  -> not leet
_BANG_MID  = re.compile(r"(?<=[a-z])!(?=[a-z])")                     # b!tch
_DIGIT_MAP = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s"})
_HOMOGLYPH = str.maketrans({"\u0430": "a", "\u0435": "e", "\u043e": "o", "\u0440": "p", "\u0441": "c",
                            "\u0445": "x", "\u0443": "y", "\u0456": "i", "\u0455": "s", "\u0458": "j"})

def _deleet(tok):
    """sh1t -> shit, a$$ -> ass, f*ck -> fck, b!tch -> bitch (only for tokens that look like words)."""
    if sum(c.isalpha() for c in tok) < 2 or not re.search(r"[0-9@$!*]", tok) or _NUM_UNIT.match(tok):
        return tok
    tok = _BANG_MID.sub("i", tok).translate(_DIGIT_MAP)
    return tok.replace("*", "")

def clean_text(text):
    """Robust normalisation: unicode / lowercase / urls / mentions / homoglyphs / spaced letters /
    leet-speak / apostrophes / repeated letters / punctuation (emoji are kept as tokens)."""
    text = unicodedata.normalize("NFKC", str(text)).lower()
    text = text.replace("\u2019", "'").replace("\u2018", "'")
    text = _URL_RE.sub(" ", text)
    text = _MENTION.sub(" usertag ", text)
    text = text.translate(_HOMOGLYPH)
    text = _SPELLED.sub(lambda m: _SEP.sub("", m.group(0)), text)
    text = " ".join(_deleet(t) for t in text.split())
    text = text.replace("'", "").replace("_", " ")
    text = _REPEAT.sub(r"\1\1", text)
    text = _EMOJI_RE.sub(r" \1 ", text)
    text = _STRIP.sub(" ", text)
    return re.sub(r"\s+", " ", text).strip()

def tokenize(text):
    return clean_text(text).split()

def char_ngrams(word, n_min=3, n_max=5, max_ngrams=48, max_chars=16):
    """fastText-style character n-grams with boundary markers (ordered by position, so truncation
    never removes a whole size class). Very long tokens keep head + tail."""
    if len(word) > max_chars:
        h = max_chars // 2
        word = word[:h] + word[-h:]
    w = f"<{word}>"
    grams = [w[i:i+n] for i in range(len(w)) for n in range(n_min, n_max + 1) if i + n <= len(w)]
    return grams[:max_ngrams]

def ngram_id(gram, buckets):
    """Deterministic hash (NOT python's salted hash()) -> bucket id in [2, buckets+1]. 0 = PAD, 1 = UNK."""
    return zlib.crc32(gram.encode("utf-8")) % buckets + 2

class DualEncoder:
    """Converts raw text -> (word_ids[max_words] int32, char_ids[max_words, max_ngrams] uint16).
    Char n-grams are hashed, so words never seen in training still get meaningful sub-word ids."""
    def __init__(self, word2idx, cfg):
        self.word2idx = word2idx
        self.max_words, self.K = cfg["max_words"], cfg["max_ngrams"]
        self.n_min, self.n_max, self.buckets = cfg["ngram_min"], cfg["ngram_max"], cfg["hash_buckets"]
        self.max_chars = cfg.get("max_chars_per_word", 16)
        self._cache = {}
        assert self.buckets + 2 <= 65535, "hash_buckets too large for uint16 char ids"

    def _word_ngram_ids(self, word):
        ids = self._cache.get(word)
        if ids is None:
            grams = char_ngrams(word, self.n_min, self.n_max, self.K, self.max_chars)
            ids = np.zeros(self.K, dtype=np.uint16)
            ids[:len(grams)] = [ngram_id(g, self.buckets) for g in grams]
            self._cache[word] = ids
        return ids

    def encode(self, text):
        words = tokenize(text)[: self.max_words] or ["<empty>"]
        w = np.zeros(self.max_words, dtype=np.int32)
        c = np.zeros((self.max_words, self.K), dtype=np.uint16)
        for i, tok in enumerate(words):
            w[i] = self.word2idx.get(tok, UNK)
            c[i] = self._word_ngram_ids(tok)
        return w, c

    def encode_many(self, texts):
        W = np.zeros((len(texts), self.max_words), dtype=np.int32)
        C = np.zeros((len(texts), self.max_words, self.K), dtype=np.uint16)
        for i, t in enumerate(texts):
            W[i], C[i] = self.encode(t)
        return W, C
