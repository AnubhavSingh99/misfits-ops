# Leader Requirements V2 Dashboard Implementation Status

## Overview
Adding Leader Requirements column to V2 Scaling Planner Dashboard with full CRUD, roll-up metrics, interactive tooltip, and bidirectional task-requirement linking.

## Key Requirements
- **Display**: Sum of leaders needed (rolls up at hierarchy levels)
- **Effort Types**: 3 types (Growth Team, Platform Team, Existing Leader) - can combine
- **Tooltip**: Full details with status change capability at club level
- **Modal Context**: Pre-filled but editable hierarchy context
- **Club Required**: Every requirement must be linked to a club or launch

---

## Implementation Progress

### Phase 1: Database Changes
- [x] Create migration `010_leader_requirements_enhancements.sql`
  - Added `leaders_required INTEGER NOT NULL DEFAULT 1` to leader_requirements
  - Added `existing_leader_effort BOOLEAN DEFAULT false` to leader_requirements
  - Added same columns to venue_requirements for consistency
  - Added indexes for efficient rollup queries

### Phase 2: Type Updates
- [x] Update `shared/types.ts`
  - Add to BaseRequirement: `leaders_required`, `existing_leader_effort`, `linked_tasks`, `launch_id`
  - Add to HierarchyNode: `leaders_required_total`, `leader_requirements_summary`
  - Add new type: `ClubOrLaunch`
  - Update CreateRequirementRequest: `existing_leader_effort`, `leaders_required`, `launch_id`

### Phase 3: Backend API Changes
- [x] Update `/server/src/routes/requirements.ts`
  - Modify POST /api/requirements/leaders (add new fields, validate club_id required)
  - Modify PUT /api/requirements/leaders/:id (handle new fields)
  - Modify GET /api/requirements/leaders/hierarchy (sum leaders_required)
  - Add GET /api/requirements/clubs-and-launches
- [x] Update `/server/src/routes/scalingTasks.ts`
  - Add GET /api/scaling-tasks/search for reverse linking
- [x] Update `/server/src/routes/targets.ts`
  - Integrate leader requirements into GET /api/targets/v2/hierarchy

### Phase 4: Frontend Components
- [x] Create `/client/src/components/scaling/TaskSelector.tsx`
- [x] Create `/client/src/components/scaling/LeaderRequirementModal.tsx`
- [x] Create `/client/src/components/scaling/LeaderRequirementsTooltip.tsx`
- [x] Update `/client/src/pages/ScalingPlannerV2.tsx`
  - Add Leaders column header
  - Add LeaderRequirementsTooltip cell
  - Compress column padding
- [x] Update `/client/src/pages/LeaderRequirementsDashboard.tsx`
  - Show leaders_required in list
  - Add existing_leader_effort checkbox in modals
  - Add Leaders column header

---

## Files Created/Modified

### New Files
1. `/server/database/migrations/010_leader_requirements_enhancements.sql` - DONE
2. `/client/src/components/scaling/TaskSelector.tsx` - DONE
3. `/client/src/components/scaling/LeaderRequirementModal.tsx` - DONE
4. `/client/src/components/scaling/LeaderRequirementsTooltip.tsx` - DONE

### Modified Files
1. `/shared/types.ts` - DONE
2. `/server/src/routes/requirements.ts` - DONE
3. `/server/src/routes/scalingTasks.ts` - DONE
4. `/server/src/routes/targets.ts` - DONE
5. `/client/src/pages/ScalingPlannerV2.tsx` - DONE
6. `/client/src/pages/LeaderRequirementsDashboard.tsx` - DONE
7. `/client/src/components/scaling/index.ts` - DONE (added exports)

---

## Column Layout Plan

### Current (11 columns):
Hierarchy | Health | Target | Current | Gap | L4W Revenue | Meetup Stage | Revenue Status | Status Update | Tasks | Actions

### New (12 columns):
Hierarchy | Health | Target | Current | Gap | L4W Revenue | Meetup Stage | Revenue Status | Status Update | **Leaders** | Tasks | Actions

### Compression:
- Reduce padding: `px-4` → `px-3` on columns 3-10
- Leaders column: `w-16` (compact)

---

## Data Flow

```
V2 Dashboard Load:
  GET /api/targets/v2/hierarchy
    → Joins with leader_requirements aggregation
    → Returns HierarchyNode[] with leaders_required_total

Tooltip Hover:
  GET /api/requirements/leaders?club_id=X
    → Returns requirements with linked_tasks[]
    → Renders in LeaderRequirementsTooltip

Create Requirement:
  POST /api/requirements/leaders (with club_id required)
    → Then link tasks via junction table

Status Change from Tooltip:
  PUT /api/requirements/leaders/:id { status: 'in_progress' }
```

---

## Verification Checklist
- [ ] Database: Run migration, verify columns with `\d leader_requirements`
- [ ] API: Test CRUD endpoints via curl
- [ ] V2 Dashboard: Verify Leaders column shows correct rollup
- [ ] Tooltip: Hover on Leaders count, verify list and status change
- [ ] Create Modal: Create requirement, verify club is required
- [ ] Reverse Linking: Link tasks from requirement modal
- [ ] Leader Dashboard: Verify consistency with V2 dashboard
