package com.childsafelens.demo

import android.os.Handler
import android.os.Looper
import android.util.Log

/**
 * Manages messages held in a pending state while awaiting parent decision or timeout.
 */
object PendingMessageManager {
    private const val TAG = "PendingMsgMgr"
    private val handler = Handler(Looper.getMainLooper())
    private val pendingTimeouts = mutableMapOf<String, Runnable>()

    fun holdMessage(incidentId: String, timeoutMillis: Long, onTimeout: () -> Unit) {
        if (timeoutMillis <= 0) return
        Log.d(TAG, "Holding message for incident $incidentId with timeout ${timeoutMillis}ms")

        val timeoutRunnable = Runnable {
            Log.w(TAG, "Timeout reached for incident $incidentId! Executing default action.")
            pendingTimeouts.remove(incidentId)
            onTimeout()
        }

        pendingTimeouts[incidentId] = timeoutRunnable
        handler.postDelayed(timeoutRunnable, timeoutMillis)
    }

    fun cancelTimeout(incidentId: String) {
        pendingTimeouts.remove(incidentId)?.let {
            handler.removeCallbacks(it)
            Log.d(TAG, "Cancelled timeout for incident $incidentId (decision received)")
        }
    }
}
