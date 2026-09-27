package com.childsafelens.demo

import android.app.Application

/**
 * Custom Application class to handle global initialization.
 */
class ChildSafeLensApp : Application() {

    override fun onCreate() {
        super.onCreate()
        // Initialize the event logger as soon as the process starts
        // This ensures events are saved even if the Accessibility Service is not yet enabled.
        EventLogger.init(this)

        // Initialize the on-device ML inference engine
        Inference.init(this)
    }
}
