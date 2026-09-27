package com.childsafelens.demo

import android.content.Context
import android.util.Log
import org.json.JSONObject
import org.tensorflow.lite.Interpreter
import org.tensorflow.lite.flex.FlexDelegate
import java.io.FileInputStream
import java.nio.MappedByteBuffer
import java.nio.channels.FileChannel

/**
 * On-device Machine Learning inference engine for bullying detection using TensorFlow Lite.
 *
 * Model: child_safe_lens_model.tflite (Embedding + Bidirectional LSTM + Dense + Sigmoid)
 * Preprocessing: Replicates the Keras Tokenizer from tokenizer.json (word_index, filters, maxlen=60, post-padding).
 */
object Inference {

    private const val TAG = "ChildSafeLens/ML"
    private const val MODEL_FILE = "child_safe_lens_model.tflite"
    private const val TOKENIZER_FILE = "tokenizer.json"

    // Toggle for debug logging per Phase 13
    var DEBUG_LOGGING = true

    @Volatile
    private var isInitialized = false

    private var interpreter: Interpreter? = null

    // Tokenizer configuration
    private var wordIndex: Map<String, Int> = emptyMap()
    private var maxSequenceLength: Int = 60
    private var oovIndex: Int = 1
    private var padding: String = "post"
    private var truncating: String = "post"
    private var lower: Boolean = true
    private var filterSet: Set<Char> = "!\"#$%&()*+,-./:;<=>?@[\\]^_`{|}~\t\n".toSet()

    fun setPadding(mode: String) {
        padding = mode
    }

    fun getPadding(): String = padding

    fun setTruncating(mode: String) {
        truncating = mode
    }

    fun getTruncating(): String = truncating

    /**
     * Initializes the TFLite model and tokenizer from assets.
     * Idempotent and thread-safe.
     */
    @Synchronized
    fun init(context: Context): Boolean {
        if (isInitialized && interpreter != null) {
            return true
        }

        try {
            val appContext = context.applicationContext

            // 1. Load tokenizer metadata and vocabulary
            loadTokenizer(appContext)

            // 2. Load model from assets
            val modelBuffer = loadModelFile(appContext, MODEL_FILE)

            // 3. Configure TFLite Interpreter with FlexDelegate for Select TF Ops (Bidirectional LSTM)
            val options = Interpreter.Options().apply {
                setNumThreads(2)
                try {
                    addDelegate(FlexDelegate())
                    if (DEBUG_LOGGING) Log.d(TAG, "FlexDelegate attached for Select TF Ops")
                } catch (t: Throwable) {
                    Log.w(TAG, "FlexDelegate attachment note: ${t.message}")
                }
            }

            val interp = Interpreter(modelBuffer, options)
            interpreter = interp
            isInitialized = true

            if (DEBUG_LOGGING) {
                val inputTensor = interp.getInputTensor(0)
                val outputTensor = interp.getOutputTensor(0)
                Log.d(TAG, "MODEL INITIALIZED successfully from assets/$MODEL_FILE")
                Log.d(TAG, "INPUT SHAPE: ${inputTensor.shape().contentToString()}")
                Log.d(TAG, "INPUT TYPE: ${inputTensor.dataType()}")
                Log.d(TAG, "OUTPUT SHAPE: ${outputTensor.shape().contentToString()}")
                Log.d(TAG, "OUTPUT TYPE: ${outputTensor.dataType()}")
                Log.d(TAG, "VOCABULARY SIZE: ${wordIndex.size}")
                Log.d(TAG, "MAX SEQUENCE LENGTH: $maxSequenceLength")
            }
            return true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize TFLite model or tokenizer: ${e.message}", e)
            interpreter = null
            isInitialized = false
            return false
        }
    }

    /**
     * Preprocesses input text into a [1, maxlen] FloatArray matching the Keras tokenizer pipeline.
     */
    fun preprocess(text: String): Array<FloatArray> {
        val lowerText = if (lower) text.lowercase() else text

        // Replace filter characters with spaces
        val sb = StringBuilder()
        for (ch in lowerText) {
            if (filterSet.contains(ch)) {
                sb.append(' ')
            } else {
                sb.append(ch)
            }
        }

        // Split by whitespace and remove empty tokens
        val rawTokens = sb.toString().split(' ').filter { it.isNotEmpty() }

        // Map tokens to vocabulary IDs (OOV token fallback)
        val tokenIds = rawTokens.map { word ->
            wordIndex[word] ?: oovIndex
        }

        // Truncate to maxlen (default 'pre' keeps the last tokens)
        val truncated = if (tokenIds.size > maxSequenceLength) {
            if (truncating == "post") {
                tokenIds.take(maxSequenceLength)
            } else {
                tokenIds.takeLast(maxSequenceLength)
            }
        } else {
            tokenIds
        }

        // Pad to maxlen with 0.0f (default 'pre' pads zeros at start)
        val padded = FloatArray(maxSequenceLength) { 0f }
        if (padding == "post") {
            for (i in truncated.indices) {
                padded[i] = truncated[i].toFloat()
            }
        } else {
            val offset = maxSequenceLength - truncated.size
            for (i in truncated.indices) {
                padded[offset + i] = truncated[i].toFloat()
            }
        }

        return arrayOf(padded)
    }

    /**
     * Scores the given text using on-device ML model.
     * Public contract: returns a Float in range 0.0 to 1.0 (bullying probability).
     */
    fun scoreText(text: String): Float {
        if (text.isBlank()) {
            return 0.0f
        }

        val interp = interpreter ?: run {
            Log.e(TAG, "scoreText called before Inference.init(context). Returning 0.0f.")
            return 0.0f
        }

        return synchronized(this) {
            try {
                val inputTensor = preprocess(text)
                val outputTensor = Array(1) { FloatArray(1) }

                interp.run(inputTensor, outputTensor)
                val score = outputTensor[0][0]

                if (DEBUG_LOGGING) {
                    Log.d(TAG, "TEXT LENGTH: ${text.length}, SEQUENCE LENGTH: $maxSequenceLength, MODEL SCORE: $score")
                }

                score.coerceIn(0.0f, 1.0f)
            } catch (e: Exception) {
                Log.e(TAG, "Inference execution error: ${e.message}", e)
                0.0f
            }
        }
    }

    /**
     * Release TFLite resources.
     */
    @Synchronized
    fun close() {
        try {
            interpreter?.close()
        } catch (e: Exception) {
            Log.w(TAG, "Error closing TFLite interpreter: ${e.message}")
        }
        interpreter = null
        isInitialized = false
    }

    private fun loadTokenizer(context: Context) {
        val jsonString = context.assets.open(TOKENIZER_FILE).bufferedReader().use { it.readText() }
        val jsonObject = JSONObject(jsonString)

        val wordIndexJson = jsonObject.getJSONObject("word_index")
        val map = HashMap<String, Int>(wordIndexJson.length())
        val keys = wordIndexJson.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            map[key] = wordIndexJson.getInt(key)
        }
        wordIndex = map

        maxSequenceLength = jsonObject.optInt("maxlen", 60)
        oovIndex = jsonObject.optInt("oov_index", 1)
        padding = jsonObject.optString("padding", "post")
        truncating = jsonObject.optString("truncating", "post")
        lower = jsonObject.optBoolean("lower", true)
        val filters = jsonObject.optString("filters", "!\"#$%&()*+,-./:;<=>?@[\\]^_`{|}~\t\n")
        filterSet = filters.toSet()
    }

    private fun loadModelFile(context: Context, modelFilename: String): MappedByteBuffer {
        val fileDescriptor = context.assets.openFd(modelFilename)
        val inputStream = FileInputStream(fileDescriptor.fileDescriptor)
        val fileChannel = inputStream.channel
        val startOffset = fileDescriptor.startOffset
        val declaredLength = fileDescriptor.declaredLength
        return fileChannel.map(FileChannel.MapMode.READ_ONLY, startOffset, declaredLength)
    }
}
