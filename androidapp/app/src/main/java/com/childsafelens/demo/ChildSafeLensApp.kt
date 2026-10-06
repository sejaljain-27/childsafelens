package com.childsafelens.demo

import android.app.Application

/**
 * Custom Application class to handle global initialization.
 */
class ChildSafeLensApp : Application() {

    override fun onCreate() {
        super.onCreate()
        // Initialize event logger
        EventLogger.init(this)

        // Initialize word masker engine
        Masker.init(this)

        // Initialize incident manager
        IncidentManager.init(this)

        // Initialize backend classification and offline rechecks
        BackendClassifierClient.initialize(this)
    }
}
