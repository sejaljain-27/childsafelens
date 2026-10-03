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
 * and backend synchronization with FastAPI on port 8500.
 */
object IncidentManager {
    private const val TAG = "IncidentManager"
    private const val BASE_URL = "http://10.46.19.193:8001"

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
        val parentEmail = sessionManager.getParentEmail() ?: "parent@test.com"
        val childName = sessionManager.getActiveChildProfile() ?: "Aarav"

        val entity = IncidentEntity(
            incidentId = incidentId,
            parentEmail = parentEmail,
            childId = "default_child",
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
                    transmitToBackend(entity)

                    if (status == "PENDING_PARENT_REVIEW") {
                        pollForDecision(incidentId, onDecisionReceived)
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

    private fun transmitToBackend(incident: IncidentEntity) {
        scope.launch(Dispatchers.IO) {
            try {
                val url = URL("$BASE_URL/incidents")
                val conn = (url.openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    setRequestProperty("Content-Type", "application/json; utf-8")
                    setRequestProperty("Accept", "application/json")
                    doOutput = true
                    connectTimeout = 3000
                    readTimeout = 3000
                }

                val json = JSONObject().apply {
                    put("incidentId", incident.incidentId)
                    put("parentEmail", incident.parentEmail)
                    put("childId", incident.childId)
                    put("childName", incident.childName)
                    put("type", incident.type)
                    put("messageSnippet", incident.messageSnippet)
                    put("riskScore", incident.riskScore)
                    put("riskLevel", incident.riskLevel)
                    put("category", incident.category)
                    put("packageName", incident.packageName)
                    put("timestamp", incident.timestamp)
                    put("status", incident.status)
                }

                OutputStreamWriter(conn.outputStream).use { it.write(json.toString()) }
                val responseCode = conn.responseCode
                Log.d(TAG, "Incident transmission response: $responseCode")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to transmit incident to $BASE_URL/incidents: ${e.message}", e)
            }
        }
    }

    private fun pollForDecision(incidentId: String, onDecisionReceived: (String, String?) -> Unit) {
        scope.launch(Dispatchers.IO) {
            val maxAttempts = 60 // poll for up to 120 seconds
            var attempts = 0
            while (attempts < maxAttempts) {
                try {
                    delay(2000L)
                    attempts++
                    val url = URL("$BASE_URL/incidents/$incidentId/decision")
                    val conn = (url.openConnection() as HttpURLConnection).apply {
                        requestMethod = "GET"
                        connectTimeout = 2000
                        readTimeout = 2000
                    }

                    if (conn.responseCode == 200) {
                        val responseStr = conn.inputStream.bufferedReader().use { it.readText() }
                        val json = JSONObject(responseStr)
                        val decision = json.optString("parentDecision", "")
                        val guidance = json.optString("guidance", null)

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
                } catch (e: Exception) {
                    // Ignore network polling blips while offline
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
