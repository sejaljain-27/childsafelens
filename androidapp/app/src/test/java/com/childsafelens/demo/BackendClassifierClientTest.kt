package com.childsafelens.demo

import org.junit.Assert.assertFalse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class BackendClassifierClientTest {

    @Test
    fun classifierAndIncidentRequestsShareTheBackendHost() {
        assertEquals("${BackendApiConfig.BASE_URL}/predict", BackendApiConfig.PREDICT_URL)
    }

    @Test
    fun verifiedCleanDoesNotCreateIncident() {
        assertFalse(
            ClassificationResult(
                label = "Clean",
                riskScore = 0f,
                modelStatus = "real",
                modelVersion = "cyberbullying-cascade-v4",
                developmentSimulation = false,
                offlineUnverified = false
            ).shouldCreateIncident
        )
    }

    @Test
    fun verifiedBullyingCreatesIncident() {
        assertTrue(
            ClassificationResult(
                label = "Bullying",
                riskScore = 0.9f,
                modelStatus = "real",
                modelVersion = "cyberbullying-cascade-v4",
                developmentSimulation = false,
                offlineUnverified = false
            ).shouldCreateIncident
        )
    }

    @Test
    fun offlineFallbackNeverCreatesIncident() {
        assertFalse(
            ClassificationResult(
                label = null,
                riskScore = 0.99f,
                modelStatus = "offline/unverified",
                modelVersion = "offline-unverified",
                developmentSimulation = false,
                offlineUnverified = true
            ).shouldCreateIncident
        )
    }

    @Test
    fun dummyClassifierResultNeverCreatesIncident() {
        assertFalse(
            ClassificationResult(
                label = "Bullying",
                riskScore = 0.9f,
                modelStatus = "dummy",
                modelVersion = "dummy-dev",
                developmentSimulation = true,
                offlineUnverified = false
            ).shouldCreateIncident
        )
    }

    @Test
    fun onlyRealNonSimulationModelResultsAreTrusted() {
        assertTrue(isTrustedModelResult("real", "cyberbullying-cascade-v4", false))
        assertFalse(isTrustedModelResult("dummy", "dummy-dev", true))
        assertFalse(isTrustedModelResult("real", "another-model", false))
        assertFalse(isTrustedModelResult("real", "cyberbullying-cascade-v4", true))
    }
}
