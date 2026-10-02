package com.childsafelens.demo

import android.content.Context
import android.graphics.PixelFormat
import android.provider.Settings
import android.util.Log
import android.view.LayoutInflater
import android.view.View
import android.view.WindowManager
import android.widget.Button

/**
 * PERSON A OWNS THIS FILE.
 *
 * Draws and removes the full-screen "nudge" overlay window on top of
 * whatever the child is looking at. This is what physically prevents the
 * child from reaching the Send button underneath while it's showing.
 *
 * Deliberately has NO FLAG_NOT_TOUCH_MODAL — that flag would let touches
 * pass through to the app below around/outside the overlay's own views.
 * Since our overlay is full-screen and modal by default, all touches are
 * consumed by the overlay until the user taps Edit or Send Anyway.
 */
class OverlayManager(private val context: Context) {

    private val windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    private var overlayView: View? = null

    val isShowing: Boolean
        get() = overlayView != null

    fun show(onEdit: () -> Unit, onSendAnyway: () -> Unit) {
        // Log permission status to help debugging
        val canDraw = Settings.canDrawOverlays(context)
        Log.d("OverlayManager", "Attempting show. Permission granted: $canDraw")

        if (!canDraw) {
            Log.e("OverlayManager", "CANNOT show overlay: Permission 'SYSTEM_ALERT_WINDOW' is missing!")
            return
        }

        // Guard against stacking multiple overlay windows if this gets
        // called again while one is already showing (e.g. fast typing
        // before debounce fully settles).
        if (overlayView != null) {
            Log.d("OverlayManager", "Overlay already showing, ignoring request.")
            return
        }

        try {
            val inflater = LayoutInflater.from(context)
            val view = inflater.inflate(R.layout.nudge_overlay, null)

            val params = WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT
            )

            view.findViewById<Button>(R.id.editBtn).setOnClickListener {
                hide()
                onEdit()
            }
            view.findViewById<Button>(R.id.sendAnywayBtn).setOnClickListener {
                hide()
                onSendAnyway()
            }

            windowManager.addView(view, params)
            overlayView = view
            Log.d("OverlayManager", "Overlay successfully added to window manager.")
        } catch (e: Exception) {
            Log.e("OverlayManager", "Failed to add overlay window", e)
        }
    }

    fun hide() {
        overlayView?.let {
            windowManager.removeView(it)
        }
        overlayView = null
    }
}
