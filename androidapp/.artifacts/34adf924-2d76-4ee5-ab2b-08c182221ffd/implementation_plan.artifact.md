# Implementation Plan - Child Waiting Overlay & Main-Thread Response Dispatch

Fix chat simulation behavior when messages require parent approval:
1. **Child Waiting Overlay**: Add `pendingApprovalState` LiveData in ViewModels (`ChatViewModel` and `SimulatorViewModel`) and observe it in `ChatFragment` and `DualChatFragment` to show a non-dismissible white/semi-transparent loading overlay stating *"⏳ Waiting for parent approval..."* until the parent responds or timeout occurs.
2. **Main-Thread Dispatch**: Ensure callbacks from backend polling (`onDecisionReceived`) dispatch `addMessage` onto the main thread so LiveData updates the RecyclerView correctly.

## User Review Required

> [!IMPORTANT]
> - **Waiting Overlay**: Child screen displays a clean loading overlay during the `PENDING` state.
> - **Main-Thread UI Update**: Parent decisions (`ALLOW`) correctly update the chat on the UI thread.

## Open Questions

- None.

## Proposed Changes

### [Android App]
#### [MODIFY] [ViewModels.kt](file:///C:/Users/Sejal Jain/Downloads/childsafe/childsafelens/androidapp/app/src/main/java/com/childsafelens/demo/ui/viewmodel/ViewModels.kt)
- Add `pendingApprovalState` LiveData (`LiveData<Boolean>`).
- Post UI updates (`addMessage`, dismissing pending state) onto the main thread.

#### [MODIFY] [ChatFragment.kt](file:///C:/Users/Sejal Jain/Downloads/childsafe/childsafelens/androidapp/app/src/main/java/com/childsafelens/demo/ui/chat/ChatFragment.kt) & [DualChatFragment.kt](file:///C:/Users/Sejal Jain/Downloads/childsafe/childsafelens/androidapp/app/src/main/java/com/childsafelens/demo/ui/chat/DualChatFragment.kt)
- Observe `pendingApprovalState` to show/dismiss a waiting dialog overlay (`"Waiting for parent approval..."`).

## Verification Plan

### Manual Verification
- Send a high-risk message in the Android chat demo → verify child screen shows `"Waiting for parent approval..."` overlay → click Allow on React Native parent dashboard → verify message appears in child chat.
