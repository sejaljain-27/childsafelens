# Task List - Trigger Nudge Overlay Only on Send Button Press

- `[x]` Update `accessibility_service_config.xml` to include `typeViewClicked`
- `[x]` Update `NudgeAccessibilityService.kt` to trigger evaluation on send button click (`TYPE_VIEW_CLICKED`) instead of text changed (`TYPE_VIEW_TEXT_CHANGED`)
- `[x]` Build and verify project (`:app:assembleDebug`)
- `[x]` Deploy to connected device and verify send-only trigger flow
- `[x]` Create walkthrough artifact
