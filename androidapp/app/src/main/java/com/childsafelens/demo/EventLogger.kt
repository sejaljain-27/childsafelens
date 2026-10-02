package com.childsafelens.demo

import android.content.Context
import android.util.Log
import com.childsafelens.demo.data.db.AppDatabase
import com.childsafelens.demo.data.model.NudgeEventEntity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * PERSON C OWNS THIS FILE.
 *
 * Replaced the Logcat-only stub with Room persistence.
 * The original signature `logNudgeEvent(riskLevel: Float, timestamp: Long)`
 * is kept unchanged to satisfy Person A's caller interface, delegating to an overload.
 */
object EventLogger {

    private var db: AppDatabase? = null
    private val scope = CoroutineScope(Dispatchers.IO)

    fun init(context: Context) {
        if (db == null) {
            db = AppDatabase.getDatabase(context.applicationContext)
        }
    }

    // Unchanged signature
    fun logNudgeEvent(riskLevel: Float, timestamp: Long) {
        logNudgeEvent(riskLevel, timestamp, "OUTGOING", "SYSTEM_ACCESSIBILITY")
    }

    // Overload for rich dashboard storage
    fun logNudgeEvent(riskLevel: Float, timestamp: Long, direction: String, messageId: String) {
        Log.d("EventLogger", "nudge_triggered: risk=$riskLevel at=$timestamp dir=$direction msg=$messageId")
        
        val database = db
        if (database != null) {
            scope.launch {
                try {
                    val event = NudgeEventEntity(
                        riskLevel = riskLevel,
                        timestamp = timestamp,
                        direction = direction,
                        messageId = messageId
                    )
                    database.nudgeEventDao().insert(event)
                } catch (e: Exception) {
                    Log.e("EventLogger", "Failed to insert nudge event to DB", e)
                }
            }
        } else {
            Log.w("EventLogger", "Database not initialized. Call EventLogger.init(context) first.")
        }
    }
}
