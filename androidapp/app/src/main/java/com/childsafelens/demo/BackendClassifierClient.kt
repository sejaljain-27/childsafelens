package com.childsafelens.demo

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.os.Handler
import android.os.Looper
import android.util.Log
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

data class ClassificationResult(
    val label: String?,
    val riskScore: Float,
    val modelStatus: String,
    val modelVersion: String,
    val developmentSimulation: Boolean,
    val offlineUnverified: Boolean
) {
    val shouldCreateIncident: Boolean
        get() = !offlineUnverified &&
            isTrustedModelResult(modelStatus, modelVersion, developmentSimulation) &&
            label == "Bullying"
}

internal fun isTrustedModelResult(
    modelStatus: String,
    modelVersion: String,
    developmentSimulation: Boolean
): Boolean =
    modelStatus == "real" &&
        modelVersion == "cyberbullying-cascade-v4" &&
        !developmentSimulation

internal object BackendPredictionParser {
    fun parse(response: String): ClassificationResult {
        val json = JSONObject(response)
        val label = json.optString("classification_label")
        if (label != "Bullying" && label != "Clean") {
            throw IOException("Classifier response has an invalid classification label")
        }
        val riskScore = json.optDouble("risk_score", Double.NaN).toFloat()
        if (!riskScore.isFinite() || riskScore !in 0f..1f) {
            throw IOException("Classifier response has an invalid risk score")
        }
        if (!json.has("model_status") || !json.has("model_version")) {
            throw IOException("Classifier response is missing model metadata")
        }
        val modelStatus = json.getString("model_status")
        val developmentSimulation = json.optBoolean("development_simulation", true)
        val modelVersion = json.getString("model_version")
        if (!isTrustedModelResult(modelStatus, modelVersion, developmentSimulation)) {
            throw IOException("Classifier response is not from the supplied cyberbullying model")
        }
        return ClassificationResult(
            label = label,
            riskScore = riskScore,
            modelStatus = modelStatus,
            modelVersion = modelVersion,
            developmentSimulation = developmentSimulation,
            offlineUnverified = false
        )
    }
}

object BackendClassifierClient {
    private const val TAG = "BackendClassifier"
    private val PREDICT_URL: String
        get() = BackendApiConfig.PREDICT_URL
    private const val TIMEOUT_MILLIS = 3_000

    private data class PendingCheck(
        val text: String,
        val onRechecked: (ClassificationResult) -> Unit
    )

    private val executor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())
    private val pendingChecks = mutableListOf<PendingCheck>()
    private var connectivityManager: ConnectivityManager? = null
    private var retryScheduled = false

    @Synchronized
    fun initialize(context: Context) {
        if (connectivityManager != null) return
        val manager = context.applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE)
            as ConnectivityManager
        connectivityManager = manager
        try {
            manager.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    retryPendingChecks()
                }
            })
        } catch (error: Exception) {
            Log.e(TAG, "Unable to register connectivity callback for pending classifications", error)
        }
    }

    fun classify(
        text: String,
        onRechecked: (ClassificationResult) -> Unit
    ): ClassificationResult {
        return try {
            requestClassification(text)
        } catch (error: Exception) {
            Log.w(TAG, "Backend classification unavailable; using offline fallback", error)
            synchronized(this) {
                pendingChecks.add(PendingCheck(text, onRechecked))
            }
            schedulePendingRetry()
            ClassificationResult(
                label = null,
                riskScore = 0f,
                modelStatus = "offline/unverified",
                modelVersion = "offline-unverified",
                developmentSimulation = false,
                offlineUnverified = true
            )
        }
    }

    private fun requestClassification(text: String): ClassificationResult {
        val deadlineNanos = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(TIMEOUT_MILLIS.toLong())
        val connection = (URL(PREDICT_URL).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = TIMEOUT_MILLIS
            readTimeout = TIMEOUT_MILLIS
            doOutput = true
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
            setRequestProperty("Accept", "application/json")
        }

        try {
            val requestBody = JSONObject().put("text", text).toString()
            connection.outputStream.use { output ->
                output.write(requestBody.toByteArray(Charsets.UTF_8))
            }
            val remainingMillis = TimeUnit.NANOSECONDS.toMillis(deadlineNanos - System.nanoTime())
            if (remainingMillis <= 0) throw SocketTimeoutException("Classifier request exceeded 3 seconds")
            connection.readTimeout = remainingMillis.toInt()
            if (connection.responseCode !in 200..299) {
                throw IOException("Classifier endpoint returned HTTP ${connection.responseCode}")
            }
            val responseBody = connection.inputStream.bufferedReader().use { it.readText() }
            return BackendPredictionParser.parse(responseBody)
        } finally {
            connection.disconnect()
        }
    }

    private fun retryPendingChecks() {
        executor.execute {
            val checks = synchronized(this) { pendingChecks.toList() }
            checks.forEach { check ->
                val result = try {
                    requestClassification(check.text)
                } catch (error: Exception) {
                    if (error !is SocketTimeoutException) {
                        Log.w(TAG, "Queued classification is still unavailable", error)
                    }
                    return@forEach
                }
                synchronized(this) { pendingChecks.remove(check) }
                mainHandler.post { check.onRechecked(result) }
            }
            schedulePendingRetry()
        }
    }

    private fun schedulePendingRetry() {
        synchronized(this) {
            if (retryScheduled || pendingChecks.isEmpty()) return
            retryScheduled = true
        }
        mainHandler.postDelayed({
            synchronized(this) { retryScheduled = false }
            retryPendingChecks()
        }, 15_000L)
    }

}
