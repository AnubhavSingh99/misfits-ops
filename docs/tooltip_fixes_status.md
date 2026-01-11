# TaskListTooltip Fixes - Status

## Completed

1. **Tooltip positioning** - Centers on trigger, proper above/below logic
2. **Hover flickering** - Fixed with `isHoveringRef` and proper timeouts
3. **Duplicate tasks** - Deduplicated by task ID
4. **Comment icon always visible** - Shows grayed when no comments
5. **Grid layout** - Fixed column alignment (stage, title, avatar, status, comments)
6. **Wider tooltip** - 700px width

## In Progress

### Status Change Button
- **Issue**: Was calling wrong endpoint `/scaling-tasks/:id/status`
- **Fix**: Changed to `PUT /scaling-tasks/:id` with status in body
- **Status**: Code committed, needs deploy

### Comment Button
- **Issue**: Clicking does nothing
- **Fix**: Need to wire up `TaskCommentsPanel` (same as SprintModal)
- **Status**: COMPLETED
  1. ~~Import TaskCommentsPanel~~ Done
  2. ~~Add state for showCommentsPanel, selectedTask~~ Done
  3. ~~Add handleViewComments function~~ Done
  4. ~~Pass `onViewComments` to CompactTaskTile~~ Done
  5. ~~Render TaskCommentsPanel at end of component~~ Done

## All Code Changes Complete

## Other Fixes in This Session

1. **Health indicators** - Compact pill design in frozen row
2. **Revenue trend tile** - Shows "All Clubs" badge when filtered (data not per-club)
