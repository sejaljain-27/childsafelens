package com.childsafelens.demo

import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MaskerTest {

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        Masker.ensureInitialized(context)
    }

    @Test
    fun testFuuuuckIdiot() {
        val input = "you are a fuuuuck idiot"
        val masked = Masker.mask(input)
        // "fuuuuck" and "idiot" should be masked
        assertEquals("you are a ******* *****", masked)
    }

    @Test
    fun testLeetFuck() {
        val input = "f@ck"
        val masked = Masker.mask(input)
        assertEquals("****", masked)
    }

    @Test
    fun testLeetIdiotExclamation() {
        val input = "id1ot!!"
        val masked = Masker.mask(input)
        assertEquals("*****!!", masked)
    }

    @Test
    fun testNigerIsACountryUnchanged() {
        val input = "niger is a country"
        val masked = Masker.mask(input)
        // "niger" should remain unchanged (2-letter rule, not 'nigger')
        assertEquals("niger is a country", masked)
    }

    @Test
    fun testBigSaleTodayUnchanged() {
        val input = "big sale today"
        val masked = Masker.mask(input)
        // "sale" should remain unchanged (not 'saale')
        assertEquals("big sale today", masked)
    }

    @Test
    fun testSaaleKutte() {
        val input = "saale kutte"
        val masked = Masker.mask(input)
        assertEquals("***** *****", masked)
    }

    @Test
    fun testGoKillYourselfNow() {
        val input = "go kill yourself now"
        val masked = Masker.mask(input)
        // "go kill yourself" is a phrase
        assertEquals("**************** now", masked)
    }

    @Test
    fun testTeriMaaKi() {
        val input = "teri maa ki"
        val masked = Masker.mask(input)
        assertEquals("***********", masked)
    }
}
