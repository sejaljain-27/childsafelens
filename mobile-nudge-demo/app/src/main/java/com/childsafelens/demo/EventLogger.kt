package com.childsafelens.demo

import android.util.Log

/**
 * PERSON C OWNS THIS FILE.
 *
 * Interface contract (do not change the signature — Person A calls this
 * exact function the moment the overlay is triggered):
 *
 *     fun logNudgeEvent(riskLevel: Float, timestamp: Long)
 *
 * Currently a STUB that just prints to Logcat, so Person A can build and
 * test the overlay flow without waiting on real storage.
 *
 * To go live (per the 6-Day plan, Day 2–3):
 *   1. Add Room dependencies in app/build.gradle.kts (already present,
 *      commented out).
 *   2. Create a NudgeEvent @Entity (riskLevel: Float, timestamp: Long).
 *   3. Create a DAO + Room database, insert the event here instead of
 *      just logging it.
 *   4. Build the debug viewer screen (simple RecyclerView/ListView reading
 *      from the DB) so the review demo can show "event just appeared in
 *      the log" per the doc's demo script step 4.
 *
 * IMPORTANT: this function may be called off the main thread — Room's
 * suspend/coroutine DAO methods handle that fine; if you use synchronous
 * Room calls instead, wrap them appropriately so you don't block the
 * caller unexpectedly.
 */
object EventLogger {

    // TEMP — replace this whole implementation, keep the function signature.
    fun logNudgeEvent(riskLevel: Float, timestamp: Long) {
        Log.d("EventLogger", "nudge_triggered: risk=$riskLevel at=$timestamp")
    }
}
