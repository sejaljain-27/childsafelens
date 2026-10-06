package com.childsafelens.demo

import android.content.Context
import android.graphics.PixelFormat
import android.graphics.Rect
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.WindowManager
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.TextView
import java.util.concurrent.Executors

/**
 * Manages non-focusable accessibility overlays covering masked incoming text nodes
 * in other apps (non-editable TextViews).
 */
class IncomingOverlayManager(private val context: Context) {

    private val windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    private val activeOverlays = mutableMapOf<String, View>() // Keyed by node text / hash
    private val textCache = mutableMapOf<String, String>() // Cache for Masker.mask results
    private val overlayOriginalText = mutableMapOf<String, String>()
    private val classifierResults = mutableMapOf<String, ClassificationResult>()
    private val classificationRequests = mutableSetOf<String>()
    private val classifierExecutor = Executors.newSingleThreadExecutor()
    private val handler = Handler(Looper.getMainLooper())
    private var pendingUpdate: Runnable? = null

    fun scheduleTraversal(rootNode: AccessibilityNodeInfo?) {
        if (rootNode == null) return
        pendingUpdate?.let { handler.removeCallbacks(it) }
        val runnable = Runnable {
            processNodeTree(rootNode)
        }
        pendingUpdate = runnable
        handler.postDelayed(runnable, 100) // 100ms debounce
    }

    private fun processNodeTree(node: AccessibilityNodeInfo) {
        val newlyCoveredKeys = mutableSetOf<String>()
        traverseAndCover(node, newlyCoveredKeys)
        node.recycle()

        // Remove stale overlays
        val staleKeys = activeOverlays.keys.filter { !newlyCoveredKeys.contains(it) }
        for (key in staleKeys) {
            activeOverlays.remove(key)?.let { view ->
                try {
                    windowManager.removeView(view)
                } catch (e: Exception) {
                    Log.e("IncomingOverlay", "Error removing stale overlay", e)
                }
            }
            overlayOriginalText.remove(key)
        }
    }

    private fun traverseAndCover(node: AccessibilityNodeInfo, coveredKeys: MutableSet<String>) {
        val text = node.text?.toString()
        val className = node.className?.toString() ?: ""

        if (!node.isEditable && !text.isNullOrBlank() && (className.contains("TextView", ignoreCase = true) || node.childCount == 0)) {
            val masked = textCache.getOrPut(text) { Masker.mask(text) }
            if (masked != text) {
                val key = "${node.hashCode()}_$text"
                coveredKeys.add(key)

                val rect = Rect()
                node.getBoundsInScreen(rect)

                if (rect.width() > 0 && rect.height() > 0) {
                    requestClassification(text)
                    val showHint = classifierResults[text]?.label == "Bullying"

                    val existingView = activeOverlays[key]
                    if (existingView != null) {
                        // Update position/params if needed
                        val params = existingView.layoutParams as WindowManager.LayoutParams
                        params.x = rect.left
                        params.y = rect.top
                        params.width = rect.width()
                        params.height = rect.height()
                        try {
                            windowManager.updateViewLayout(existingView, params)
                        } catch (e: Exception) {
                            Log.e("IncomingOverlay", "Error updating overlay layout", e)
                        }
                    } else {
                        // Create new overlay view
                        val overlayView = createOverlayView(masked, showHint)
                        val params = WindowManager.LayoutParams(
                            rect.width(),
                            rect.height(),
                            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
                            PixelFormat.TRANSLUCENT
                        ).apply {
                            gravity = Gravity.TOP or Gravity.START
                            x = rect.left
                            y = rect.top
                        }

                        try {
                            windowManager.addView(overlayView, params)
                            activeOverlays[key] = overlayView
                            overlayOriginalText[key] = text
                        } catch (e: Exception) {
                            Log.e("IncomingOverlay", "Error adding incoming overlay", e)
                        }
                    }
                }
            }
        }

        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            traverseAndCover(child, coveredKeys)
            child.recycle()
        }
    }

    private fun requestClassification(text: String) {
        if (classifierResults.containsKey(text) || !classificationRequests.add(text)) return
        classifierExecutor.execute {
            val result = BackendClassifierClient.classify(text) { rechecked ->
                applyClassificationResult(text, rechecked)
            }
            applyClassificationResult(text, result)
        }
    }

    private fun applyClassificationResult(text: String, result: ClassificationResult) {
        if (result.offlineUnverified) return
        handler.post {
            classifierResults[text] = result
            classificationRequests.remove(text)
            activeOverlays.forEach { (key, view) ->
                if (overlayOriginalText[key] == text) {
                    val maskedText = textCache[text] ?: text
                    (view as? TextView)?.text =
                        if (result.label == "Bullying") "$maskedText  ⚠️ (Hurtful)" else maskedText
                }
            }
        }
    }

    private fun createOverlayView(maskedText: String, showHurtfulHint: Boolean): View {
        val textView = TextView(context).apply {
            text = if (showHurtfulHint) "$maskedText  ⚠️ (Hurtful)" else maskedText
            setTextColor(android.graphics.Color.WHITE)
            setBackgroundColor(android.graphics.Color.parseColor("#CC222222"))
            textSize = 14f
            gravity = Gravity.CENTER_VERTICAL or Gravity.START
            setPadding(8, 2, 8, 2)
        }
        return textView
    }

    fun clearAll() {
        pendingUpdate?.let { handler.removeCallbacks(it) }
        for ((_, view) in activeOverlays) {
            try {
                windowManager.removeView(view)
            } catch (e: Exception) {
                Log.e("IncomingOverlay", "Error removing overlay during clear", e)
            }
        }
        activeOverlays.clear()
        overlayOriginalText.clear()
        classifierResults.clear()
        classificationRequests.clear()
        textCache.clear()
    }
}
