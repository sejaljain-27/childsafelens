package com.childsafelens.demo

import android.content.Context
import android.util.Log
import com.childsafelens.demo.data.db.AppDatabase
import com.childsafelens.demo.data.model.IncidentEntity
import com.childsafelens.demo.security.SessionManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

/**
 * Manages incident creation, idempotency, local DB persistence,
 * and backend synchronization with FastAPI.
 */
object IncidentManager {
    private const val TAG = "IncidentManager"
    private const val BASE_URL = BackendApiConfig.BASE_URL

    private val scope = CoroutineScope(Dispatchers.IO)
    private var db: AppDatabase? = null
    private var appContext: Context? = null

    fun init(context: Context) {
        appContext = context.applicationContext
        if (db == null) {
            db = AppDatabase.getDatabase(appContext!!)
        }
    }

    fun createAndSendIncident(
        incidentId: String = "INC_${UUID.randomUUID().hashCode().toUInt().toString(16)}",
        type: String,
        message: String,
        riskScore: Float,
        riskLevel: RiskPolicyManager.RiskLevel,
        category: String,
        packageName: String,
        status: String = "PENDING_PARENT_REVIEW",
        onDecisionReceived: (String, String?) -> Unit = { _, _ -> }
    ): String {
        val ctx = appContext ?: return incidentId
        val sessionManager = SessionManager(ctx)
        val parentEmail = sessionManager.getParentEmail()
        val childName = sessionManager.getActiveChildProfile()
        val accessToken = sessionManager.getAccessToken()
        if (parentEmail.isNullOrBlank() || childName.isNullOrBlank() || accessToken.isNullOrBlank()) {
            Log.e(TAG, "Cannot link incident to a parent and child profile; no active account/profile.")
            return incidentId
        }

        val entity = IncidentEntity(
            incidentId = incidentId,
            parentEmail = parentEmail,
            childId = childName,
            childName = childName,
            type = type,
            messageSnippet = message.take(50),
            riskScore = riskScore,
            riskLevel = riskLevel.name,
            category = category,
            packageName = packageName,
            timestamp = System.currentTimeMillis(),
            status = status,
            parentDecision = null
        )

        val database = db
        if (database != null) {
            scope.launch {
                try {
                    database.incidentDao().insert(entity)
                    Log.d(TAG, "Incident saved locally: $incidentId [parent=$parentEmail, child=$childName, status=$status]")
                    val synced = transmitToBackend(entity, message, accessToken)
                    if (status == "PENDING_PARENT_REVIEW" && synced) {
                        pollForDecision(incidentId, accessToken, onDecisionReceived)
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to save or transmit incident", e)
                }
            }
        } else {
            Log.w(TAG, "Database not initialized in IncidentManager")
        }

        return incidentId
    }

    private fun transmitToBackend(
        incident: IncidentEntity,
        messageText: String,
        accessToken: String
    ): Boolean {
        val connection = try {
            (URL("$BASE_URL/incidents").openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                setRequestProperty("Content-Type", "application/json; utf-8")
                setRequestProperty("Accept", "application/json")
                setRequestProperty("Authorization", "Bearer $accessToken")
                doOutput = true
                connectTimeout = 3000
                readTimeout = 3000
            }
        } catch (error: Exception) {
            Log.e(TAG, "Failed to connect to $BASE_URL/incidents", error)
            return false
        }

        return try {
            val json = JSONObject().apply {
                put("incidentId", incident.incidentId)
                put("parentEmail", incident.parentEmail)
                put("childId", incident.childId)
                put("childName", incident.childName)
                put("type", incident.type)
                put("messageSnippet", incident.messageSnippet)
                put("messageText", messageText)
                put("riskScore", incident.riskScore)
                put("riskLevel", incident.riskLevel)
                put("category", incident.category)
                put("packageName", incident.packageName)
                put("timestamp", incident.timestamp)
                put("status", incident.status)
            }
            OutputStreamWriter(connection.outputStream).use { it.write(json.toString()) }
            val responseCode = connection.responseCode
            if (responseCode in 200..299) {
                Log.d(TAG, "Incident synced to parent dashboard: ${incident.incidentId}")
                true
            } else {
                Log.e(TAG, "Incident sync failed with HTTP $responseCode for ${incident.incidentId}")
                false
            }
        } catch (error: Exception) {
            Log.e(TAG, "Failed to transmit incident to $BASE_URL/incidents", error)
            false
        } finally {
            connection.disconnect()
        }
    }

    private fun pollForDecision(
        incidentId: String,
        accessToken: String,
        onDecisionReceived: (String, String?) -> Unit
    ) {
        scope.launch(Dispatchers.IO) {
            var retryDelayMillis = 2000L
            while (true) {
                delay(retryDelayMillis)
                var connection: HttpURLConnection? = null
                try {
                    connection = (URL("$BASE_URL/incidents/$incidentId/decision").openConnection() as HttpURLConnection).apply {
                        requestMethod = "GET"
                        connectTimeout = 2000
                        readTimeout = 2000
                        setRequestProperty("Authorization", "Bearer $accessToken")
                    }

                    if (connection.responseCode == 200) {
                        val responseStr = connection.inputStream.bufferedReader().use { it.readText() }
                        val json = JSONObject(responseStr)
                        val decision = json.optString("parentDecision", "")
                        val guidance = json.optString("guidance").takeUnless { it == "null" || it.isBlank() }

                        if (decision.isNotEmpty() && decision != "null") {
                            Log.d(TAG, "Received parent decision via poll: $decision for incident $incidentId")
                            updateIncidentStatus(incidentId, json.optString("status", "ALLOWED"), decision) { success ->
                                if (success) {
                                    onDecisionReceived(decision, guidance)
                                }
                            }
                            return@launch
                        }
                    }
                    retryDelayMillis = 2000L
                } catch (error: Exception) {
                    retryDelayMillis = (retryDelayMillis * 2).coerceAtMost(15_000L)
                    Log.w(TAG, "Unable to poll parent decision for $incidentId; retrying", error)
                } finally {
                    connection?.disconnect()
                }
            }
        }
    }

    fun updateIncidentStatus(incidentId: String, targetStatus: String, decision: String, onComplete: (Boolean) -> Unit = {}) {
        val database = db
        scope.launch {
            if (database != null) {
                val existing = database.incidentDao().getIncident(incidentId)
                if (existing != null) {
                    val updated = existing.copy(status = targetStatus, parentDecision = decision)
                    database.incidentDao().insert(updated)
                    Log.d(TAG, "Status updated for $incidentId -> $targetStatus (decision=$decision)")
                }
            }
            onComplete(true)
        }
    }
}
