package com.childsafelens.demo

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.text.TextUtils
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/**
 * PERSON A OWNS THIS FILE.
 *
 * The demo "chat" screen. This is the field the AccessibilityService
 * watches (see accessibility_service_config.xml, scoped to this app's own
 * package for this sprint). Also has two convenience buttons so testers
 * don't have to hunt through Settings during every test run.
 *
 * Note: pressing Send here does NOT itself block anything — the block
 * happens live, upstream, via NudgeAccessibilityService reading the field
 * as the user types and covering the screen with the overlay before they
 * can even reach this button. Send just "delivers" the message into the
 * fake chat thread for demo purposes.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var messageInput: EditText
    private lateinit var chatThread: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        messageInput = findViewById(R.id.messageInput)
        chatThread = findViewById(R.id.chatThread)

        findViewById<Button>(R.id.btnEnableService).setOnClickListener {
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
        }

        findViewById<Button>(R.id.btnGrantOverlay).setOnClickListener {
            if (!Settings.canDrawOverlays(this)) {
                val intent = Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:$packageName")
                )
                startActivity(intent)
            }
        }

        findViewById<Button>(R.id.btnSend).setOnClickListener {
            val text = messageInput.text.toString()
            if (!TextUtils.isEmpty(text)) {
                appendToThread(text)
                messageInput.text.clear()
            }
        }
    }

    private fun appendToThread(text: String) {
        val existing = chatThread.text.toString()
        val updated = if (existing.isEmpty()) "Me: $text" else "$existing\nMe: $text"
        chatThread.text = updated
    }
}
