package com.childsafelens.demo

import android.content.Context
import android.util.Log

/**
 * Pure, unit-testable word and phrase masker driven by bad_words.txt.
 * Implements leet normalization, repetition shortening (3+ runs to 1 and 2),
 * whole-word matching, and multi-word phrase matching.
 */
object Masker {
    private const val TAG = "Masker"

    private val singleWordSet = HashSet<String>()
    private val phraseSet = HashSet<String>()
    private var isInitialized = false

    @Synchronized
    fun init(context: Context): Boolean {
        if (isInitialized && singleWordSet.isNotEmpty()) return true
        try {
            val appContext = context.applicationContext
            val inputStream = appContext.assets.open("bad.txt")
            singleWordSet.clear()
            phraseSet.clear()

            inputStream.bufferedReader().useLines { lines ->
                for (line in lines) {
                    val trimmed = line.trim()
                    if (trimmed.isEmpty() || trimmed.startsWith("#")) continue
                    val normalized = normalizeString(trimmed)
                    if (normalized.isEmpty()) continue

                    if (normalized.contains(" ")) {
                        phraseSet.add(normalized)
                    } else {
                        singleWordSet.add(normalized)
                    }
                }
            }
            isInitialized = true
            Log.d(TAG, "SUCCESS: Loaded ${singleWordSet.size} single words and ${phraseSet.size} phrases into Masker.")
            return true
        } catch (e: Exception) {
            Log.e(TAG, "FAILED to load bad.txt: ${e.message}", e)
            isInitialized = false
            return false
        }
    }

    fun ensureInitialized(context: Context) {
        if (!isInitialized || singleWordSet.isEmpty()) {
            init(context)
        }
    }

    fun leetNormalize(token: String): String {
        val sb = StringBuilder()
        for (ch in token) {
            sb.append(
                when (ch) {
                    '0' -> 'o'
                    '1' -> 'i'
                    '3' -> 'e'
                    '4' -> 'a'
                    '5' -> 's'
                    '@' -> 'a'
                    '$' -> 's'
                    '7' -> 't'
                    else -> ch.lowercaseChar()
                }
            )
        }
        return sb.toString()
    }

    fun shortenRuns(s: String, targetLen: Int): String {
        val sb = StringBuilder()
        var i = 0
        while (i < s.length) {
            var j = i
            while (j < s.length && s[j] == s[i]) {
                j++
            }
            val runLength = j - i
            if (runLength >= 3) {
                repeat(targetLen) { sb.append(s[i]) }
            } else {
                repeat(runLength) { sb.append(s[i]) }
            }
            i = j
        }
        return sb.toString()
    }

    private fun normalizeToken(token: String): String {
        val leet = leetNormalize(token)
        return shortenRuns(leet, 1)
    }

    private fun isTokenBad(token: String): Boolean {
        val leet = leetNormalize(token)
        val short1 = shortenRuns(leet, 1)
        val short2 = shortenRuns(leet, 2)
        return singleWordSet.contains(leet) ||
            singleWordSet.contains(short1) ||
            singleWordSet.contains(short2)
    }

    private fun normalizeString(s: String): String {
        val regex = Regex("[\\p{L}\\p{N}@$]+")
        val tokens = regex.findAll(s).map { it.value }
        return tokens.map { normalizeToken(it) }.joinToString(" ")
    }

    data class TokenInfo(
        val start: Int,
        val end: Int,
        val value: String,
        val normalized: String
    )

    fun mask(text: String): String {
        if (text.isEmpty()) return text
        if (!isInitialized || singleWordSet.isEmpty()) {
            Log.w(TAG, "Masker.mask called before successful init! Attempting emergency init.")
            // Try emergency init using app context if possible, or return text
            return text
        }

        val regex = Regex("[\\p{L}\\p{N}@$]+")
        val matches = regex.findAll(text).toList()
        if (matches.isEmpty()) return text

        val tokens = matches.map { match ->
            val tokenStr = match.value
            val leet = leetNormalize(tokenStr)
            val norm = shortenRuns(leet, 1)
            TokenInfo(match.range.first, match.range.last + 1, tokenStr, norm)
        }

        val maskSpans = mutableListOf<Pair<Int, Int>>()

        // 1. Check phrases
        val maxPhraseLen = phraseSet.maxOfOrNull { it.split(" ").size } ?: 5
        val coveredTokens = BooleanArray(tokens.size)

        for (len in minOf(maxPhraseLen, tokens.size) downTo 2) {
            for (i in 0..tokens.size - len) {
                var alreadyCovered = false
                for (k in i until i + len) {
                    if (coveredTokens[k]) {
                        alreadyCovered = true
                        break
                    }
                }
                if (alreadyCovered) continue

                val windowTokens = tokens.subList(i, i + len)
                val phraseNorm = windowTokens.joinToString(" ") { it.normalized }
                if (phraseSet.contains(phraseNorm)) {
                    val startPos = windowTokens.first().start
                    val endPos = windowTokens.last().end
                    maskSpans.add(Pair(startPos, endPos))
                    for (k in i until i + len) {
                        coveredTokens[k] = true
                    }
                }
            }
        }

        // 2. Check individual tokens
        for (i in tokens.indices) {
            if (coveredTokens[i]) continue
            val token = tokens[i]
            if (isTokenBad(token.value)) {
                maskSpans.add(Pair(token.start, token.end))
                coveredTokens[i] = true
            }
        }

        if (maskSpans.isEmpty()) return text

        maskSpans.sortBy { it.first }
        val mergedSpans = mutableListOf<Pair<Int, Int>>()
        var current = maskSpans[0]
        for (i in 1 until maskSpans.size) {
            val next = maskSpans[i]
            if (next.first <= current.second) {
                current = Pair(current.first, maxOf(current.second, next.second))
            } else {
                mergedSpans.add(current)
                current = next
            }
        }
        mergedSpans.add(current)

        val sb = StringBuilder(text)
        for (span in mergedSpans) {
            for (i in span.first until span.second) {
                sb[i] = '*'
            }
        }

        return sb.toString()
    }
}
