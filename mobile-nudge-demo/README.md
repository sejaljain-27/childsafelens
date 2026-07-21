# ChildSafeLens — Outgoing Nudge Demo (6-Day Build)

This is the Android project for the first-review demo of the **outgoing nudge**
feature: a live AccessibilityService that watches text as it's typed, scores it
on-device, and blocks the child from sending a risky message with a full-screen
overlay — matching Section 3.1 / 7.1 of the Full Implementation Plan (v2).

## How to open this project

1. Open Android Studio (Giraffe or newer recommended).
2. `File → Open` → select this folder (`ChildSafeLens-Demo/`).
3. Let Gradle sync. If prompted, let Android Studio regenerate the Gradle
   wrapper JAR (this repo ships the wrapper *scripts* but not the binary JAR,
   since binaries don't belong in a code review/zip — Android Studio creates
   it automatically on first open, or run `gradle wrapper` once if you have
   Gradle installed locally).
4. Run on a **real device** if possible — overlay + accessibility permissions
   behave more predictably on real hardware than on some emulator images.

## Who owns what file (per the 6-Day Demo Plan doc)

| File | Owner | Status in this zip |
|---|---|---|
| `NudgeAccessibilityService.kt` | **Person A** | Fully implemented — capture, debounce, overlay, threading, edge cases |
| `OverlayManager.kt` | **Person A** | Fully implemented — the full-screen blocking window |
| `MainActivity.kt` | **Person A** | Fully implemented — permission requests + demo input field |
| `Inference.kt` | **Person B** | **STUB** — hardcoded keyword check. Replace `scoreText()` internals with the real ONNX Runtime Mobile call. Signature must not change. |
| `EventLogger.kt` | **Person C** | **STUB** — logs to Logcat only. Replace `logNudgeEvent()` internals with real Room DB storage + wire up the debug viewer screen. Signature must not change. |

The two function signatures below are the fixed interfaces from the plan —
as long as they don't change, Person A's code never needs to be touched
again once Person B and Person C plug in their real implementations:

```kotlin
fun scoreText(text: String): Float                     // Inference.kt
fun logNudgeEvent(riskLevel: Float, timestamp: Long)    // EventLogger.kt
```

## Required manual step after installing the app

The AccessibilityService will **not** turn on just by installing the app —
Android requires the user to enable it manually:

**Settings → Accessibility → Downloaded apps → ChildSafeLens Demo → On**

`MainActivity` has a button that deep-links straight to this settings screen
so you don't have to hunt for it during testing.

The overlay also needs the "draw over other apps" permission, which
`MainActivity` requests automatically on first launch if not already granted.

## Demo flow this code proves

1. Type a neutral sentence in the demo input field → nothing happens.
2. Type a flagged phrase (see `Inference.kt` stub list, e.g. contains
   "stupid" or "idiot") → after a short debounce, a full-screen overlay
   appears blocking the rest of the screen, with **Edit** / **Send anyway**.
3. Every time the overlay is triggered, an event is logged (see Logcat tag
   `EventLogger` until Person C's real storage lands).

## What's intentionally NOT in this zip (per plan Section 1, "out of scope")

- Multi-app support (WhatsApp/Instagram/SMS) — this only watches this demo
  app's own input field for now (see `accessibility_service_config.xml`).
- Cloud sync, parent dashboard, push notifications.
- Encrypted storage, auth/pairing.
- Real ONNX model file and Room DB wiring — left as clearly marked stubs for
  Person B and Person C to fill in per the interface contracts above.
