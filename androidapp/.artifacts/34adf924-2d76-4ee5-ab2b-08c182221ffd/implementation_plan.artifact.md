# Implementation Plan - Standalone Messaging App Parent BLOCK & EDIT Functionality

Implement a robust standalone messaging app parent BLOCK and EDIT workflow:
1. **PendingMessage & Incident Data Models**: Track `originalContent`, `editedContent`, `status` (`PENDING_PARENT_REVIEW`, `ALLOWED`, `BLOCKED`, `EDIT_REQUIRED`, `EXPIRED`), and `parentDecision` with atomic state transition protection.
2. **Backend API Endpoints**: Implement explicit REST APIs matching the required contract:
   - `POST /parent/incidents/{incidentId}/block`
   - `POST /parent/incidents/{incidentId}/edit`
   - `POST /parent/incidents/{incidentId}/allow`
   - `GET /child/pending-decisions`
   - `POST /child/messages/{messageId}/retry`
3. **Android App Integration (`PendingMessageManager`, `ParentDecisionManager`, `ChatViewModel`)**:
   - Hold risky messages in `PENDING_PARENT_REVIEW` and prevent transmission until parent approval (`ALLOWED`).
   - Implement BLOCK handling (permanently prevent sending without child overlay/warnings, store audit history).
   - Implement EDIT handling (Mode A: parent-edited content re-scanned by ML; Mode B: prompt child to rephrase neutrally).
4. **Parent Dashboard Actions**:
   - Provide buttons for **Allow Send**, **Block Send**, **Ask Child to Edit** / **Edit Message Yourself**.

## User Review Required

> [!IMPORTANT]
> - **Atomic State Transitions**: Prevent race conditions where timeout and block/allow execute simultaneously.
> - **Original Message Preservation**: Original risky content is preserved for audit history (`originalContent` vs `editedContent`).
> - **Standalone Messaging Flow**: Messages are controlled at the message-sending layer rather than relying on AccessibilityService.

## Open Questions

- None.

## Proposed Changes

### [Backend]
#### [MODIFY] [main.py](file:///C:/Users/Sejal Jain/Downloads/childsafe/childsafelens/backend/main.py)
- Add endpoints for `/parent/incidents/{incidentId}/block`, `/parent/incidents/{incidentId}/edit`, `/parent/incidents/{incidentId}/allow`, `/child/pending-decisions`, and `/child/messages/{messageId}/retry`.

### [Android App]
#### [NEW] [PendingMessage.kt](file:///C:/Users/Sejal Jain/Downloads/childsafe/childsafelens/androidapp/app/src/main/java/com/childsafelens/demo/data/model/PendingMessage.kt)
- Room entity and data model for pending messages with audit fields.

#### [MODIFY] [PendingMessageManager.kt](file:///C:/Users/Sejal Jain/Downloads/childsafe/childsafelens/androidapp/app/src/main/java/com/childsafelens/demo/PendingMessageManager.kt) & [ParentDecisionManager.kt](file:///C:/Users/Sejal Jain/Downloads/childsafe/childsafelens/androidapp/app/src/main/java/com/childsafelens/demo/ParentDecisionManager.kt)
- Implement `handleBlock`, `handleEdit`, `handleAllow` with atomic state transitions and idempotency.

#### [MODIFY] [ViewModels.kt](file:///C:/Users/Sejal Jain/Downloads/childsafe/childsafelens/androidapp/app/src/main/java/com/childsafelens/demo/ui/viewmodel/ViewModels.kt)
- Integrate pending message holding in `ChatViewModel` and `SimulatorViewModel`.

### [React Native Parent Dashboard]
#### [MODIFY] [AlertCard.tsx](file:///C:/Users/Sejal Jain/Downloads/childsafe/childsafelens/mobile-dashboard/my-app/components/AlertCard.tsx) & [alertsService.ts](file:///C:/Users/Sejal Jain/Downloads/childsafe/childsafelens/mobile-dashboard/my-app/services/alertsService.ts)
- Add buttons for Allow, Block, and Edit (Mode A & Mode B) connected to the new backend APIs.

## Verification Plan

### Manual Verification
- Test sending a high-risk message → verify it is held as `PENDING_PARENT_REVIEW` and never sent.
- Click **Block** on parent dashboard → verify message is permanently blocked.
- Click **Edit** (Ask Child to Edit) → verify child receives neutral prompt `"Please rephrase your message before sending."` without original message sending.
