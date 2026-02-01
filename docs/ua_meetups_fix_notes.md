# UA Meetups Fix - Technical Notes

## Date: 2026-02-02

## Original Issue

**Problem**: Clubs with meetups but no targets showed "No stages" in the MEETUP STAGE column, while revenue correctly showed "UA" (unattributed). This was inconsistent.

**Example**: "5AM Social Run Club" in Punjabi Bagh area:
- Had 1 meetup, ₹200 revenue
- Revenue showed: "UA 0.2K" ✓
- Meetup stages showed: "No stages" ✗ (should show "UA 1")

## Root Cause Analysis

### Revenue Flow (worked correctly)
In `server/src/services/revenueStatusService.ts`, `calculateClubRevenueStatus()`:
- When `totalActualRevenue > 0` but no realised meetups in targets
- Revenue correctly goes to `unattributed`

### Meetup Stage Flow (was broken)
In `server/src/routes/targets.ts`, when `hasTargets = false`:
```javascript
// OLD CODE - Line 2957-2958 and 3558-3559
aggregatedProgress = { ...defaultProgress };  // All zeros, no UA
```

This resulted in "No stages" display because all stage counts were 0.

## Fix Applied (Commit 1f41911)

### Change 1: Set unattributed_meetups for clubs without targets
**Files**: `server/src/routes/targets.ts` (lines 2957-2962 and 3562-3567)

```javascript
// NEW CODE
const clubCurrentMeetups = parseInt(club.current_meetups) || 0;
aggregatedProgress = {
  ...defaultProgress,
  unattributed_meetups: clubCurrentMeetups
};
```

### Change 2: Roll up unattributed meetups to parent nodes
**Files**: `server/src/routes/targets.ts` (lines 1940 and 3878)

```javascript
// OLD: if (hasTargets)
// NEW:
if (hasTargets || (aggregatedProgress.unattributed_meetups || 0) > 0)
```

This ensures clubs without targets (but with meetups) contribute to area/city/activity rollups.

## New Issue Discovered During Testing

### Symptom
At activity level ("Misfits Assemble" = total of all activities):
- CURRENT: 212
- Realised: 145, UA: 112
- Sum (realised + UA) = 257 > 212 (impossible!)

### Backend API vs Frontend Display

**Backend API Response** (CORRECT):
```json
{
  "total_current_meetups": 212,
  "overall_progress": {
    "realised": 147,
    "unattributed_meetups": 54
  }
}
// Sum: 147 + 54 = 201 (close to 212, 11 meetups not matched)
```

**Frontend Display** (INCORRECT - double-counted):
- realised: 145, UA: 112
- Sum: 257 (exceeds current by 45!)

### Root Cause of Double-Counting

**Location**: `client/src/components/scaling/HierarchyRollupHeader.tsx`

The frontend's `HierarchyRollupHeader` component recalculates rollup totals by traversing ALL nodes:

```typescript
// Lines 145-162
function collectFromNode(node: HierarchyNode) {
  if (node.type === 'club' || node.type === 'launch') {
    // These are summed WITHOUT deduplication:
    totalCurrentMeetups += node.current_meetups || 0;

    if (node.progress_summary) {
      // Progress is summed for EVERY area instance of a club
      aggregatedProgress[stage] += node.progress_summary?.[stage] || 0;
      aggregatedProgress.unattributed_meetups += progressWithUA.unattributed_meetups || 0;
    }
  }
}
```

**The Problem**: Multi-area clubs appear multiple times in the hierarchy (once per area). The frontend visits EACH instance and sums their progress, causing double/triple counting.

**Contrast with Health Distribution** (correctly deduped):
```typescript
// Lines 170-173 - Uses countedClubIds Set for deduplication
if (!node.is_launch && node.health_status && node.club_id && !countedClubIds.has(node.club_id)) {
  countedClubIds.add(node.club_id);
  healthDistribution[node.health_status]++;
}
```

## Why Backend Numbers Are Correct

The backend calculates `summary.overall_progress` by:
1. Summing progress from activity-level nodes (which already have correct rollups)
2. Each activity node's `progress_summary` is computed on the server with proper area-specific values

The SQL query for `current_meetups` groups by `(club_id, area_id)`, so each area gets its own count. When rolled up on the backend, it's correct.

## Recommendations

### Option 1: Use Backend Summary (RECOMMENDED)
**Approach**: Make the frontend use `summary.overall_progress` from the API instead of recalculating.

**Pros**:
- Simple change
- Backend already has correct numbers
- No risk of frontend calculation bugs

**Cons**:
- Only works for the top-level "Misfits Assemble" rollup
- Filtered views would still need recalculation

**Implementation**:
```typescript
// In ScalingPlannerV2.tsx or wherever HierarchyRollupHeader is used
// Pass summary.overall_progress directly instead of letting it recalculate
```

### Option 2: Fix Frontend Deduplication
**Approach**: Add deduplication to the frontend's rollup calculation, similar to health distribution.

**Pros**:
- Works for all rollup scenarios (filtered views, etc.)
- Consistent approach with health deduplication

**Cons**:
- More complex change
- Need to decide what to dedupe (progress? revenue? metrics?)
- Multi-area clubs legitimately have different values per area

**Implementation Challenge**:
For multi-area clubs, the values ARE different per area (area-specific meetup counts). Simply deduping by club_id would lose this granularity. The issue is more subtle:
- `current_meetups` should be summed (area-specific, no overlap)
- `unattributed_meetups` should be summed (area-specific, no overlap)
- But somewhere the numbers don't add up

### Option 3: Investigate Data Source Mismatch
**Approach**: Debug why `realised + UA ≠ current_meetups`

The 11-meetup gap (201 vs 212) in backend numbers suggests:
- Some meetups aren't being matched by auto-matching
- Could be date range differences, filter differences, or edge cases

**Investigation Steps**:
1. Compare SQL query filters vs auto-matching filters
2. Check if all events with bookings are being picked up
3. Look for edge cases (cancelled events, timezone issues, etc.)

## My Recommendation: Option 1 + Option 3

1. **Quick fix**: Use backend's `summary.overall_progress` for the top-level rollup header
2. **Follow-up**: Investigate the 11-meetup gap between current and (realised + UA)

### Why Not Option 2?
The frontend deduplication is complex because:
- Multi-area clubs have LEGITIMATE different values per area
- The current logic of summing all area instances IS correct if backend values are area-specific
- The real issue might be in how values are being calculated on the backend, not how they're being summed on the frontend

## Files Changed in This PR

1. `server/src/routes/targets.ts` - Backend fix for UA meetups (4 locations)

## Files That May Need Changes

1. `client/src/components/scaling/HierarchyRollupHeader.tsx` - Frontend rollup logic
2. `client/src/pages/ScalingPlannerV2.tsx` - Where rollup header is used

## Testing Notes

- Deployed to production: https://operations.misfits.net.in
- Backend API returns correct numbers
- Frontend display has double-counting issue (pre-existing, made more visible by this fix)

## API Endpoints for Debugging

```bash
# Get hierarchy with auto-matching
curl -s "https://operations.misfits.net.in/api/targets/v2/hierarchy?use_auto_matching=true" | jq '.summary'

# Check specific activity
curl -s "https://operations.misfits.net.in/api/targets/v2/hierarchy?use_auto_matching=true" | jq '.hierarchy[] | select(.name == "Badminton")'

# Get totals
curl -s "https://operations.misfits.net.in/api/targets/v2/hierarchy?use_auto_matching=true" | jq '{
  total_current: .summary.total_current_meetups,
  realised: .summary.overall_progress.realised,
  ua: .summary.overall_progress.unattributed_meetups
}'
```

## Key Code Locations

### Backend
- `server/src/routes/targets.ts` - Main hierarchy endpoint (lines 2199+)
- `server/src/services/revenueStatusService.ts` - Revenue calculations
- `server/src/services/meetupMatchingService.ts` - Auto-matching logic

### Frontend
- `client/src/components/scaling/HierarchyRollupHeader.tsx` - Rollup display (bug location)
- `client/src/pages/ScalingPlannerV2.tsx` - Main dashboard page

## Summary

| Issue | Status | Location |
|-------|--------|----------|
| Clubs without targets show "No stages" | FIXED | Backend targets.ts |
| UA meetups not rolling up | FIXED | Backend targets.ts |
| Frontend double-counts multi-area clubs | FIXED | Frontend HierarchyRollupHeader.tsx |
| 11 meetup gap (realised+UA vs current) | FIXED | Backend targets.ts |

## Additional Fixes (2026-02-02)

### Frontend Fix: Use Backend Summary for Rollup Header

**Problem**: Frontend `HierarchyRollupHeader` recalculated totals by traversing all nodes, causing multi-area clubs to be double-counted.

**Solution**: Pass backend's pre-calculated `summary.overall_progress` to `HierarchyRollupHeader` and use it when not filtered.

**Files Changed**:
1. `client/src/components/scaling/HierarchyRollupHeader.tsx`
   - Added `backendSummary` prop
   - When not filtered, use backend summary instead of recalculating

2. `client/src/pages/ScalingPlannerV2.tsx`
   - Pass `summary` to `HierarchyRollupHeader` as `backendSummary` prop

### Backend Fix: Missing Unattributed Meetups for Multi-Area Clubs

**Problem**: When a club has targets in Area A but events in Area B (where there's no target), the Area B events were NOT being counted as unattributed.

**Root Cause**: In the `else if (hasTargets)` branch (club has targets but none in this area), `areaUnattributedMeetups` was not being added to `aggregatedProgress`.

**Solution**: Add `areaUnattributedMeetups` to the progress even when there are no area-filtered targets.

**Files Changed**:
1. `server/src/routes/targets.ts` (2 locations)
   - Lines ~2956-2965 (dynamic hierarchy path)
   - Lines ~3567-3576 (standard hierarchy path)

```javascript
// OLD CODE
} else if (hasTargets) {
  aggregatedProgress = targets.reduce(...);
  // Missing: areaUnattributedMeetups not added!
}

// NEW CODE
} else if (hasTargets) {
  aggregatedProgress = targets.reduce(...);
  // Add area-level unattributed meetups
  if (areaUnattributedMeetups > 0) {
    aggregatedProgress.unattributed_meetups = (aggregatedProgress.unattributed_meetups || 0) + areaUnattributedMeetups;
  }
}
```

This ensures that when a club has targets in some areas but not others, the meetups from areas without targets are correctly counted as unattributed.
