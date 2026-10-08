# Fix Parent Approval Flow for Outgoing and Incoming Messages

## Problem Statement
The message interception and parent decision flow needs precise enforcement for both outgoing and incoming messages:
1. **Outgoing Messages (Child -> Contact):** When classified as bullying (`hideInitially = true`), the message must be held from the receiver (`visibleToReceiver = false`) until the parent approves (`ALLOW`). If blocked (`BLOCK`), the receiver never sees it.
2. **Incoming Messages (Contact -> Child):** When classified as harmful (`hideInitially = true`), the message must be held from the child (`visibleToReceiver = false`, displaying a holding notice). The child can only see the message if the parent chooses **View / Allow** (`ALLOW`). If the parent chooses **Block** (`BLOCK`), the message remains hidden from the child.

## Proposed Changes

### [Chat / Simulator Component]

#### [MODIFY] [ViewModels.kt](file:///C:/Users/Sejal Jain/Downloads/childsafe8/childsafelens/androidapp/app/src/main/java/com/childsafelens/demo/ui/viewmodel/ViewModels.kt)
- In `ChatViewModel` and `SimulatorViewModel`, update `applyClassificationResult` to correctly distinguish between `isIncoming` and `isOutgoing` when setting initial message visibility (`visibleToReceiver`) and display text (`displayText`).
  - **Incoming:** If `hideInitially = true`, set `visibleToReceiver = false` and `displayText = "[Message held for parent review]"`. When parent allows, update `visibleToReceiver = true` and `displayText = text`. When blocked, keep `visibleToReceiver = false`.
  - **Outgoing:** If `hideInitially = true`, set `visibleToReceiver = false` (receiver cannot see it yet). When parent allows, set `visibleToReceiver = true`. When blocked, keep `visibleToReceiver = false`.

## Verification Plan

### Automated Tests
- Build the Android app (`./gradlew assembleDebug`) to verify compilation.

### Manual Verification
- Use the Dual Chat Simulator or real chat fragment to test:
  1. Sending a toxic message as child -> receiver does not see it until parent allows in dashboard.
  2. Sending a toxic message as contact -> child sees "[Message held for parent review]" until parent clicks View/Allow.
