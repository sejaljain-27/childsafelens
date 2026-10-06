package com.childsafelens.demo

import android.accessibilityservice.AccessibilityService
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.atomic.AtomicBoolean
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
            } else {
                editNode.recycle()
            }
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
        val ownedNode = AccessibilityNodeInfo.obtain(editNode)
        thread(name = "silent-inference") {
            val incidentId = "INC_${UUID.randomUUID().hashCode().toUInt().toString(16)}"
            val initialResultHandled = CountDownLatch(1)
            val result = BackendClassifierClient.classify(text) { rechecked ->
                initialResultHandled.await()
                val retainedForDecision =
                    handleClassifiedText(ownedNode, text, packageName, incidentId, rechecked)
                if (!retainedForDecision) {
                    ownedNode.recycle()
                }
            }
            val retainedForDecision = try {
                handleClassifiedText(ownedNode, text, packageName, incidentId, result)
            } finally {
                initialResultHandled.countDown()
            }
            if (!result.offlineUnverified && !retainedForDecision) ownedNode.recycle()
        }
    }

    private fun handleClassifiedText(
        editNode: AccessibilityNodeInfo,
        text: String,
        packageName: String,
        incidentId: String,
        result: ClassificationResult
    ): Boolean {
        val maskedText = Masker.mask(text)
        if (result.offlineUnverified) {
            val fallbackPolicy = RiskPolicyManager.evaluate(result.riskScore)
            Log.w(TAG, "Offline/unverified fallback used; queued for backend recheck")
            if (fallbackPolicy.requiresParentApproval) {
                applyHoldState(editNode)
            } else if (maskedText != text) {
                applyMaskedText(editNode, maskedText)
            }
            return false
        }

        if (result.label == "Clean") {
            Log.i(TAG, "Backend classified message as Clean; no incident created")
            applyMaskedText(editNode, text)
            return false
        }
        if (!result.shouldCreateIncident) return false

        val policy = RiskPolicyManager.evaluateForClassification(result.riskScore, result.label.orEmpty())
        Log.d(TAG, "Backend classified Bullying: risk=${policy.riskLevel}, approval=${policy.requiresParentApproval}")
        if (!policy.requiresParentApproval) {
            createVerifiedIncident(text, packageName, incidentId, result, policy)
            applyMaskedText(editNode, maskedText)
            return false
        }

        val decisionHandled = AtomicBoolean(false)
        val handleAction: (ParentDecisionManager.DecisionResult) -> Unit = { action ->
            if (decisionHandled.compareAndSet(false, true)) {
                executeDecisionSilently(editNode, text, maskedText, action)
                editNode.recycle()
            }
        }
        createVerifiedIncident(text, packageName, incidentId, result, policy) { decision, guidance ->
            ParentDecisionManager.handleDecision(incidentId, decision, guidance) { action ->
                handleAction(action)
            }
        }
        applyHoldState(editNode)
        PendingMessageManager.holdMessage(incidentId, policy.timeoutMillis) {
            ParentDecisionManager.handleTimeout(incidentId, policy.defaultTimeoutAction) { action ->
                handleAction(action)
            }
        }
        return true
    }

    private fun createVerifiedIncident(
        text: String,
        packageName: String,
        incidentId: String,
        result: ClassificationResult,
        policy: RiskPolicyManager.PolicyEvaluation = RiskPolicyManager.evaluateForClassification(
            result.riskScore,
            result.label.orEmpty()
        ),
        onDecisionReceived: (String, String?) -> Unit = { _, _ -> }
    ) {
        if (!result.shouldCreateIncident) return
        IncidentManager.createAndSendIncident(
            incidentId = incidentId,
            type = "OUTGOING",
            message = text,
            riskScore = result.riskScore,
            riskLevel = policy.riskLevel,
            category = result.category ?: "potential_cyberbullying",
            packageName = packageName,
            predictionToken = result.predictionToken,
            status = if (policy.requiresParentApproval) "PENDING_PARENT_REVIEW" else "ALLOWED",
            onDecisionReceived = onDecisionReceived
        )
    }

    private fun applyHoldState(editNode: AccessibilityNodeInfo) {
        val node = AccessibilityNodeInfo.obtain(editNode)
        handler.post {
            try {
                node.refresh()
                val args = Bundle().apply {
                    putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, "")
                }
                node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
                Log.d(TAG, "Message held in PENDING state. Input field cleared awaiting parent decision.")
            } finally {
                node.recycle()
            }
        }
    }

    private fun applyMaskedText(editNode: AccessibilityNodeInfo, maskedText: String) {
        val node = AccessibilityNodeInfo.obtain(editNode)
        handler.post {
            try {
                node.refresh()
                val args = Bundle().apply {
                    putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, maskedText)
                }
                node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
            } finally {
                node.recycle()
            }
        }
    }

    private fun executeDecisionSilently(
        editNode: AccessibilityNodeInfo,
        originalText: String,
        maskedText: String,
        result: ParentDecisionManager.DecisionResult
    ) {
        val node = AccessibilityNodeInfo.obtain(editNode)
        handler.post {
            try {
                when (result) {
                    ParentDecisionManager.DecisionResult.Allow -> {
                        Log.d(TAG, "Parent ALLOWED message. Restoring text and allowing send.")
                        applyMaskedText(node, maskedText)
                    }
                    ParentDecisionManager.DecisionResult.Block -> {
                        Log.d(TAG, "Parent BLOCKED message. Keeping input cleared.")
                        node.refresh()
                        val args = Bundle().apply {
                            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, "")
                        }
                        node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
                    }
                    is ParentDecisionManager.DecisionResult.Edit -> {
                        Log.d(TAG, "Parent requested EDIT with guidance: ${result.guidance}")
                    }
                    else -> {}
                }
            } finally {
                node.recycle()
            }
        }
    }
}
