# Task List - Standalone Messaging App Parent BLOCK & EDIT Functionality

- [ ] Update backend (`backend/main.py`) with BLOCK, EDIT, ALLOW, and pending decisions endpoints
- [ ] Create `PendingMessage` entity and update database schema
- [ ] Implement `ParentDecisionManager` methods (`handleBlock`, `handleEdit`, `handleAllow`) with atomic state transitions
- [ ] Update `ChatViewModel` / `SimulatorViewModel` for standalone pending message holding and re-scans
- [ ] Update React Native dashboard (`AlertCard.tsx`, `alertsService.ts`) for Allow, Block, and Edit actions
- [ ] Verify build compilation and test workflows
