package com.childsafelens.demo

import android.os.SystemClock
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.childsafelens.demo.data.model.Message
import com.childsafelens.demo.data.model.RiskLevel
import com.childsafelens.demo.ui.viewmodel.ChatViewModel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class BackendClassifierClientInstrumentedTest {

    @Test(expected = java.io.IOException::class)
    fun rejectsDevelopmentBackendPredictionContract() {
        BackendPredictionParser.parse(
            """
            {
              "risk_score": 0.9,
              "classification_label": "Bullying",
              "model_status": "dummy",
              "model_version": "dummy-dev",
              "development_simulation": true
            }
            """.trimIndent()
        )
    }

    @Test
    fun parsesRealPklBackendPrediction() {
        val result = BackendPredictionParser.parse(
            """
            {
              "risk_score": 0.05,
              "classification_label": "Clean",
              "model_status": "real",
              "model_version": "cyberbullying-cascade-v4",
              "development_simulation": false
            }
            """.trimIndent()
        )

        assertEquals("Clean", result.label)
        assertEquals("cyberbullying-cascade-v4", result.modelVersion)
        assertFalse(result.shouldCreateIncident)
    }

    @Test
    fun cleanMessageReachesBackendAndPassesWithoutParentApproval() {
        val result = BackendClassifierClient.classify("hello, see you soon") {}

        assertFalse("Android must receive a verified backend result", result.offlineUnverified)
        assertEquals("Clean", result.label)
        assertEquals("real", result.modelStatus)
        assertEquals("cyberbullying-cascade-v4", result.modelVersion)
        assertFalse(result.developmentSimulation)
        assertFalse(RiskPolicyManager.evaluate(result.riskScore).requiresParentApproval)
    }

    @Test
    fun bullyingMessageReachesBackendAndRequiresParentApproval() {
        val result = BackendClassifierClient.classify("you are an idiot") {}

        assertFalse("Android must receive a verified backend result", result.offlineUnverified)
        assertEquals("Bullying", result.label)
        assertEquals("real", result.modelStatus)
        assertEquals("cyberbullying-cascade-v4", result.modelVersion)
        assertFalse(result.developmentSimulation)
        assertTrue(result.shouldCreateIncident)
        assertTrue(
            RiskPolicyManager.evaluateForClassification(result.riskScore, result.label.orEmpty())
                .requiresParentApproval
        )
    }

    @Test
    fun chatSendDisplaysMessageAfterBackendReturnsClean() {
        var viewModel: ChatViewModel? = null
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            viewModel = ChatViewModel(ApplicationProvider.getApplicationContext())
            viewModel?.sendMessage("hello, see you soon")
        }

        val deadline = SystemClock.uptimeMillis() + 10_000
        var message: Message? = null
        while (SystemClock.uptimeMillis() < deadline) {
            InstrumentationRegistry.getInstrumentation().runOnMainSync {
                message = viewModel?.messages?.value?.lastOrNull()
            }
            if (message?.displayText == "hello, see you soon") break
            SystemClock.sleep(100)
        }

        assertEquals("hello, see you soon", message?.displayText)
        assertEquals(RiskLevel.SAFE, message?.riskLevel)
        assertTrue(message?.visibleToReceiver == true)
    }

    @Test
    fun chatSendKeepsPklBullyingMessageHiddenForParentReview() {
        var viewModel: ChatViewModel? = null
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            viewModel = ChatViewModel(ApplicationProvider.getApplicationContext())
            viewModel?.sendMessage("you are an idiot")
        }

        val deadline = SystemClock.uptimeMillis() + 10_000
        var message: Message? = null
        while (SystemClock.uptimeMillis() < deadline) {
            InstrumentationRegistry.getInstrumentation().runOnMainSync {
                message = viewModel?.messages?.value?.lastOrNull()
            }
            if (message?.classificationStatus == "Backend verified") break
            SystemClock.sleep(100)
        }

        assertEquals("Backend verified", message?.classificationStatus)
        assertEquals(RiskLevel.HIGH, message?.riskLevel)
        assertFalse(message?.visibleToReceiver == true)
        assertEquals("", message?.displayText)
    }
}
