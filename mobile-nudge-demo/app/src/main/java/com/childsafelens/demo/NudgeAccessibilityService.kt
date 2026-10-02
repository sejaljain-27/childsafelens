package com.childsafelens.demo

import android.accessibilityservice.AccessibilityService
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import kotlin.concurrent.thread

/**
 * PERSON A OWNS THIS FILE.
 *
 * The live capture + decision engine. Listens for text changes in the
 * target field, debounces rapid typing, scores the text off the main
 * thread, and triggers the blocking overlay when the score crosses the
 * threshold. This is the Day 1 -> Day 5 deliverable per the 6-Day plan.
 */
class NudgeAccessibilityService : AccessibilityService() {

    companion object {
        private const val TAG = "NudgeService"
        private const val DEBOUNCE_MS = 300L
        private const val RISK_THRESHOLD = 0.5f
    }

    private lateinit var overlayManager: OverlayManager
    private val handler = Handler(Looper.getMainLooper())
    private var pendingCheck: Runnable? = null

    // Keeps track of the last text we evaluated, so "Edit" doesn't
    // immediately re-trigger on the exact same text.
    private var lastEvaluatedText: String? = null
    private var lastOverlayShownTime = 0L

    override fun onServiceConnected() {
        super.onServiceConnected()
        overlayManager = OverlayManager(applicationContext)
        Log.d(TAG, "Service connected")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent) {
        when (event.eventType) {
            AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED -> {
                // Try to get text from the source node directly (more reliable for EditText)
                val sourceText = event.source?.text?.toString()
                // Fallback to the event's own text list if source is null
                val typedText = sourceText ?: event.text?.joinToString(" ") ?: ""
                
                if (typedText.isNotBlank()) {
                    Log.d(TAG, "Captured text: '$typedText'")
                    scheduleEvaluation(typedText)
                }
            }
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> {
                val eventPkg = event.packageName?.toString()
                Log.d(TAG, "Window state changed: $eventPkg (Overlay showing: ${overlayManager.isShowing})")

                if (overlayManager.isShowing) {
                    val timeSinceShown = System.currentTimeMillis() - lastOverlayShownTime
                    
                    // 1. Ignore if the event is from our own app or the system/keyboard
                    val isSystemOrKeyboard = eventPkg == null || 
                        eventPkg == "android" || 
                        eventPkg == "com.android.systemui" || 
                        eventPkg.contains("inputmethod") || 
                        eventPkg.contains("keyboard")
                    
                    val isSelf = eventPkg == packageName

                    // 2. Ignore any hide requests in the first 1000ms to prevent "blinks"
                    if (timeSinceShown < 1000) {
                        Log.d(TAG, "Ignoring window change during 1s cooldown (pkg=$eventPkg)")
                        return
                    }

                    if (!isSelf && !isSystemOrKeyboard) {
                        Log.d(TAG, "User definitely left app for $eventPkg — clearing overlay")
                        overlayManager.hide()
                    }
                }
            }
        }
    }

    override fun onInterrupt() {
        Log.d(TAG, "Service interrupted")
    }

    override fun onDestroy() {
        super.onDestroy()
        // Safety net: never leak the overlay window if the service dies.
        if (::overlayManager.isInitialized && overlayManager.isShowing) {
            overlayManager.hide()
        }
        pendingCheck?.let { handler.removeCallbacks(it) }
    }

    /**
     * Debounce (Day 3): only evaluate ~300ms after the user stops typing,
     * so fast typing doesn't cause the overlay to flicker on and off or
     * spam inference calls on every keystroke.
     */
    private fun scheduleEvaluation(text: String) {
        pendingCheck?.let { handler.removeCallbacks(it) }
        val runnable = Runnable { evaluateText(text) }
        pendingCheck = runnable
        handler.postDelayed(runnable, DEBOUNCE_MS)
    }

    /**
     * Runs scoring off the main thread (Day 4 fix) so typing never lags,
     * then hops back to the main thread to touch the overlay/window APIs.
     */
    private fun evaluateText(text: String) {
        if (text == lastEvaluatedText && overlayManager.isShowing) return

        thread(name = "nudge-inference") {
            val score = Inference.scoreText(text)
            Log.d(TAG, "Scoring text: '$text' -> score=$score")

            if (score > RISK_THRESHOLD) {
                handler.post {
                    Log.d(TAG, "Risk above threshold ($RISK_THRESHOLD) - Triggering overlay")
                    lastEvaluatedText = text
                    lastOverlayShownTime = System.currentTimeMillis()
                    overlayManager.show(
                        onEdit = {
                            Log.d(TAG, "User chose Edit")
                        },
                        onSendAnyway = {
                            Log.d(TAG, "User chose Send anyway")
                        }
                    )
                    EventLogger.logNudgeEvent(score, System.currentTimeMillis())
                }
            }
        }
    }
}
