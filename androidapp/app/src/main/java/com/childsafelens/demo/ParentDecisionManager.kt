package com.childsafelens.demo

import android.util.Log

/**
 * Manages parent decisions (ALLOW, BLOCK, EDIT) with reliable state updates
 * and idempotency protection.
 */
object ParentDecisionManager {
    private const val TAG = "ParentDecisionMgr"

    sealed class DecisionResult {
        object Allow : DecisionResult()
        object Block : DecisionResult()
        data class Edit(val guidance: String, val editedContent: String?) : DecisionResult()
        object Timeout : DecisionResult()
    }

    fun handleBlock(incidentId: String, onExecuteAction: (DecisionResult) -> Unit) {
        IncidentManager.updateIncidentStatus(incidentId, "BLOCKED", "BLOCK") { success ->
            Log.d(TAG, "Decision executed -> BLOCKED for incident $incidentId")
            onExecuteAction(DecisionResult.Block)
        }
    }

    fun handleEdit(incidentId: String, guidance: String?, editedContent: String?, onExecuteAction: (DecisionResult) -> Unit) {
        IncidentManager.updateIncidentStatus(incidentId, "EDIT_REQUIRED", "EDIT") { success ->
            Log.d(TAG, "Decision executed -> EDIT_REQUIRED for incident $incidentId")
            onExecuteAction(DecisionResult.Edit(guidance ?: "Please rephrase your message before sending.", editedContent))
        }
    }

    fun handleAllow(incidentId: String, onExecuteAction: (DecisionResult) -> Unit) {
        IncidentManager.updateIncidentStatus(incidentId, "ALLOWED", "ALLOW") { success ->
            Log.d(TAG, "Decision executed -> ALLOWED for incident $incidentId")
            onExecuteAction(DecisionResult.Allow)
        }
    }

    fun handleDecision(
        incidentId: String,
        decision: String,
        guidance: String? = null,
        editedContent: String? = null,
        onExecuteAction: (DecisionResult) -> Unit
    ) {
        PendingMessageManager.cancelTimeout(incidentId)

        when (decision.uppercase()) {
            "ALLOW", "SHOW" -> handleAllow(incidentId, onExecuteAction)
            "BLOCK", "HIDE" -> handleBlock(incidentId, onExecuteAction)
            "EDIT" -> handleEdit(incidentId, guidance, editedContent, onExecuteAction)
            else -> {
                Log.w(TAG, "Unknown decision: $decision, defaulting to ALLOW")
                handleAllow(incidentId, onExecuteAction)
            }
        }
    }

    fun handleTimeout(
        incidentId: String,
        defaultAction: RiskPolicyManager.TimeoutAction,
        onExecuteAction: (DecisionResult) -> Unit
    ) {
        Log.w(TAG, "Handling timeout for incident $incidentId with policy default: $defaultAction")
        when (defaultAction) {
            RiskPolicyManager.TimeoutAction.ALLOW -> handleAllow(incidentId, onExecuteAction)
            RiskPolicyManager.TimeoutAction.BLOCK -> handleBlock(incidentId, onExecuteAction)
            RiskPolicyManager.TimeoutAction.KEEP_PENDING -> {
                Log.d(TAG, "Timeout policy is KEEP_PENDING. Continuing to wait.")
            }
        }
    }
}
