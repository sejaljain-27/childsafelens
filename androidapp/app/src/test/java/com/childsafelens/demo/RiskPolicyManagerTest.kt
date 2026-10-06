package com.childsafelens.demo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RiskPolicyManagerTest {
    @Test
    fun bullyingLabelAlwaysRequiresParentReviewWithoutChangingModelScoreRiskLevel() {
        val policy = RiskPolicyManager.evaluateForClassification(0.2f, "Bullying")

        assertEquals(RiskPolicyManager.RiskLevel.LOW, policy.riskLevel)
        assertTrue(policy.requiresParentApproval)
        assertEquals(60_000L, policy.timeoutMillis)
        assertEquals(RiskPolicyManager.TimeoutAction.KEEP_PENDING, policy.defaultTimeoutAction)
    }

    @Test
    fun cleanLabelKeepsExistingScorePolicy() {
        val policy = RiskPolicyManager.evaluateForClassification(0.2f, "Clean")

        assertFalse(policy.requiresParentApproval)
        assertEquals(0L, policy.timeoutMillis)
        assertEquals(RiskPolicyManager.TimeoutAction.ALLOW, policy.defaultTimeoutAction)
    }
}
