# ChildSafeLens Android app

The Android app sends message text to the ChildSafeLens backend's `/predict`
endpoint. The backend runs the supplied `cyberbullying-cascade-v4` model; the
app does not bundle or run a separate classifier model. Set
`BackendApiConfig.BASE_URL` to a backend address reachable from the device
(the default `10.0.2.2:8000` is for the Android emulator).

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
| `EventLogger.kt` | **Person C** | **STUB** — logs to Logcat only. Replace `logNudgeEvent()` internals with real Room DB storage + wire up the debug viewer screen. Signature must not change. |

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
2. Type a message → the backend cascade classifies it; a trusted bullying
   result follows the existing parent-review flow.
3. Every time the overlay is triggered, an event is logged (see Logcat tag
   `EventLogger` until Person C's real storage lands).

## What's intentionally NOT in this zip (per plan Section 1, "out of scope")

- Multi-app support (WhatsApp/Instagram/SMS) — this only watches this demo
  app's own input field for now (see `accessibility_service_config.xml`).
- Cloud sync, parent dashboard, push notifications.
- Encrypted storage, auth/pairing.
- Offline classifier inference — unavailable; backend classification is
  required, and unverified offline results are not treated as model predictions.
