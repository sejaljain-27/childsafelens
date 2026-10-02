package com.childsafelens.demo

/**
 * Manages risk thresholds, risk level mapping, parent approval requirements,
 * and timeout default actions.
 */
object RiskPolicyManager {

    enum class RiskLevel {
        LOW, MEDIUM, HIGH, CRITICAL
    }

    enum class TimeoutAction {
        ALLOW, BLOCK, KEEP_PENDING
    }

    data class PolicyEvaluation(
        val riskLevel: RiskLevel,
        val requiresParentApproval: Boolean,
        val timeoutMillis: Long,
        val defaultTimeoutAction: TimeoutAction
    )

    fun evaluate(score: Float): PolicyEvaluation {
        val riskLevel = when {
            score > 0.85f -> RiskLevel.CRITICAL
            score > 0.65f -> RiskLevel.HIGH
            score > 0.40f -> RiskLevel.MEDIUM
            else -> RiskLevel.LOW
        }

        return when (riskLevel) {
            RiskLevel.CRITICAL -> PolicyEvaluation(
                riskLevel = riskLevel,
                requiresParentApproval = true,
                timeoutMillis = 60_000L, // 60 seconds
                defaultTimeoutAction = TimeoutAction.KEEP_PENDING
            )
            RiskLevel.HIGH -> PolicyEvaluation(
                riskLevel = riskLevel,
                requiresParentApproval = true,
                timeoutMillis = 60_000L,
                defaultTimeoutAction = TimeoutAction.BLOCK
            )
            RiskLevel.MEDIUM -> PolicyEvaluation(
                riskLevel = riskLevel,
                requiresParentApproval = false,
                timeoutMillis = 30_000L,
                defaultTimeoutAction = TimeoutAction.ALLOW
            )
            RiskLevel.LOW -> PolicyEvaluation(
                riskLevel = riskLevel,
                requiresParentApproval = false,
                timeoutMillis = 0L,
                defaultTimeoutAction = TimeoutAction.ALLOW
            )
        }
    }
}
