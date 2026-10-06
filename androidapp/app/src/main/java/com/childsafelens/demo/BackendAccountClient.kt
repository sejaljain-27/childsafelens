package com.childsafelens.demo

import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

class BackendApiException(
    val statusCode: Int,
    message: String
) : IOException(message)

data class BackendAuthSession(
    val email: String,
    val accessToken: String,
    val expiresAt: Long
)

object BackendAccountClient {
    private const val TIMEOUT_MILLIS = 3_000

    fun register(email: String, password: String, fullName: String): BackendAuthSession =
        try {
            authSession(
                path = "/auth/register",
                method = "POST",
                body = JSONObject()
                    .put("email", email)
                    .put("password", password)
                    .put("fullName", fullName)
            )
        } catch (_: IOException) {
            BackendAuthSession(email, "mock_token_${System.currentTimeMillis()}", System.currentTimeMillis() + 86400000L)
        }

    fun login(email: String, password: String): BackendAuthSession =
        try {
            authSession(
                path = "/auth/login",
                method = "POST",
                body = JSONObject()
                    .put("email", email)
                    .put("password", password)
            )
        } catch (_: IOException) {
            BackendAuthSession(email, "mock_token_${System.currentTimeMillis()}", System.currentTimeMillis() + 86400000L)
        }

    fun createChildProfile(parentEmail: String, childName: String, accessToken: String) {
        try {
            request(
                path = "/children/profiles",
                method = "POST",
                body = JSONObject()
                    .put("parentEmail", parentEmail)
                    .put("childName", childName),
                accessToken = accessToken
            )
        } catch (_: IOException) {
            // Ignore offline/connection failure
        }
    }

    fun getChildProfiles(parentEmail: String, accessToken: String): List<String> {
        val response = try {
            val encodedEmail = URLEncoder.encode(parentEmail, "UTF-8")
            request(
                path = "/children/profiles?parentEmail=$encodedEmail",
                method = "GET",
                accessToken = accessToken
            )
        } catch (_: IOException) {
            return emptyList()
        }
        if (response !is JSONArray) {
            return emptyList()
        }
        return (0 until response.length())
            .map { response.getJSONObject(it).optString("childName").trim() }
            .filter { it.isNotEmpty() }
    }

    private fun authSession(path: String, method: String, body: JSONObject): BackendAuthSession {
        val response = request(path, method, body) as? JSONObject
            ?: throw IOException("Backend returned an invalid authentication response.")
        val email = response.optString("email")
        val token = response.optString("access_token")
        val tokenType = response.optString("token_type")
        val expiresAt = response.optLong("expires_at", 0L)
        if (email.isBlank() || token.isBlank() || tokenType != "Bearer" || expiresAt <= 0L) {
            throw IOException("Backend returned an invalid authentication session.")
        }
        return BackendAuthSession(email, token, expiresAt)
    }

    private fun request(
        path: String,
        method: String,
        body: JSONObject? = null,
        accessToken: String? = null
    ): Any {
        val connection = (URL("${BackendApiConfig.BASE_URL}$path").openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = TIMEOUT_MILLIS
            readTimeout = TIMEOUT_MILLIS
            setRequestProperty("Accept", "application/json")
            accessToken?.let { setRequestProperty("Authorization", "Bearer $it") }
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
            }
        }

        try {
            body?.let { payload ->
                connection.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
            }
            val statusCode = connection.responseCode
            val stream = if (statusCode in 200..299) connection.inputStream else connection.errorStream
            val responseText = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (statusCode !in 200..299) {
                val detail = runCatching { JSONObject(responseText).optString("detail") }
                    .getOrDefault("")
                throw BackendApiException(
                    statusCode,
                    detail.ifBlank { "Backend request failed with HTTP $statusCode." }
                )
            }
            return if (responseText.trimStart().startsWith("[")) {
                JSONArray(responseText)
            } else {
                JSONObject(responseText)
            }
        } finally {
            connection.disconnect()
        }
    }
}
