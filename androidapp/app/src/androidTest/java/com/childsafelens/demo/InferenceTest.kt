package com.childsafelens.demo

import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class InferenceTest {

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val initSuccess = Inference.init(context)
        assertTrue("Inference engine should initialize successfully", initSuccess)
    }

    private fun runTestSentence(category: String, text: String): Float {
        val inputTensor = Inference.preprocess(text)
        val score = Inference.scoreText(text)

        val nonZeroTokens = inputTensor[0].filter { it != 0f }
        val previewTokens = if (nonZeroTokens.size > 15) {
            nonZeroTokens.take(15).toString() + "... total non-zero: ${nonZeroTokens.size}"
        } else {
            nonZeroTokens.toString()
        }

        println("==================================================")
        println("TEST CATEGORY: $category")
        println("TEXT: \"$text\"")
        println("TOKEN IDS (non-zero): $previewTokens")
        println("INPUT TENSOR SHAPE: [1, ${inputTensor[0].size}]")
        println("FINAL SCORE: $score")
        println("==================================================")

        assertTrue("Score must be in range [0.0, 1.0]", score in 0.0f..1.0f)
        return score
    }

    @Test
    fun test1_emptyText() {
        val score = Inference.scoreText("")
        println("==================================================")
        println("TEST CATEGORY: 1. Empty text")
        println("TEXT: \"\"")
        println("FINAL SCORE: $score")
        println("==================================================")
        assertTrue("Empty text score should be 0.0", score == 0.0f)
    }

    @Test
    fun test2_normalFriendlyMessage() {
        val score = runTestSentence("2. Normal friendly message", "How are you today?")
        assertTrue("Friendly message should have low bullying score (< 0.2)", score < 0.20f)
    }

    @Test
    fun test3_clearlyBullyingMessage() {
        val score = runTestSentence("3. Clearly bullying/insulting message", "You are stupid and nobody likes you")
        assertTrue("Bullying message should have high bullying score (> 0.7)", score > 0.70f)
    }

    @Test
    fun test4_anotherBullyingMessage() {
        val score = runTestSentence("4. Another bullying message", "I really hate you and you are ugly")
        assertTrue("Bullying message should have high bullying score (> 0.7)", score > 0.70f)
    }

    @Test
    fun test5_neutralMessage() {
        val score = runTestSentence("5. Neutral message", "Let's meet after college")
        assertTrue("Neutral message should have low bullying score (< 0.2)", score < 0.20f)
    }

    @Test
    fun test6_longMessage() {
        val longMsg = "We should work on the computer science assignment together tomorrow afternoon at the university library before the final submission deadline"
        runTestSentence("6. Long message", longMsg)
    }

    @Test
    fun test7_unknownWords() {
        val unknownMsg = "Zorblaxian quibble flimflam flurble blorp"
        runTestSentence("7. Message containing unknown words", unknownMsg)
    }

    @Test
    fun test8_shorterThan60Tokens() {
        val score = runTestSentence("8. Message shorter than 60 tokens", "Have a great day!")
        assertTrue("Friendly short message should have low bullying score (< 0.2)", score < 0.20f)
    }

    @Test
    fun test9_longerThan60Tokens() {
        val words = (1..75).map { "word$it" }.joinToString(" ")
        runTestSentence("9. Message longer than 60 tokens", words)
    }

    @Test
    fun test10_comparePreAndPostPadding() {
        val testPhrases = listOf(
            "Have a great day!",
            "How are you today?",
            "Let's meet after college",
            "You are stupid and nobody likes you",
            "I really hate you and you are ugly",
            "fuck you bitch",
            "you are such a loser",
            "shut up you idiot"
        )

        println("==================================================")
        println("COMPARISON: PRE vs POST PADDING")
        println("==================================================")
        for (phrase in testPhrases) {
            Inference.setPadding("pre")
            val scorePre = Inference.scoreText(phrase)

            Inference.setPadding("post")
            val scorePost = Inference.scoreText(phrase)

            println(String.format("PHRASE: \"%-38s\" | PRE: %.5f | POST: %.5f", phrase, scorePre, scorePost))
        }
        println("==================================================")
    }
}
