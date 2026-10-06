package com.childsafelens.demo

import android.util.Log
import java.net.HttpURLConnection
import java.net.URL

object BackendApiConfig {
    private const val TAG = "BackendApiConfig"

    val candidateBaseUrls = listOf(
        "http://10.0.2.2:8000",
        "http://10.46.19.193:8000",
        "http://192.168.1.100:8000",
        "http://localhost:8000",
        "http://127.0.0.1:8000"
    )

    @Volatile
    private var cachedWorkingBaseUrl: String? = null

    val BASE_URL: String
        get() = getBaseUrl()

    val PREDICT_URL: String
        get() = "${getBaseUrl()}/predict"

    fun getBaseUrl(): String {
        cachedWorkingBaseUrl?.let { return it }
        for (candidate in candidateBaseUrls) {
            try {
                val connection = (URL("$candidate/").openConnection() as HttpURLConnection).apply {
                    requestMethod = "GET"
                    connectTimeout = 800
                    readTimeout = 800
                }
                val code = connection.responseCode
                connection.disconnect()
                if (code in 200..499) {
                    cachedWorkingBaseUrl = candidate
                    Log.i(TAG, "Found working backend base URL: $candidate")
                    return candidate
                }
            } catch (_: Exception) {
                // Try next
            }
        }
        return candidateBaseUrls.first()
    }
}
