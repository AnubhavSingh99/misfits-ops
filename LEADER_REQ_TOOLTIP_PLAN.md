# Leader Requirements Tooltip Enhancement Plan

## Overview
Enhancing the Leader Requirements tooltip in V2 Scaling Planner Dashboard to:
1. Show linked tasks per requirement (expandable)
2. Add global "Create Task" button in header
3. Add per-requirement "+" button to create task pre-linked to requirement
4. Show linked requirement badges on tasks in Tasks tooltip
5. Roll up leader requirements at all hierarchy levels

## Implementation Status

### Phase 1: LeaderRequirementsTooltip Updates
- [x] Add `Plus` icon to imports
- [x] Add `onCreateTask` prop for per-requirement create button
- [x] Update grid layout to 5 columns (add button column)
- [x] Add per-requirement create task button (Col 4)
- [x] Add `onCreateTask` and `onCreateTaskForRequirement` to props interface
- [x] Update function signature to destructure new props
- [x] Add global "Create Task" button in tooltip header
- [x] Pass `onCreateTask` callback to `CompactRequirementTile`

### Phase 2: ScalingPlannerV2.tsx Updates
- [x] Import `LeaderRequirement` type
- [x] Add `prelinkedRequirement` state
- [x] Add `onCreateTaskForRequirement` to HierarchyRowProps
- [x] Update HierarchyRow function signature
- [x] Update LeaderRequirementsTooltip call in HierarchyRow to pass callbacks
- [x] Update HierarchyRow call to pass `onCreateTaskForRequirement` callback
- [x] Update ScalingTaskCreateModal call to pass `prelinkedLeaderRequirement` prop
- [x] Clear `prelinkedRequirement` when modal closes

### Phase 3: ScalingTaskCreateModal Updates
- [x] Add `prelinkedLeaderRequirement` prop to interface
- [x] Auto-add prelinked requirement to `selectedLeaderRequirements` on mount

### Phase 4: TaskListTooltip Updates
- [x] Check if API returns `linked_leader_requirements` for tasks
- [x] Add requirement badges to CompactTaskTile component
- [x] Show requirement badges only if task has linked requirements

### Phase 5: Backend Rollup Updates
- [x] Initialize `leaders_required_total` and `leader_requirements_summary` in activity nodes
- [x] Initialize `leaders_required_total` and `leader_requirements_summary` in city nodes
- [x] Initialize `leaders_required_total` and `leader_requirements_summary` in area nodes
- [x] Roll up leader requirements from club to area, city, activity nodes

### Phase 6: Testing & Deployment
- [x] Build frontend to check for errors
- [x] Deploy to production
- [ ] Verify tooltip functionality
- [ ] Verify task creation with pre-linked requirements
- [ ] Verify requirement badges on tasks
- [ ] Verify hierarchy rollup at all levels

## User Requirements Confirmed
- **Tooltip Focus**: Requirements-focused with linked task count (expandable)
- **Task Creation**: Both global button at top + per-requirement button
- **Cross-linking**: Show requirement badges on tasks in Tasks tooltip
- **Hierarchy Rollup**: Leaders required should roll up at Activity/City/Area levels

## Deployment History
- **2026-01-13**: Deployed with commit 3b9c405 - Full implementation complete
