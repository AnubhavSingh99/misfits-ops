# Venue Requirements Inheritance Fix

## Current Session Summary (2026-01-22)

### What Was Done

1. **Health Tooltip Fix** - Fixed double-counting in health distribution tooltip
   - Added `Set<club_id>` deduplication in `HierarchyRollupHeader.tsx`
   - Updated `rollupHealth` function in `server/src/routes/targets.ts` to be hierarchy-agnostic
   - Now correctly aggregates health from both leaf nodes (clubs) and roll-up nodes (areas/cities/activities)

2. **Venue Requirements Launch Support** - Added ability to create venue requirements for launches
   - Created migration `add_venue_requirements_launch_id.sql` adding `launch_id` and `target_id` columns
   - Updated POST endpoint in `server/src/routes/requirements.ts` to accept `launch_id` and `target_id`
   - Updated `VenueRequirementsDashboard.tsx` CreateRequirementModal with dropdown for clubs/launches/expansion targets
   - Updated `/api/requirements/clubs-and-launches` endpoint to also return expansion targets

3. **Shared Types Updated**
   - Added `target_id` to `CreateRequirementRequest` interface in `shared/types.ts`

### What Needs To Be Done

#### 1. Fix Context Inheritance in ScalingPlannerV2

**Problem**: When creating a task from a hierarchy node (e.g., "Chess > South Delhi > Sector 28"), only partial context is passed. For example, only `activity_id` might be passed, not `city_id` and `area_id`.

**Files to check/fix**:
- `client/src/pages/ScalingPlannerV2.tsx` - Where task creation is triggered
- Look for `setScalingTaskNode`, `onCreateTask`, or similar
- Find where context is built for task creation modal

**Fix needed**: Ensure full hierarchy context is passed:
```typescript
{
  activity_id, activity_name,
  city_id, city_name,
  area_id, area_name,
  club_id, club_name,
  launch_id,  // if it's a launch node
  target_id   // if it's an expansion target
}
```

#### 2. Fix RequirementSelector Context Inheritance

**Problem**: `RequirementSelector.tsx` context interface doesn't include `launch_id` or `target_id`

**Already done**:
- Updated interface to include `launch_id` and `target_id` in props

**Still needed**:
- Update `handleSubmit` in CreateRequirementModal to pass `launch_id` and `target_id`:
```typescript
await onCreate({
  // ... existing fields ...
  launch_id: context.launch_id,
  target_id: context.target_id,
});
```

#### 3. Ensure Context is Visible in UI

**Problem**: When creating requirements, the inherited context should be clearly visible in the modal UI

**Files to update**:
- `client/src/components/scaling/RequirementSelector.tsx` - The CreateRequirementModal inside
- Show badges/chips for: Activity, City, Area, Club/Launch/Expansion Target

**Current UI shows**:
- activity_name, city_name, area_name, club_name as badges

**Need to add**:
- Launch indicator (if launch_id is set)
- Expansion target indicator (if target_id is set)

### Key Files Reference

1. **Backend - Requirements API**: `server/src/routes/requirements.ts`
   - POST `/api/requirements/venues` - lines 968-1017
   - GET `/api/requirements/clubs-and-launches` - lines 1111-1265

2. **Frontend - VenueRequirementsDashboard**: `client/src/pages/VenueRequirementsDashboard.tsx`
   - CreateRequirementModal function - starts around line 1708
   - Uses dropdown for club/launch/expansion selection

3. **Frontend - RequirementSelector**: `client/src/components/scaling/RequirementSelector.tsx`
   - Used in ScalingTaskCreateModal and ScalingTaskEditModal
   - CreateRequirementModal - starts around line 306
   - Uses inheritance (context passed from parent)

4. **Frontend - ScalingPlannerV2**: `client/src/pages/ScalingPlannerV2.tsx`
   - Task creation context building
   - Look for: `setScalingTaskNode`, `ScalingTaskCreateModal`, context props

5. **Database Migration**: `server/database/migrations/add_venue_requirements_launch_id.sql`
   - Added `launch_id` and `target_id` columns to `venue_requirements`

### Database Schema - venue_requirements

```sql
-- Columns for linking
club_id INTEGER,
club_name VARCHAR(100),
launch_id INTEGER,  -- NEW: for new club launches
target_id INTEGER,  -- NEW: for expansion targets
```

### API Response - clubs-and-launches

```json
{
  "success": true,
  "clubs": [{ "id": 123, "name": "Club Name", "type": "club" }],
  "launches": [{ "id": 456, "name": "Launch Name", "type": "launch" }],
  "expansionTargets": [{ "target_id": 789, "club_id": 123, "name": "Expansion - Area", "type": "expansion" }]
}
```

### Inheritance Flow

```
ScalingPlannerV2 (hierarchy node clicked)
  → ScalingTaskCreateModal (receives full context)
    → RequirementSelector (receives context from task)
      → CreateRequirementModal (inherits context, passes to API)
        → POST /api/requirements/venues (stores with launch_id/target_id)
```

### Testing Checklist

- [ ] Create venue requirement from VenueRequirementsDashboard for a club
- [ ] Create venue requirement from VenueRequirementsDashboard for a launch
- [ ] Create venue requirement from VenueRequirementsDashboard for an expansion target
- [ ] Create task from ScalingPlannerV2 at activity level - verify context
- [ ] Create task from ScalingPlannerV2 at city level - verify full context
- [ ] Create task from ScalingPlannerV2 at area level - verify full context
- [ ] Create task from ScalingPlannerV2 for a launch - verify launch_id passed
- [ ] Create task from ScalingPlannerV2 for expansion target - verify target_id passed
- [ ] Create venue requirement from task modal - verify inheritance works
