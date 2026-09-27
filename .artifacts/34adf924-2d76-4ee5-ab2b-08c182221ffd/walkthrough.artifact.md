# Walkthrough - Trigger Nudge Overlay Only on Send Button Press

Summary of changes made to restrict the bullying detection nudge overlay so that it triggers **only when the Send button is pressed**, rather than continuously while typing.

## Changes Made

### 1. Accessibility Configuration (`accessibility_service_config.xml`)
- Added `typeViewClicked` to `android:accessibilityEventTypes` so the Accessibility Service can detect button clicks (specifically Send button clicks).

### 2. Accessibility Service Logic (`NudgeAccessibilityService.kt`)
- Removed `TYPE_VIEW_TEXT_CHANGED` event listener and real-time debounce typing checks.
- Added handling for `TYPE_VIEW_CLICKED` events:
  - Detects when a Send button is clicked (matching view ID, text, or button class name containing "send").
  - Automatically extracts the current message text from the active editable field (`EditText`) via node traversal.
  - Runs the real TensorFlow Lite inference model off the main thread via `Inference.scoreText(text)`.
  - Triggers the blocking warning overlay only if the risk score exceeds `0.5f`.

---

## Verification Result

- **Build**: PASS (`:app:assembleDebug` built successfully).
- **Deployment**: Successfully deployed to Samsung Galaxy A35 (`RZCX2267KBR`).
- **Behavior**: Typing text in between **no longer** triggers the overlay. The nudge check now happens precisely when you press the **Send** button.
