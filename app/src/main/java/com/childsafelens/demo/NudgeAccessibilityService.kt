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
 * The live capture + decision engine. Listens for Send button clicks,
 * extracts text from the input field, scores it off the main thread,
 * and triggers the blocking overlay when the score crosses the threshold.
 */
class NudgeAccessibilityService : AccessibilityService() {

    companion object {
        private const val TAG = "NudgeService"
        private const val RISK_THRESHOLD = 0.5f

        @Volatile
        var instance: NudgeAccessibilityService? = null
            private set
    }

    private lateinit var overlayManager: OverlayManager
    private val handler = Handler(Looper.getMainLooper())

    // Keeps track of the last text we evaluated, so "Edit" doesn't
    // immediately re-trigger on the exact same text.
    private var lastEvaluatedText: String? = null
    private var lastOverlayShownTime = 0L

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        overlayManager = OverlayManager(applicationContext)
        Inference.init(applicationContext)
        Log.d(TAG, "Service connected")
    }

    fun triggerOverlay(onEdit: () -> Unit, onSendAnyway: () -> Unit) {
        handler.post {
            if (::overlayManager.isInitialized) {
                lastOverlayShownTime = System.currentTimeMillis()
                overlayManager.show(onEdit, onSendAnyway)
            }
        }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent) {
        when (event.eventType) {
            AccessibilityEvent.TYPE_VIEW_CLICKED -> {
                val source = event.source
                val viewId = source?.viewIdResourceName ?: ""
                val nodeText = event.text?.joinToString(" ") ?: ""
                val sourceText = source?.text?.toString() ?: ""
                val className = event.className?.toString() ?: ""
                source?.recycle()

                val isSendClick = viewId.contains("send", ignoreCase = true) ||
                    nodeText.contains("send", ignoreCase = true) ||
                    sourceText.contains("send", ignoreCase = true) ||
                    (className.contains("Button", ignoreCase = true) && (viewId.contains("send", ignoreCase = true) || nodeText.contains("send", ignoreCase = true) || sourceText.contains("send", ignoreCase = true)))

                if (isSendClick) {
                    Log.d(TAG, "Send button clicked (viewId=$viewId, text=$nodeText). Evaluating input text...")
                    extractAndEvaluateInputText()
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

    override fun onUnbind(intent: android.content.Intent?): Boolean {
        instance = null
        return super.onUnbind(intent)
    }

    override fun onDestroy() {
        super.onDestroy()
        instance = null
        // Safety net: never leak the overlay window if the service dies.
        if (::overlayManager.isInitialized && overlayManager.isShowing) {
            overlayManager.hide()
        }
    }

    private fun extractAndEvaluateInputText() {
        val rootNode = rootInActiveWindow ?: return
        val textToEvaluate = findEditTextContent(rootNode)
        if (!textToEvaluate.isNullOrBlank()) {
            Log.d(TAG, "Extracted text on send: '$textToEvaluate'")
            evaluateTextOnSend(textToEvaluate)
        }
    }

    private fun findEditTextContent(node: android.view.accessibility.AccessibilityNodeInfo): String? {
        if (node.isEditable && !node.text.isNullOrEmpty()) {
            return node.text.toString()
        }
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            val result = findEditTextContent(child)
            child.recycle()
            if (result != null) return result
        }
        return null
    }

    /**
     * Runs scoring off the main thread when Send is pressed,
     * then hops back to the main thread to trigger the overlay if risk is high.
     */
    private fun evaluateTextOnSend(text: String) {
        if (text == lastEvaluatedText && overlayManager.isShowing) return

        thread(name = "nudge-inference") {
            val score = Inference.scoreText(text)
            Log.d(TAG, "Scoring text on send: '$text' -> score=$score")

            if (score > RISK_THRESHOLD) {
                handler.post {
                    Log.d(TAG, "Risk above threshold ($RISK_THRESHOLD) on send - Triggering overlay")
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
