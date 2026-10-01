# Implementation Plan - Incoming Message Controls (View / Block)

Refine incoming messages in the ChildSafeLens system:
1. **Parent Dashboard AlertCard (`AlertCard.tsx`)**:
   - For `INCOMING` messages, display **[ View ]** and **[ Block ]** action buttons (instead of Allow, Edit, Block).
   - For `OUTGOING` messages, retain Allow, Edit, Block buttons.
2. **Child App Incoming Message Handling (`ChatViewModel.kt`, `SimulatorViewModel.kt`)**:
   - When parent responds with **Block** (`BLOCK`), the incoming message is hidden / replaced with `[Message Hidden]` or shown as an overlay where no message text is seen by the child.
   - When parent responds with **View** (`ALLOW`), the incoming message is displayed normally.

## User Review Required

> [!IMPORTANT]
> - **Incoming Action Buttons**: **View** and **Block** buttons for incoming messages.
> - **Incoming Block Overlay**: Blocked incoming messages are hidden entirely from the child.

## Open Questions

- None.

## Proposed Changes

### [React Native Dashboard]
#### [MODIFY] [AlertCard.tsx](file:///C:/Users/Sejal Jain/Downloads/childsafe/childsafelens/mobile-dashboard/my-app/components/AlertCard.tsx)
- Render **[ View ]** and **[ Block ]** buttons if `alert.type === 'INCOMING'`.

### [Android App]
#### [MODIFY] [ViewModels.kt](file:///C:/Users/Sejal Jain/Downloads/childsafe/childsafelens/androidapp/app/src/main/java/com/childsafelens/demo/ui/viewmodel/ViewModels.kt)
- Update `injectPresetMessage` / `sendMessageAsContact` decision handlers: if incoming message is blocked, display `[Message Hidden by Parent]` (or hide content).

## Verification Plan

### Manual Verification
- Inject an incoming risky message → verify parent dashboard shows **View** and **Block** buttons.
- Click **Block** → verify incoming message is hidden on child device.
