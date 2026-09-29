# Walkthrough - Word Masking for Outgoing & Incoming Messages

Implemented comprehensive word and phrase masking driven by `bad_words.txt`, supporting advanced leet normalization, repetition shortening rules, outgoing message masking & auto-resend/re-scoring, incoming message accessibility overlays, and notification interception.

## Changes

### Core Masking Engine
#### [NEW] [Masker.kt](file:///C:/Users/Sejal Jain/Downloads/childsafe/childsafelens/androidapp/app/src/main/java/com/childsafelens/demo/Masker.kt)
- Pure object implementing `init(context)` and `mask(text: String): String`.
- Parses `bad_words.txt` from assets, ignoring comments (`#`) and blank lines, distinguishing whole single words and multi-word phrases.
- Tokenizes via `Regex("[\\p{L}\\p{N}@$]+")`.
- Leet character mapping (`0->o`, `1->i`, `3->e`, `4->a`, `5->s`, `@->a`, `$->s`, `7->t`).
- Repetition rules: shortens runs of 3+ identical letters to 1 and 2 (preserving 2-letter runs like "niger" or "sale").
- Phrase matching and span-based replacement with `*` matching original length, preserving spacing and punctuation.

#### [NEW] [MaskerTest.kt](file:///C:/Users/Sejal Jain/Downloads/childsafe/childsafelens/androidapp/app/src/androidTest/java/com/childsafelens/demo/MaskerTest.kt)
- Unit test suite verifying all required cases:
  - `"you are a fuuuuck idiot"` -> `"you are a ******* *****"`
  - `"f@ck"` -> `"****"`
  - `"id1ot!!"` -> `"*****!!"`
  - `"niger is a country"` -> unchanged
  - `"big sale today"` -> unchanged
  - `"saale kutte"` -> `"***** *****"`
  - `"go kill yourself now"` -> `"**************** now"`
  - `"teri maa ki"` -> `"***********"`

### Outgoing Messages & Accessibility Service
#### [MODIFY] [NudgeAccessibilityService.kt](file:///C:/Users/Sejal Jain/Downloads/childsafe/childsafelens/androidapp/app/src/main/java/com/childsafelens/demo/NudgeAccessibilityService.kt)
- Integrated `Masker.init()` on service connection.
- On Send click, extracts input text, runs `Masker.mask()`, writes masked text back via `ACTION_SET_TEXT`, re-scores the text, and either proceeds or triggers the blocking overlay.

#### [MODIFY] [OverlayManager.kt](file:///C:/Users/Sejal Jain/Downloads/childsafe/childsafelens/androidapp/app/src/main/java/com/childsafelens/demo/OverlayManager.kt) & [nudge_overlay.xml](file:///C:/Users/Sejal Jain/Downloads/childsafe/childsafelens/androidapp/app/src/main/res/layout/nudge_overlay.xml)
- Added "Mask & Send" button and support for masked text flow.

### Incoming Messages & Notifications
#### [NEW] [IncomingOverlayManager.kt](file:///C:/Users/Sejal Jain/Downloads/childsafe/childsafelens/androidapp/app/src/main/java/com/childsafelens/demo/IncomingOverlayManager.kt)
- Traverses active window node trees to find non-editable incoming text nodes, masks them, and draws non-focusable accessibility overlays (`TYPE_ACCESSIBILITY_OVERLAY`, `FLAG_NOT_FOCUSABLE | FLAG_NOT_TOUCHABLE`) at matching screen bounds with 100ms debouncing and caching.

#### [NEW] [MaskingNotificationListenerService.kt](file:///C:/Users/Sejal Jain/Downloads/childsafe/childsafelens/androidapp/app/src/main/java/com/childsafelens/demo/MaskingNotificationListenerService.kt)
- Intercepts incoming notifications from messaging apps, masks title and text, cancels originals, and posts replacement masked notifications.

#### [MODIFY] [AndroidManifest.xml](file:///C:/Users/Sejal Jain/Downloads/childsafe/childsafelens/androidapp/app/src/main/AndroidManifest.xml)
- Registered `MaskingNotificationListenerService` with `BIND_NOTIFICATION_LISTENER_SERVICE`.

## Verification Results

### Automated Tests
- `MaskerTest` successfully executed and passed all 8 test cases verifying leet normalization, repetition rules, phrase matching, and preservation of innocent words.
