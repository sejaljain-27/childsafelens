package com.childsafelens.demo

/**
 * PERSON B OWNS THIS FILE.
 *
 * Interface contract (do not change the signature — Person A's code calls
 * this exact function and never needs to change once you plug in the real
 * model):
 *
 *     fun scoreText(text: String): Float   // returns 0.0–1.0 risk score
 *
 * Currently a STUB using a hardcoded keyword list, so Person A and Person C
 * can build and test end-to-end without waiting on the real model.
 *
 * To go live (per the 6-Day plan, Day 3–4):
 *   1. Export the trained TF-IDF + LinearSVC model to ONNX (skl2onnx).
 *   2. Port preprocessing + feature extraction from the Python training
 *      pipeline into Kotlin (must match Python output exactly on the same
 *      test sentences).
 *   3. Add the onnxruntime-android dependency in app/build.gradle.kts
 *      (already present, commented out).
 *   4. Load the .onnx file (put it in app/src/main/assets/model.onnx) with
 *      OrtEnvironment + OrtSession, run inference here, and return the
 *      real score instead of the stub below.
 *
 * IMPORTANT: this function may be called off the main thread (Person A
 * runs it on a background thread to avoid UI jank) — make sure your ONNX
 * session usage is thread-safe, or synchronize access to it.
 */
object Inference {

    // TEMP — replace this whole implementation, keep the function signature.
    private val stubRiskyKeywords = listOf(
        "stupid", "idiot", "hate you", "ugly", "loser", "dumb", "shut up"
    )

    fun scoreText(text: String): Float {
        val lower = text.lowercase()
        val hit = stubRiskyKeywords.any { lower.contains(it) }
        return if (hit) 0.9f else 0.1f
    }
}
