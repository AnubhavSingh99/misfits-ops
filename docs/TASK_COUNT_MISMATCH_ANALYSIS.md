# Task Count Mismatch Analysis

**Date:** 2026-01-27
**Issue:** Summary count shows more tasks than Sprint Modal displays
**Status:** ✅ FIXED AND TESTED

---

## Current Status (2026-01-27 19:30 IST)

### ✅ All Fixes Implemented and Tested

| Fix | Status | Details |
|-----|--------|---------|
| Fix 1: Sprint Modal use IDs directly | ✅ Complete | Uses context IDs like Tooltip does |
| Fix 2: Data migration (local only) | ✅ Complete | Production data was clean |
| Fix 3A: Auto-sync dropdown | ✅ Complete | Prevents name-only context issues |
| Fix 3B: Frontend validation | ✅ Complete | Blocks "All Data" tasks |
| Fix 3C: Backend validation | ✅ Complete | Defense in depth |
| **NEW: Older Tasks Section** | ✅ Complete | Shows ALL tasks including pre-window |

### Root Cause Found

**The REAL issue was TIME WINDOW MISMATCH:**
- Summary counts ALL open tasks (not_started, in_progress)
- Sprint Modal only showed tasks within 5-week window (current ±1 week + 3 weeks forward)
- Tasks from Jan 5-11, Jan 12-18, Jan 19-25 were outside the window

### Solution: "Older Tasks" Section

Added a collapsible "Older Tasks" section at the top of Sprint Modal that:
- Shows tasks from weeks BEFORE the 5-week sprint window
- Groups tasks by week
- Includes count in header total (e.g., "5 total", "5 overdue")
- Works at ALL hierarchy levels (Activity, City, Area, Club)

### Test Results (dev-browser)

| Test | Result |
|------|--------|
| Activity level (Box Cricket) | ✅ 5 total, 5 in older tasks |
| City level (Box Cricket > Gurgaon) | ✅ 2 total, 2 in older tasks |
| Older Tasks section visible | ✅ Collapsible, orange warning style |
| Older Tasks expandable | ✅ Shows tasks grouped by week |

---

## Problem Statement

When clicking on a hierarchy row (e.g., "Box Cricket"), the task count in the summary (e.g., "7 tasks") doesn't match the number of tasks shown in the Sprint Modal (e.g., "3 tasks").

---

## Data Flow Analysis

### Three Different Systems Count Tasks Differently

| System | API Endpoint | How It Counts |
|--------|--------------|---------------|
| **Summary Count** | `/api/scaling-tasks/summary/by-hierarchy` | Groups by TEXT NAMES, no week check |
| **Tooltip** | `/api/scaling-tasks` | Filters by IDs, LEFT JOIN with weeks |
| **Sprint Modal** | `/api/scaling-tasks/sprints` | Filters by IDs (via name lookup), INNER JOIN with weeks, 5-week window |

### 1. Summary Count (the number on the row)

**Backend** (`server/src/routes/scalingTasks.ts` lines 374-445):
```sql
SELECT
  activity_name, city_name, area_name, club_name,
  COUNT(*) FILTER (WHERE status = 'not_started') as not_started,
  ...
FROM scaling_tasks
WHERE (created_at >= last_week OR status IN ('not_started', 'in_progress'))
GROUP BY activity_name, city_name, area_name, club_name
```

**Frontend** (`client/src/components/scaling/taskRollup.ts`):
- Builds lookup keys from NAMES: `"box cricket|gurgaon|golf course road"`
- Recursively aggregates counts from children

**Key Point:** Uses TEXT NAMES to match and aggregate

### 2. Tooltip (hover popup)

**Code** (`client/src/components/scaling/TaskListTooltip.tsx` lines 677-682):
```javascript
if (node.activity_id) params.append('activity_id', node.activity_id.toString());
if (node.city_id) params.append('city_id', node.city_id.toString());
```

**Key Point:** Uses NUMERIC IDs directly from the hierarchy node

### 3. Sprint Modal

**Code** (`client/src/components/scaling/SprintViewModal.tsx` lines 151-190):
```javascript
// Converts names to IDs by searching filter options
if (context.activity_name) {
  const matchedActivity = actOptions.find(
    (a) => a.name?.toLowerCase() === context.activity_name?.toLowerCase()
  );
  if (matchedActivity?.id) newActivityFilters.push(matchedActivity.id);
}
```

**Backend** (`server/src/routes/scalingTasks.ts` lines 275-286):
```sql
FROM scaling_tasks st
JOIN scaling_task_weeks stw ON st.id = stw.task_id  -- INNER JOIN!
WHERE stw.week_start >= $X AND stw.week_start <= $Y
  AND st.activity_id = ANY([...])
```

**Key Points:**
1. Converts context NAMES to IDs (can fail)
2. Uses INNER JOIN (excludes tasks without weeks)
3. Only shows 5-week window

---

## Root Causes Identified

### Root Cause 1: ID vs Name Mismatch

**Evidence from database:**
```
| id | activity_name | activity_id | What's Wrong |
|----|---------------|-------------|--------------|
| 1  | Badminton     | 1           | Should be 31 (1 = Board Gaming) |
| 3  | Badminton     | 1           | Should be 31 |
| 23 | Badminton     | NULL        | Missing ID |
| 24 | Badminton     | NULL        | Missing ID |
| 25 | All Data      | NULL        | Missing ID |
```

**Production activity IDs:**
- ID 1 = Board Gaming
- ID 30 = Box Cricket
- ID 31 = Badminton

**Impact:**
- Summary: Counts task by name "Badminton" → ✅ Included
- Sprint Modal: Filters by activity_id = 31 → ❌ Excluded (task has id=1 or NULL)

### Root Cause 2: Different JOIN Types

**Tooltip uses LEFT JOIN:**
```sql
FROM scaling_tasks st
LEFT JOIN scaling_task_weeks stw ON st.id = stw.task_id
```
Includes tasks even without week assignments.

**Sprint Modal uses INNER JOIN:**
```sql
FROM scaling_tasks st
JOIN scaling_task_weeks stw ON st.id = stw.task_id
```
Excludes tasks without week assignments.

**Current state:** All 34 tasks have week assignments, so this isn't causing issues NOW, but it's a fragility.

### Root Cause 3: Time Window Mismatch

**Summary:** Counts all open tasks (not_started, in_progress) regardless of age
**Sprint Modal:** Only shows tasks within 5-week window

Old tasks still open would appear in summary but not in sprint.

---

## How Bad Data Got Created

### Analysis of Task Creation Flow

1. **User clicks "+ Task"** on hierarchy row
2. **Modal opens** with context from `getScalingTaskContext(node)`
3. **Context built** from `findParentContext()` + node properties

**Code** (`ScalingPlannerV2.tsx` lines 3559-3567):
```javascript
return {
  activity_id: parentContext.activity_id || node.activity_id,
  activity_name: parentContext.activity_name || node.activity_name || ...,
  ...
}
```

**Code** (`ScalingTaskCreateModal.tsx` lines 86-94):
```javascript
const [selectedActivityId, setSelectedActivityId] = useState<number | undefined>(context.activity_id);
```

**On submit** (lines 464-471):
```javascript
const payload = {
  activity_id: selectedActivityId || context.activity_id,
  activity_name: selectedActivityName || context.activity_name,
  ...
}
```

### Detailed Investigation: Which Modal Creates Bad Data

**Two task creation entry points exist:**

1. **ScalingPlannerV2.tsx** - "+ Task" button on hierarchy rows
   - Uses `getScalingTaskContext(node)` (lines 3546-3578)
   - Gets context from `findParentContext()` (lines 3184-3212)
   - Opens `ScalingTaskCreateModal`

2. **SprintViewModal.tsx** - "+ Add Task" inside sprint modal
   - Uses `getCreateContext()` (lines 515-535)
   - Also opens `ScalingTaskCreateModal`

Both paths send context to the same modal.

---

### Root Cause: NULL activity_id (Tasks 23, 24, 25)

**The "All Data" Rollup Row Bug:**

When no filters are applied, the dashboard shows an "All Data" rollup row. This rollup row is created in `ScalingPlannerV2.tsx` (lines 3998-4018):

```javascript
const rollupNode = useMemo((): HierarchyNode => {
  return {
    type: 'activity',
    id: 'rollup-all',
    name: hasActiveFilters ? 'Filtered Data' : 'All Data',
    activity_id: rollupFilterContext.activity_id,  // UNDEFINED when no filters!
    ...
  }
}, ...)
```

`rollupFilterContext` only has activity_id when exactly ONE activity is filtered (lines 3950-3956). With no filters or multiple activities filtered, `activity_id` is undefined.

**What happens when user clicks "+ Task" on "All Data" row:**

1. `getScalingTaskContext(rollupNode)` is called
2. Context has `activity_name: "All Data"` but `activity_id: undefined`
3. Modal opens with `selectedActivityId = undefined` (line 87)
4. Activity dropdown shows "Select Activity" (not "All Data")
5. If user doesn't change the dropdown, submission uses:
   - `activity_id: undefined || undefined = undefined`
   - `activity_name: undefined || "All Data" = "All Data"`

**Result:** Task created with `activity_name="All Data"` and `activity_id=NULL`

---

### Root Cause: Wrong activity_id (Tasks 1, 3)

**The Dropdown/Context Mismatch Bug:**

Tasks 1 and 3 were the first tasks created (Jan 6) with:
- `activity_name = "Badminton"`
- `activity_id = 1` (should be 31, as 1 = Board Gaming)
- `city_id = 1` (correct for Gurgaon)

**Possible scenario:**

1. Hierarchy node had `activity_name` but not `activity_id` set (early system bug)
2. Modal opened with `selectedActivityId = undefined`
3. Activity dropdown loaded with "Board Gaming" as first option (id=1)
4. User saw "Badminton" displayed somewhere else (context name) but dropdown showed "Select Activity"
5. User selected the first item "Board Gaming" (id=1) thinking it was Badminton
6. OR: There was a copy/paste bug where `city_id` (1) got assigned to `activity_id`

**Evidence supporting early bug:** The coincidence that both `activity_id=1` and `city_id=1` suggests potential code confusion between the two fields.

---

### Specific Evidence from Database

| Task ID | Created At | activity_name | activity_id | city_name | city_id | Notes |
|---------|------------|---------------|-------------|-----------|---------|-------|
| 1 | Jan 6 14:37 | Badminton | 1 | Gurgaon | 1 | WRONG: should be 31 |
| 3 | Jan 6 14:38 | Badminton | 1 | | | WRONG: should be 31 |
| 23 | Jan 7 04:05 | Badminton | NULL | | | Created from "All Data" or similar |
| 24 | Jan 7 04:13 | Badminton | NULL | Faridabad | | Created from "All Data" or similar |
| 25 | Jan 7 04:27 | All Data | NULL | | | Created from "All Data" rollup row |

**Production activity IDs confirmed:**
- ID 1 = Board Gaming (NOT Badminton!)
- ID 31 = Badminton

---

### The Core Problem in ScalingTaskCreateModal

The modal's dropdown value is based on `selectedActivityId`, not `selectedActivityName`:

```javascript
<select value={selectedActivityId || ''}>  // Shows "Select Activity" if ID is undefined
```

But the context might have `activity_name` without `activity_id`. So:
- Dropdown shows "Select Activity" (no ID)
- But `selectedActivityName` already has a value from context
- User assumes the context is correct and doesn't change dropdown
- Submission sends `activity_name` from context but no `activity_id`

---

## Recommended Fixes

### Fix 1: Sprint Modal - Use IDs Directly (HIGH PRIORITY)

**Problem:** Sprint Modal converts names to IDs, which can fail
**Solution:** Use IDs directly from context, like Tooltip does

**File:** `client/src/components/scaling/SprintViewModal.tsx`

**Current (lines 151-190):**
```javascript
if (context.activity_name) {
  const matchedActivity = actOptions.find(
    (a) => a.name?.toLowerCase() === context.activity_name?.toLowerCase()
  );
  if (matchedActivity?.id) newActivityFilters.push(matchedActivity.id);
}
```

**Fixed:**
```javascript
// Use IDs directly from context (like TaskListTooltip does)
if (context?.activity_id) setActivityFilters([context.activity_id]);
if (context?.city_id) setCityFilters([context.city_id]);
if (context?.area_id) setAreaFilters([context.area_id]);
if (context?.club_id) setClubFilters([context.club_id]);
```

### Fix 2: Data Cleanup Migration (HIGH PRIORITY)

**File:** `server/database/migrations/fix_task_hierarchy_ids.sql`

```sql
-- Fix Badminton tasks with wrong activity_id
UPDATE scaling_tasks
SET activity_id = 31
WHERE LOWER(activity_name) = 'badminton'
  AND (activity_id IS NULL OR activity_id != 31);

-- Verify fix
SELECT id, activity_name, activity_id
FROM scaling_tasks
WHERE LOWER(activity_name) = 'badminton';
```

### Fix 3: Prevent Future Bad Data (MEDIUM PRIORITY)

**Problem:** Tasks can be created with wrong/missing IDs
**Solution:** Multiple layers of defense

#### Fix 3A: Sync dropdown value with context name on modal open

**Problem:** Dropdown shows "Select Activity" even when `context.activity_name` exists

**File:** `client/src/components/scaling/ScalingTaskCreateModal.tsx`

**Add useEffect after state initialization (around line 105):**
```javascript
// Auto-select activity in dropdown if context has name but no ID
useEffect(() => {
  if (isOpen && context.activity_name && !selectedActivityId && activities.length > 0) {
    const matched = activities.find(
      a => a.name?.toLowerCase() === context.activity_name?.toLowerCase()
    );
    if (matched?.id) {
      setSelectedActivityId(matched.id);
      setSelectedActivityName(matched.name);
    }
  }
}, [isOpen, context.activity_name, selectedActivityId, activities]);
```

#### Fix 3B: Frontend validation before submit

**Add to handleSubmit (before payload creation):**
```javascript
// Ensure activity is selected if activity_name exists
const finalActivityName = selectedActivityName || context.activity_name;
let finalActivityId = selectedActivityId || context.activity_id;

if (finalActivityName && !finalActivityId) {
  const matched = activities.find(
    a => a.name?.toLowerCase() === finalActivityName?.toLowerCase()
  );
  if (matched?.id) {
    finalActivityId = matched.id;
  } else {
    toast.error('Please select a valid activity from the dropdown');
    return;
  }
}

// Block "All Data" as activity name - it's not a real activity
if (finalActivityName?.toLowerCase() === 'all data' ||
    finalActivityName?.toLowerCase() === 'filtered data') {
  toast.error('Please select a specific activity, not "All Data"');
  return;
}
```

#### Fix 3C: Backend validation (defense in depth)

**File:** `server/src/routes/scalingTasks.ts` (POST endpoint)

```javascript
// Validate/repair activity_id from activity_name
if (activity_name && !activity_id) {
  // Skip fake activity names
  if (['all data', 'filtered data'].includes(activity_name.toLowerCase())) {
    return res.status(400).json({
      error: 'Invalid activity name. Please select a specific activity.'
    });
  }

  const activityResult = await queryProduction(
    'SELECT id FROM activity WHERE LOWER(name) = LOWER($1)',
    [activity_name]
  );
  if (activityResult.rows.length > 0) {
    activity_id = activityResult.rows[0].id;
  } else {
    return res.status(400).json({
      error: `Activity "${activity_name}" not found in database`
    });
  }
}

// Similar validation for city_id, area_id
```

#### Fix 3D: Block task creation from "All Data" row (optional)

**File:** `client/src/pages/ScalingPlannerV2.tsx`

In the rollup row component, disable the "+ Task" button:
```javascript
<button
  onClick={() => setScalingTaskNode(rollupNode)}
  disabled={!hasActiveFilters}  // Can only create tasks when filtered to specific scope
  title={!hasActiveFilters ? "Filter to a specific activity first" : "Create task"}
>
```

### Fix 4: Change to LEFT JOIN (LOW PRIORITY)

**Problem:** INNER JOIN excludes tasks without week assignments
**Solution:** Use LEFT JOIN and show unscheduled tasks

**File:** `server/src/routes/scalingTasks.ts` (line 282)

**Current:**
```sql
FROM scaling_tasks st
JOIN scaling_task_weeks stw ON st.id = stw.task_id
```

**Fixed:**
```sql
FROM scaling_tasks st
LEFT JOIN scaling_task_weeks stw ON st.id = stw.task_id
```

Then in frontend, show tasks with NULL week_start in a "Backlog" section.

### Fix 5: Align Time Windows (LOW PRIORITY)

Either:
- Expand Sprint Modal to show all open tasks (add "Backlog" section)
- Limit Summary to only count tasks within sprint window

---

## Implementation Order

| Priority | Fix | Effort | Impact |
|----------|-----|--------|--------|
| 1 | Fix 1: Sprint Modal filtering | Small | Fixes main count mismatch bug |
| 2 | Fix 2: Data cleanup | Small | Fixes existing bad data (5 tasks) |
| 3 | Fix 3A: Auto-sync dropdown | Small | Prevents most future issues |
| 4 | Fix 3B: Frontend validation | Small | Catches remaining edge cases |
| 5 | Fix 3C: Backend validation | Small | Defense in depth |
| 6 | Fix 3D: Block "All Data" tasks | Optional | UX improvement |
| 7 | Fix 4: LEFT JOIN | Medium | Handles tasks without weeks |
| 8 | Fix 5: Time windows | Medium | Handles old tasks |

---

## Files to Modify

| File | Changes |
|------|---------|
| `client/src/components/scaling/SprintViewModal.tsx` | Use context IDs directly (Fix 1) |
| `server/database/migrations/fix_task_hierarchy_ids.sql` | Data cleanup (Fix 2) |
| `client/src/components/scaling/ScalingTaskCreateModal.tsx` | Auto-sync dropdown + validation (Fix 3A, 3B) |
| `server/src/routes/scalingTasks.ts` | Backend validation + LEFT JOIN (Fix 3C, 4) |
| `client/src/pages/ScalingPlannerV2.tsx` | Disable task creation on "All Data" row (Fix 3D, optional) |

---

## Testing Checklist

After fixes:
- [x] Summary count matches Sprint Modal total ✅
- [x] Tooltip count matches Sprint Modal total ✅
- [x] New tasks created have correct IDs ✅
- [x] Production data verified clean ✅
- [x] Older Tasks section shows pre-window tasks ✅
- [x] Works at Activity level ✅
- [x] Works at City level ✅
- [x] Works regardless of hierarchy order ✅

---

## Files Modified

### Backend
- `server/src/routes/scalingTasks.ts`
  - Added `olderTasks` query in `/api/scaling-tasks/sprints` endpoint
  - Returns `olderTasks: { groupedByWeek, sortedWeeks, totalCount }` in response
  - Added backend validation for activity_id

### Frontend
- `client/src/components/scaling/SprintViewModal.tsx`
  - Changed to use context IDs directly (like Tooltip)
  - Added state for older tasks
  - Added collapsible "Older Tasks" section with orange styling
  - Updated header to show total including older tasks

- `client/src/components/scaling/ScalingTaskCreateModal.tsx`
  - Added auto-sync dropdown with context name
  - Added frontend validation to block "All Data" tasks
  - Added auto-resolve activity_id from name

### Database Migration (local only)
- `server/database/migrations/fix_task_hierarchy_ids.sql`
  - Fixes badminton tasks with wrong activity_id
  - Not needed on production (data was clean)
