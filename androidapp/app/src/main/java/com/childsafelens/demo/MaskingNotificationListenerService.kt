package com.childsafelens.demo

import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log

/**
 * Intercepts incoming notifications from messaging apps, masks title and text,
 * cancels original notification, and posts replacement masked notification.
 */
class MaskingNotificationListenerService : NotificationListenerService() {

    companion object {
        private const val TAG = "MaskingNLS"
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        Log.d(TAG, "NotificationListener connected")
        Masker.ensureInitialized(applicationContext)
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val notification = sbn.notification ?: return
        val extras = notification.extras ?: return
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()

        if (title.isNullOrBlank() && text.isNullOrBlank()) return

        val maskedTitle = title?.let { Masker.mask(it) } ?: title
        val maskedText = text?.let { Masker.mask(it) } ?: text

        if ((maskedTitle != title) || (maskedText != text)) {
            Log.d(TAG, "Masking incoming notification from ${sbn.packageName}")
            val tag = sbn.tag
            val id = sbn.id

            val isAutoCancel = (notification.flags and Notification.FLAG_AUTO_CANCEL) != 0
            val iconRes = if (notification.icon != 0) notification.icon else android.R.drawable.ic_dialog_info

            val newNotification = Notification.Builder(this, notification.channelId ?: "default")
                .setSmallIcon(iconRes)
                .setContentTitle(maskedTitle)
                .setContentText(maskedText)
                .setContentIntent(notification.contentIntent)
                .setAutoCancel(isAutoCancel)
                .setWhen(notification.`when`)
                .build()

            try {
                cancelNotification(sbn.key)
                val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                notificationManager.notify(tag, id, newNotification)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to replace notification", e)
            }
        }
    }
}
