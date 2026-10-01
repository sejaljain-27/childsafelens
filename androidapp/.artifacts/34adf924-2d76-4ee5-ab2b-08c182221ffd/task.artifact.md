# Task List - Incoming Blocked Message Overlay

- [ ] Add `isBlockedByParent` to `Message.kt`
- [ ] Update `ChatViewModel` & `SimulatorViewModel` decision handlers for incoming `BLOCK` (`isBlockedByParent = true`)
- [ ] Update `ChatAdapter.kt` to show `"You can't view this message"` restriction overlay when `isBlockedByParent` is true
- [ ] Verify build and test incoming block overlay workflow
