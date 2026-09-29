package com.childsafelens.demo

import android.accessibilityservice.AccessibilityService
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import kotlin.concurrent.thread

/**
 * PERSON A OWNS THIS FILE.
 *
 * The live capture + decision engine. Listens for Send button clicks,
 * extracts text from the input field, masks inappropriate words, scores it off main thread,
 * and triggers blocking overlay or silent auto-send.
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
    private lateinit var incomingOverlayManager: IncomingOverlayManager
    private val handler = Handler(Looper.getMainLooper())

    private var lastEvaluatedText: String? = null
    private var lastOverlayShownTime = 0L

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        overlayManager = OverlayManager(applicationContext)
        incomingOverlayManager = IncomingOverlayManager(applicationContext)
        Inference.init(applicationContext)
        Masker.init(applicationContext)
        Log.d(TAG, "Service connected")
    }

    fun triggerOverlay(onEdit: () -> Unit, onSendAnyway: () -> Unit) {
        handler.post {
            if (::overlayManager.isInitialized) {
                lastOverlayShownTime = System.currentTimeMillis()
                overlayManager.show(onEdit, {}, onSendAnyway)
            }
        }
    }

    fun triggerOverlay(onEdit: () -> Unit, onMaskAndSend: () -> Unit, onSendAnyway: () -> Unit) {
        handler.post {
            if (::overlayManager.isInitialized) {
                lastOverlayShownTime = System.currentTimeMillis()
                overlayManager.show(onEdit, onMaskAndSend, onSendAnyway)
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
                    Log.d(TAG, "Send button clicked. Evaluating and masking input text...")
                    extractAndEvaluateInputText(event.source)
                }
            }
            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED,
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> {
                val eventPkg = event.packageName?.toString()

                if (overlayManager.isShowing) {
                    val timeSinceShown = System.currentTimeMillis() - lastOverlayShownTime
                    val isSystemOrKeyboard = eventPkg == null || 
                        eventPkg == "android" || 
                        eventPkg == "com.android.systemui" || 
                        eventPkg.contains("inputmethod") || 
                        eventPkg.contains("keyboard")
                    
                    val isSelf = eventPkg == packageName

                    if (timeSinceShown >= 1000 && !isSelf && !isSystemOrKeyboard) {
                        Log.d(TAG, "User left app for $eventPkg — clearing overlay")
                        overlayManager.hide()
                    }
                }

                // Incoming message node covering
                if (eventPkg != packageName) {
                    incomingOverlayManager.scheduleTraversal(rootInActiveWindow)
                }
            }
        }
    }

    override fun onInterrupt() {
        Log.d(TAG, "Service interrupted")
    }

    override fun onUnbind(intent: android.content.Intent?): Boolean {
        instance = null
        incomingOverlayManager.clearAll()
        return super.onUnbind(intent)
    }

    override fun onDestroy() {
        super.onDestroy()
        instance = null
        incomingOverlayManager.clearAll()
        if (::overlayManager.isInitialized && overlayManager.isShowing) {
            overlayManager.hide()
        }
    }

    private fun extractAndEvaluateInputText(eventSource: AccessibilityNodeInfo?) {
        val rootNode = rootInActiveWindow ?: eventSource ?: return
        val editNode = findEditableNode(rootNode)
        if (editNode != null) {
            val originalText = editNode.text?.toString()
            if (!originalText.isNullOrBlank()) {
                Log.d(TAG, "Extracted text on send: '$originalText'")
                evaluateAndMaskText(editNode, originalText)
            }
            editNode.recycle()
        }
    }

    private fun findEditableNode(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        if (node.isEditable) {
            return AccessibilityNodeInfo.obtain(node)
        }
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            val result = findEditableNode(child)
            child.recycle()
            if (result != null) return result
        }
        return null
    }

    private fun evaluateAndMaskText(editNode: AccessibilityNodeInfo, text: String) {
        thread(name = "nudge-inference") {
            // 1. Mask text
            val maskedText = Masker.mask(text)
            val wasMasked = maskedText != text

            if (wasMasked) {
                editNode.refresh()
                val args = Bundle().apply {
                    putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, maskedText)
                }
                val setSuccess = editNode.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
                if (setSuccess) {
                    val selArgs = Bundle().apply {
                        putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_START_INT, maskedText.length)
                        putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_END_INT, maskedText.length)
                    }
                    editNode.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, selArgs)
                    Log.d(TAG, "Successfully wrote masked text back to input field.")
                } else {
                    Log.w(TAG, "ACTION_SET_TEXT failed, falling back to original text.")
                }
            }

            // 2. Re-score masked text
            val scoreToEvaluate = if (wasMasked) maskedText else text
            val score = Inference.scoreText(scoreToEvaluate)
            Log.d(TAG, "Scoring text on send -> score=$score (wasMasked=$wasMasked)")

            if (score > RISK_THRESHOLD) {
                handler.post {
                    Log.d(TAG, "Risk above threshold ($RISK_THRESHOLD) - Triggering overlay")
                    lastEvaluatedText = scoreToEvaluate
                    lastOverlayShownTime = System.currentTimeMillis()
                    triggerOverlay(
                        onEdit = {
                            Log.d(TAG, "User chose Edit")
                        },
                        onMaskAndSend = {
                            Log.d(TAG, "User chose Mask & Send")
                            evaluateAndMaskText(editNode, scoreToEvaluate)
                        },
                        onSendAnyway = {
                            Log.d(TAG, "User chose Send anyway")
                        }
                    )
                    EventLogger.logNudgeEvent(score, System.currentTimeMillis())
                }
            } else if (wasMasked) {
                handler.postDelayed({
                    Log.d(TAG, "Silent masking applied and risk <= 0.5. Proceeding to send.")
                }, 150)
            }
        }
    }
}
