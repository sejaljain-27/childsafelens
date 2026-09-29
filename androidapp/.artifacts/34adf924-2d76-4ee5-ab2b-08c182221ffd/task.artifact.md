# Task List - Word Masking Implementation

- [x] Implement `Masker.kt` with robust tokenization, leet normalization, repetition shortening rules, and phrase matching
- [x] Implement unit tests in `MaskerTest.kt` covering all required test cases
- [x] Update `NudgeAccessibilityService.kt` to integrate `Masker.init` and handle outgoing message masking, silent masking, ACTION_SET_TEXT writing, and re-scoring/auto-send
- [x] Implement `IncomingOverlayManager.kt` to cover incoming masked text nodes with non-focusable accessibility overlays
- [x] Implement `MaskingNotificationListenerService.kt` and register it in `AndroidManifest.xml`
- [x] Verify functionality with tests and builds
