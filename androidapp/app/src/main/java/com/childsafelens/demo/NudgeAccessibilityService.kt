package com.childsafelens.demo

import android.accessibilityservice.AccessibilityService
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import java.util.UUID
import kotlin.concurrent.thread

/**
 * PERSON A / SILENT WORKFLOW:
 * Listens for Send button clicks, extracts text, masks inappropriate words,
 * scores silently in the background, creates an Incident, and holds messages in PENDING
 * state awaiting parent decision or 60s timeout without showing any child-facing overlays.
 */
class NudgeAccessibilityService : AccessibilityService() {

    companion object {
        private const val TAG = "NudgeService"

        @Volatile
        var instance: NudgeAccessibilityService? = null
            private set
    }

    private lateinit var incomingOverlayManager: IncomingOverlayManager
    private val handler = Handler(Looper.getMainLooper())

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        incomingOverlayManager = IncomingOverlayManager(applicationContext)
        Inference.init(applicationContext)
        Masker.init(applicationContext)
        IncidentManager.init(applicationContext)
        Log.d(TAG, "Silent Background Service connected")
    }

    fun triggerOverlay(onEdit: () -> Unit, onSendAnyway: () -> Unit) {
        Log.d(TAG, "triggerOverlay called (silent mode active)")
        onEdit()
    }

    fun triggerOverlay(onEdit: () -> Unit, onMaskAndSend: () -> Unit, onSendAnyway: () -> Unit) {
        Log.d(TAG, "triggerOverlay 3-arg called (silent mode active)")
        onMaskAndSend()
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
                    Log.d(TAG, "Send button clicked. Performing true pending hold evaluation...")
                    extractAndEvaluateSilently(event.source, event.packageName?.toString() ?: "unknown")
                }
            }
            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED,
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> {
                val eventPkg = event.packageName?.toString()
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
    }

    private fun extractAndEvaluateSilently(eventSource: AccessibilityNodeInfo?, packageName: String) {
        val rootNode = rootInActiveWindow ?: eventSource ?: return
        val editNode = findEditableNode(rootNode)
        if (editNode != null) {
            val originalText = editNode.text?.toString()
            if (!originalText.isNullOrBlank()) {
                Log.d(TAG, "Extracted text for pending hold: '$originalText'")
                runSilentInferenceAndPolicy(editNode, originalText, packageName)
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

    private fun runSilentInferenceAndPolicy(editNode: AccessibilityNodeInfo, text: String, packageName: String) {
        thread(name = "silent-inference") {
            val score = Inference.scoreText(text)
            val policy = RiskPolicyManager.evaluate(score)
            val maskedText = Masker.mask(text)

            Log.d(TAG, "Score: $score -> RiskLevel: ${policy.riskLevel}, RequiresApproval: ${policy.requiresParentApproval}")

            val incidentId = "INC_${UUID.randomUUID().hashCode().toUInt().toString(16)}"
            IncidentManager.createAndSendIncident(
                incidentId = incidentId,
                type = "OUTGOING",
                message = text,
                riskScore = score,
                riskLevel = policy.riskLevel,
                category = if (policy.riskLevel == RiskPolicyManager.RiskLevel.LOW) "safe" else "potential_cyberbullying",
                packageName = packageName,
                status = if (policy.requiresParentApproval) "PENDING" else "ALLOWED",
                onDecisionReceived = { decision, guidance ->
                    ParentDecisionManager.handleDecision(incidentId, decision, guidance) { result ->
                        executeDecisionSilently(editNode, text, maskedText, result)
                    }
                }
            )

            if (policy.requiresParentApproval) {
                // TRUE PENDING STATE: Hold/clear input immediately so message does NOT send directly
                applyHoldState(editNode)

                // Wait for parent decision or 60s timeout
                PendingMessageManager.holdMessage(incidentId, policy.timeoutMillis) {
                    ParentDecisionManager.handleTimeout(incidentId, policy.defaultTimeoutAction) { result ->
                        executeDecisionSilently(editNode, text, maskedText, result)
                    }
                }
            } else {
                if (maskedText != text) {
                    applyMaskedText(editNode, maskedText)
                }
            }
        }
    }

    private fun applyHoldState(editNode: AccessibilityNodeInfo) {
        handler.post {
            editNode.refresh()
            val args = Bundle().apply {
                putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, "")
            }
            editNode.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
            Log.d(TAG, "Message held in PENDING state. Input field cleared awaiting parent decision.")
        }
    }

    private fun applyMaskedText(editNode: AccessibilityNodeInfo, maskedText: String) {
        handler.post {
            editNode.refresh()
            val args = Bundle().apply {
                putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, maskedText)
            }
            editNode.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
        }
    }

    private fun executeDecisionSilently(
        editNode: AccessibilityNodeInfo,
        originalText: String,
        maskedText: String,
        result: ParentDecisionManager.DecisionResult
    ) {
        handler.post {
            when (result) {
                ParentDecisionManager.DecisionResult.Allow -> {
                    Log.d(TAG, "Parent ALLOWED message. Restoring text and allowing send.")
                    applyMaskedText(editNode, maskedText)
                }
                ParentDecisionManager.DecisionResult.Block -> {
                    Log.d(TAG, "Parent BLOCKED message. Keeping input cleared.")
                    editNode.refresh()
                    val args = Bundle().apply {
                        putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, "")
                    }
                    editNode.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
                }
                is ParentDecisionManager.DecisionResult.Edit -> {
                    Log.d(TAG, "Parent requested EDIT with guidance: ${result.guidance}")
                }
                else -> {}
            }
        }
    }
}
