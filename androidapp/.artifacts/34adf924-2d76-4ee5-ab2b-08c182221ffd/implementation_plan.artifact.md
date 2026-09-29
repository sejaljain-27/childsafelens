# Implementation Plan - Word Masking for Outgoing & Incoming Messages

Add robust word masking (driven by `bad_words.txt`) to both outgoing messages (with auto-resend/re-scoring and silent masking) and incoming messages (via Accessibility overlays and `NotificationListenerService`), adhering to advanced leet/repetition normalization rules.

## User Review Required

> [!IMPORTANT]
> - `Masker.kt` will be implemented as a pure object parsing `bad_words.txt` from assets and implementing leet/repetition normalization rules for single words and multi-word phrases.
> - Outgoing messages will be automatically masked using `ACTION_SET_TEXT` when Send is clicked, re-scored, and either auto-sent (if score <= 0.5) or re-prompted via overlay (if score > 0.5).
> - Incoming messages will be covered by non-focusable accessibility overlays when text is masked, and incoming notifications will be intercepted/masked via a new `MaskingNotificationListenerService`.

## Open Questions

- None. Requirements are fully specified.

## Proposed Changes

### [Core Masking & Testing]

#### [NEW] [Masker.kt](file:///C:/Users/Sejal Jain/Downloads/childsafe/childsafelens/androidapp/app/src/main/java/com/childsafelens/demo/Masker.kt)
- Implements `init(context)` and `mask(text: String): String`.
- Loads `bad_words.txt` from assets, ignoring comments (`#`) and blank lines. Distinguishes single words (no space) and phrases (contains spaces).
- Tokenization using `Regex("[\\p{L}\\p{N}@$]+")`.
- Leet normalization (`0->o`, `1->i`, `3->e`, `4->a`, `5->s`, `@->a`, `$->s`, `7->t`).
- Repetition normalization (shortening runs of 3+ identical letters to 1 and to 2, excluding 2-letter runs).
- Phrase matching across consecutive tokens.
- Masking spans with `*` matching original length, preserving spacing and punctuation.

#### [NEW] [MaskerTest.kt](file:///C:/Users/Sejal Jain/Downloads/childsafe/childsafelens/androidapp/app/src/androidTest/java/com/childsafelens/demo/MaskerTest.kt)
- Unit tests verifying required test cases:
  - `"you are a fuuuuck idiot"`
  - `"f@ck"`
  - `"id1ot!!"`
  - `"niger is a country"` (unchanged)
  - `"big sale today"` (unchanged)
  - `"saale kutte"`
  - `"go kill yourself now"`
  - `"teri maa ki"`

### [Outgoing Messages & Accessibility Service]

#### [MODIFY] [NudgeAccessibilityService.kt](file:///C:/Users/Sejal Jain/Downloads/childsafe/childsafelens/androidapp/app/src/main/java/com/childsafelens/demo/NudgeAccessibilityService.kt)
- Initialize `Masker.init(applicationContext)` in `onServiceConnected()`.
- On Send click:
  - Extract input text.
  - Run `Masker.mask(text)`.
  - If text was masked (contains `*`), update EditText node via `ACTION_SET_TEXT` and set cursor via `ACTION_SET_SELECTION`. If `ACTION_SET_TEXT` fails, fall back to normal edit flow.
  - Re-run `Inference.scoreText(maskedText)`.
  - If score `<= 0.5`: silently mask (or auto-send after ~150ms if triggered via send).
  - If score `> 0.5`: trigger overlay with masked text.

#### [MODIFY] [OverlayManager.kt](file:///C:/Users/Sejal Jain/Downloads/childsafe/childsafelens/androidapp/app/src/main/java/com/childsafelens/demo/OverlayManager.kt)
- Support updating overlay text or handling masked text actions.

### [Incoming Messages & Notifications]

#### [NEW] [IncomingOverlayManager.kt](file:///C:/Users/Sejal Jain/Downloads/childsafe/childsafelens/androidapp/app/src/main/java/com/childsafelens/demo/IncomingOverlayManager.kt)
- Manages non-focusable accessibility overlays (`TYPE_ACCESSIBILITY_OVERLAY`, `FLAG_NOT_FOCUSABLE | FLAG_NOT_TOUCHABLE`) covering masked incoming `TextView` nodes in active windows.
- Debounces updates by ~100ms, caches by node text, recycles nodes, and handles scrolling/window changes.
- Optional: adds a small "message may be hurtful" hint if score > 0.5.

#### [NEW] [MaskingNotificationListenerService.kt](file:///C:/Users/Sejal Jain/Downloads/childsafe/childsafelens/androidapp/app/src/main/java/com/childsafelens/demo/MaskingNotificationListenerService.kt)
- Intercepts incoming notifications from messaging apps, masks title and text using `Masker.mask`, cancels original notification, and posts replacement masked notification.

#### [MODIFY] [AndroidManifest.xml](file:///C:/Users/Sejal Jain/Downloads/childsafe/childsafelens/androidapp/app/src/main/AndroidManifest.xml)
- Register `MaskingNotificationListenerService` with `BIND_NOTIFICATION_LISTENER_SERVICE` permission.

## Verification Plan

### Automated Tests
- Run `MaskerTest` via `./gradlew connectedAndroidTest` or unit test runner to verify all masking test cases.

### Manual Verification
- Deploy app to emulator, test typing abusive words in input field and verifying outgoing masking + overlay/auto-send behavior.
