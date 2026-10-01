# Implementation Plan - Incoming Blocked Message Overlay ("You can't view this message")

Refine incoming blocked messages in the chat simulation (`Message.kt`, `ChatAdapter.kt`, `ViewModels.kt`):
1. **Incoming Block Overlay**:
   - When a parent blocks an incoming message (`BLOCK`), the receiver (Window B) **still sees the message card**, but it is covered with a restriction overlay stating: **"⚠️ You can't view this message"**, preventing the child/receiver from seeing the raw bullying text while acknowledging a message was blocked.
2. **Data Model (`Message.kt`)**:
   - Add `isBlockedByParent: Boolean = false`.
3. **Adapter (`ChatAdapter.kt`)**:
   - If `message.isBlockedByParent` is true, show the restriction warning layout (`"You can't view this message"`) instead of the message text.

## User Review Required

> [!IMPORTANT]
> - **Incoming Restriction Overlay**: Blocked incoming messages display `"You can't view this message"` overlay on the receiver's screen.

## Open Questions

- None.

## Proposed Changes

### [Android App]
#### [MODIFY] [Message.kt](file:///C:/Users/Sejal Jain/Downloads/childsafe/childsafelens/androidapp/app/src/main/java/com/childsafelens/demo/data/model/Message.kt)
- Add `isBlockedByParent: Boolean = false`.

#### [MODIFY] [ViewModels.kt](file:///C:/Users/Sejal Jain/Downloads/childsafe/childsafelens/androidapp/app/src/main/java/com/childsafelens/demo/ui/viewmodel/ViewModels.kt)
- When incoming message decision is `BLOCK`, set `isBlockedByParent = true` and `visibleToReceiver = true`.

#### [MODIFY] [ChatAdapter.kt](file:///C:/Users/Sejal Jain/Downloads/childsafe/childsafelens/androidapp/app/src/main/java/com/childsafelens/demo/ui/chat/ChatAdapter.kt)
- In `LeftViewHolder`, if `message.isBlockedByParent` is true, show restricted overlay `"You can't view this message"`.

## Verification Plan

### Manual Verification
- Send an incoming high-risk message → Parent clicks **Block** → Verify receiver sees `"⚠️ You can't view this message"` overlay.
