package com.childsafelens.demo

import android.util.Log

/**
 * Processes parent decisions (ALLOW, BLOCK, EDIT, SHOW, HIDE, GUIDANCE)
 * and executes actions silently on the child device.
 */
object ParentDecisionManager {
    private const val TAG = "ParentDecisionMgr"

    sealed class DecisionResult {
        object Allow : DecisionResult()
        object Block : DecisionResult()
        data class Edit(val guidance: String) : DecisionResult()
        object Show : DecisionResult()
        object Hide : DecisionResult()
        data class Guidance(val text: String) : DecisionResult()
        object Timeout : DecisionResult()
    }

    fun handleDecision(
        incidentId: String,
        decision: String,
        guidance: String? = null,
        onExecuteAction: (DecisionResult) -> Unit
    ) {
        PendingMessageManager.cancelTimeout(incidentId)

        val result = when (decision.uppercase()) {
            "ALLOW", "SHOW" -> {
                IncidentManager.updateIncidentStatus(incidentId, "ALLOWED", decision)
                Log.d(TAG, "Parent decision ALLOWED for incident $incidentId")
                DecisionResult.Allow
            }
            "BLOCK", "HIDE" -> {
                IncidentManager.updateIncidentStatus(incidentId, "BLOCKED", decision)
                Log.d(TAG, "Parent decision BLOCKED for incident $incidentId")
                DecisionResult.Block
            }
            "EDIT" -> {
                IncidentManager.updateIncidentStatus(incidentId, "EDIT", decision)
                Log.d(TAG, "Parent decision EDIT for incident $incidentId with guidance: $guidance")
                DecisionResult.Edit(guidance ?: "Try rephrasing this message.")
            }
            "GUIDANCE" -> {
                IncidentManager.updateIncidentStatus(incidentId, "GUIDANCE", decision)
                DecisionResult.Guidance(guidance ?: "A gentle reminder to keep chat respectful.")
            }
            else -> {
                Log.w(TAG, "Unknown parent decision: $decision")
                return
            }
        }

        onExecuteAction(result)
    }

    fun handleTimeout(
        incidentId: String,
        defaultAction: RiskPolicyManager.TimeoutAction,
        onExecuteAction: (DecisionResult) -> Unit
    ) {
        IncidentManager.updateIncidentStatus(incidentId, "TIMEOUT", defaultAction.name)
        Log.w(TAG, "Handling timeout for incident $incidentId with policy default: $defaultAction")

        val result = when (defaultAction) {
            RiskPolicyManager.TimeoutAction.ALLOW -> DecisionResult.Allow
            RiskPolicyManager.TimeoutAction.BLOCK -> DecisionResult.Block
            RiskPolicyManager.TimeoutAction.KEEP_PENDING -> {
                Log.d(TAG, "Timeout policy is KEEP_PENDING for incident $incidentId. Continuing to wait.")
                return
            }
        }

        onExecuteAction(result)
    }
}
