# Implementation Plan - Trigger Nudge Overlay Only on Send Button Press

Modify `NudgeAccessibilityService` and accessibility configuration so that bullying detection and the blocking overlay trigger **only when the Send button is pressed**, rather than continuously in real time while typing.

## User Review Required

> [!IMPORTANT]
> - **Change in Behavior**: Currently, the service triggers evaluation on every text change (`TYPE_VIEW_TEXT_CHANGED`). We will remove text-change evaluation and instead listen for click events (`TYPE_VIEW_CLICKED`) on send buttons or input submission actions.
> - **Accessibility Config**: We will update `accessibility_service_config.xml` to include `typeViewClicked`.

## Open Questions

None. The app uses standard Button views for sending messages (`btnSendMessage`, `btnChildSend`, or any view whose text/ID/description indicates "send").

## Proposed Changes

### [Accessibility Service & Configuration]

#### [MODIFY] [accessibility_service_config.xml](file:///C:/Users/Sejal Jain/Downloads/ChildSafeLens-Demo/ChildSafeLens-Demo/app/src/main/res/xml/accessibility_service_config.xml)
- Add `typeViewClicked` to `android:accessibilityEventTypes`.

#### [MODIFY] [NudgeAccessibilityService.kt](file:///C:/Users/Sejal Jain/Downloads/ChildSafeLens-Demo/ChildSafeLens-Demo/app/src/main/java/com/childsafelens/demo/NudgeAccessibilityService.kt)
- Remove handling of `TYPE_VIEW_TEXT_CHANGED` for risk evaluation.
- Handle `TYPE_VIEW_CLICKED`:
  - Check if the clicked view / node represents a send action (e.g., view ID containing "send", text matching "Send", etc.).
  - When a send click is detected, find the associated text input field content (EditText node text), run `Inference.scoreText(text)` on a background thread, and trigger the overlay if risk > `RISK_THRESHOLD`.

## Verification Plan

### Automated Tests
- Run Gradle build (`:app:assembleDebug`) and unit tests (`:app:testDebugUnitTest`).

### Manual Verification
- Deploy to Samsung Galaxy A35.
- Type risky phrases in the chat input field → verify that **no** overlay appears while typing.
- Tap the **Send** button → verify that the TFLite model runs inference on send and triggers the blocking overlay if the message is risky.
