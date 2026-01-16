# Projected Revenue Bug - Root Cause Analysis

## Issue Summary
**Reported**: Projected revenue in summary tiles shows ₹16.5L while last week revenue shows ₹3.7L. The math doesn't match because `current_revenue ≠ RA + UA`.

## Bug Confirmed
- **Current Revenue**: ₹3.74L (correct)
- **RA + UA**: ₹3.92L (over-counted by ₹0.18L)
- **Difference**: ₹18K being double-counted

## Root Cause

### The Bug is in Multi-Area Clubs
When a club operates in **multiple areas**, the same revenue gets counted in EACH area node.

### Specific Example: Music > Gurgaon > "Gurgaon Music Collective"

| Area | current_revenue | RA (realised_actual) |
|------|-----------------|-----|
| Golf Course Road | **₹0** | **₹17,983** |
| South City | **₹17,983** | **₹17,983** |

- The club has meetups only in **South City** (current = ₹17,983)
- But RA shows ₹17,983 in **BOTH** areas
- Result: ₹17,983 is counted **twice** in the rollup

### Why This Happens

1. **Auto-matching** calculates revenue for the **entire club** across all areas
2. When building hierarchy, the same club appears under **multiple area nodes**
3. The auto-match `revenue_status` (which includes RA/UA) gets applied to **each area instance**
4. Result: **double-counting**

### Code Location
File: `server/src/routes/targets.ts` around lines 2869-2884:

```javascript
if (hasTargets && areaFilteredTargets.length > 0) {
  // BUG: targetStatuses contain revenue from ALL areas, not just current area
  const targetStatuses = areaFilteredTargets.map((t: any) => t.revenue_status);
  clubRevenueStatus = rollupRevenueStatuses(targetStatuses);
  clubRevenueStatus.unattributed += areaUnattributedRevenue;
}
```

The issue: `t.revenue_status` contains matched revenue from **all areas**, but we're building a node for a **specific area**.

## Data Flow

1. `current_revenue` - Calculated correctly per-area in SQL query with `GROUP BY ar.id`
2. `revenue_status` (RA/UA) - Comes from auto-matching which returns **total club revenue** regardless of area
3. When club appears in multiple areas → same revenue attributed to each → **over-counting**

## Fix Options

### Option 1: Fix the Data (Simpler if applicable)
Set `production_area_id` on all targets so they're area-specific. This prevents targets from matching meetups across multiple areas.

**Limitation**: Only works if each target should belong to a single area.

### Option 2: Fix the Code
When building area nodes, filter `matched_meetups` by the current `areaId` before calculating revenue_status:

```javascript
if (hasTargets && areaFilteredTargets.length > 0) {
  // FIX: Recalculate revenue status using only meetups from THIS area
  const areaSpecificStatuses = areaFilteredTargets.map((t: any) => {
    // Filter matched meetups to only this area
    const areaMatchedMeetups = (t.matched_meetups || []).filter(
      (m: any) => m.area_id === areaId
    );
    const areaMatchedCount = areaMatchedMeetups.length;
    const areaMatchedRevenue = areaMatchedMeetups.reduce(
      (sum: number, m: any) => sum + (m.revenue || 0), 0
    );

    // Recalculate revenue attribution for this area only
    return calculateRevenueAttribution(
      { target_revenue: t.target_revenue, target_meetups: t.target_meetups },
      areaMatchedCount,
      areaMatchedRevenue,
      t.new_progress
    );
  });
  clubRevenueStatus = rollupRevenueStatuses(areaSpecificStatuses);
  clubRevenueStatus.unattributed += areaUnattributedRevenue;
}
```

**Note**: Same fix needed in the other hierarchy code path (around line 3467-3478) for non-default hierarchy orders.

## Verification Query

To find clubs causing the discrepancy:
```bash
curl -s "https://operations.misfits.net.in/api/targets/v2/hierarchy?week_start=2026-01-05&use_auto_matching=true" | jq '
  [.hierarchy[] |
    select(.type == "activity") |
    {
      name: .activity_name,
      current: .current_revenue,
      ra: (.revenue_status.realised_actual // 0),
      ua: (.revenue_status.unattributed // 0),
      diff: (.current_revenue - ((.revenue_status.realised_actual // 0) + (.revenue_status.unattributed // 0)))
    }
  ] | map(select(.diff > 100 or .diff < -100))
'
```

Result shows **Music** activity with ₹18K discrepancy.

## Principle Violated

The code comment states:
```javascript
// Key principle: current_revenue = realised_actual + unattributed (ALWAYS)
```

This principle is violated when clubs operate in multiple areas.

## Impact
- Projected Revenue in summary tiles is inflated
- Per-area revenue status (RA/UA) is incorrect for multi-area clubs
- Affects data accuracy for planning/forecasting

## Status
- [x] Bug identified
- [x] Root cause found
- [x] Fix implemented
- [x] Fix tested
- [x] Deployed (2026-01-16, version 260116-1448)

## Actual Root Cause (Updated)

The bug documentation above describes the symptoms correctly, but the **actual root cause** was simpler:

### Missing `production_area_id` in Auto-Match Results

In `server/src/services/meetupMatchingService.ts`, the auto-match result did NOT include `production_area_id`:

```javascript
// BEFORE (buggy):
result.targets.push({
  target_id: target.target_id,
  target_name: target.target_name,
  // production_area_id: MISSING!
  matched_meetups: matchedMeetups,
  ...
});
```

This caused the hierarchy filtering to fail:

```javascript
// In targets.ts:
const areaFilteredTargets = autoMatchResult?.targets.filter((t: any) => {
  const targetProdAreaId = t.production_area_id;  // undefined!
  return !targetProdAreaId || targetProdAreaId === areaId;  // !undefined = true, ALL pass!
});
```

Since `production_area_id` was undefined, `!targetProdAreaId` was always `true`, causing ALL targets to pass the filter regardless of area.

### Fix Applied

Added `production_area_id: target.production_area_id` to the result in `meetupMatchingService.ts` (line 672).
