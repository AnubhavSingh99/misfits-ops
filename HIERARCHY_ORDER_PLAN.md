# Hierarchy Order Feature - Implementation Plan

## Overview

Add hierarchy ordering (drag-and-drop reorder + enable/disable levels) to the V2 Scaling Dashboard, similar to the Leader Requirements Dashboard.

**Constraints:**
- Clubs always remain at the bottom (leaf nodes)
- Only Activity, City, Area can be reordered
- Launches follow their activity/city/area context
- Users can disable levels to flatten hierarchy

---

## Current State Analysis

### V2 Dashboard Hierarchy (Fixed Order)
```
Activity
  └── City
        └── Area
              └── Club (with targets as children)
                    └── Target (optional children)
```

### Key Data at Each Level
| Level | Data |
|-------|------|
| Activity | Rollup of: target_meetups, target_revenue, current_*, gap_*, progress_summary, L4W revenue, revenue_status |
| City | Same rollups |
| Area | Same rollups |
| Club | Actual data: targets, progress, revenue_status, team, has_target |
| Target | Individual target data |

### Current Node ID Format
```
activity:5
activity:5-city:10
activity:5-city:10-area:25
activity:5-city:10-area:25-club:123
activity:5-city:10-area:25-club:123-target:456
```

---

## Implementation Plan

### Phase 1: Backend Changes

**File:** `server/src/routes/targets.ts`

**Endpoint:** `GET /api/targets/v2/hierarchy`

#### 1.1 Accept hierarchy_order parameter
```typescript
const hierarchyOrder = req.query.hierarchy_order
  ? String(req.query.hierarchy_order).split(',').filter(l => ['activity', 'city', 'area'].includes(l))
  : ['activity', 'city', 'area'];
```

#### 1.2 Refactor hierarchy building

**Current approach:** Hardcoded nested Maps
```typescript
const activityMap = new Map<number, any>();
// ... nested city, area maps
```

**New approach:** Dynamic level-based building
```typescript
// Build hierarchy dynamically based on hierarchyOrder
function buildDynamicHierarchy(clubs, targets, hierarchyOrder) {
  const rootMap = new Map();

  for (const club of clubs) {
    // Get level values for this club
    const levelValues = {
      activity: { id: club.activity_id, name: club.activity_name },
      city: { id: club.city_id, name: club.city_name },
      area: { id: club.area_id, name: club.area_name }
    };

    // Traverse/create path through hierarchy based on order
    let currentMap = rootMap;
    let currentKey = '';

    for (let i = 0; i < hierarchyOrder.length; i++) {
      const level = hierarchyOrder[i];
      const levelValue = levelValues[level];
      const levelKey = `${level}:${levelValue.id}`;

      // Create node if doesn't exist
      if (!currentMap.has(levelKey)) {
        currentMap.set(levelKey, createLevelNode(level, levelValue, currentKey));
      }

      const node = currentMap.get(levelKey);
      currentKey = currentKey ? `${currentKey}-${levelKey}` : levelKey;

      if (i === hierarchyOrder.length - 1) {
        // Last level before clubs - add club as child
        node.children.push(createClubNode(club, targets, currentKey));
      } else {
        // Intermediate level - continue traversal
        if (!node.childrenMap) node.childrenMap = new Map();
        currentMap = node.childrenMap;
      }
    }
  }

  return convertMapToArray(rootMap);
}
```

#### 1.3 Update rollup calculations

Rollups must work bottom-up regardless of hierarchy order:
1. Club level: Calculate from targets
2. Parent levels: Aggregate from children (regardless of what type children are)

**Key insight:** Rollup logic doesn't care about level type, only parent-child relationship.

#### 1.4 Handle edge cases

1. **Empty hierarchyOrder:** Default to ['activity', 'city', 'area']
2. **Single level:** Only that level shown, clubs directly under it
3. **Disabled levels:** Skip them in hierarchy (e.g., order=['activity'] means Activity → Club)
4. **Launches:** Include in hierarchy at their planned location
5. **Unknown city/area:** Group under "Unknown" node

#### 1.5 Update node ID format

New format based on enabled levels only:
```
# Full order: activity, city, area
activity:5-city:10-area:25-club:123

# Order: city, activity (area disabled)
city:10-activity:5-club:123

# Order: activity only
activity:5-club:123
```

---

### Phase 2: Frontend Changes

**File:** `client/src/pages/ScalingPlannerV2.tsx`

#### 2.1 Add state for hierarchy controls

```typescript
type HierarchyLevel = 'activity' | 'city' | 'area';

const [hierarchyLevels, setHierarchyLevels] = useState<HierarchyLevel[]>(['activity', 'city', 'area']);
const [enabledLevels, setEnabledLevels] = useState<Set<HierarchyLevel>>(new Set(['activity', 'city', 'area']));
const [draggingLevel, setDraggingLevel] = useState<HierarchyLevel | null>(null);
```

#### 2.2 Update fetchData to pass hierarchy_order

```typescript
const fetchData = useCallback(async (preserveScroll = false) => {
  // ...
  const enabledOrder = hierarchyLevels.filter(l => enabledLevels.has(l));
  const params = new URLSearchParams();
  if (enabledOrder.length > 0) {
    params.append('hierarchy_order', enabledOrder.join(','));
  }
  params.append('include_launches', 'true');
  params.append('use_auto_matching', 'true');

  const response = await fetch(`/api/targets/v2/hierarchy?${params}`);
  // ...
}, [hierarchyLevels, enabledLevels, /* other deps */]);
```

#### 2.3 Add Hierarchy Order UI

Copy design from Leader Dashboard:
```tsx
{/* Hierarchy Level Controls */}
<div className="flex items-center gap-2">
  <Layers size={14} className="text-gray-400" />
  <span className="text-xs font-medium text-gray-500">Hierarchy Order:</span>

  {hierarchyLevels.map((level) => {
    const isEnabled = enabledLevels.has(level);
    const config = {
      activity: { icon: Activity, color: 'purple', label: 'Activity' },
      city: { icon: Building2, color: 'blue', label: 'City' },
      area: { icon: MapPin, color: 'emerald', label: 'Area' }
    }[level];

    return (
      <div
        key={level}
        draggable
        onDragStart={() => setDraggingLevel(level)}
        onDragEnd={() => setDraggingLevel(null)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => handleDrop(e, level)}
        className={/* styling based on enabled state */}
      >
        <GripVertical size={12} />
        <Icon size={12} />
        <span>{config.label}</span>
        <button onClick={() => toggleLevel(level)}>
          {isEnabled ? <Check /> : <X />}
        </button>
      </div>
    );
  })}
</div>
```

#### 2.4 Update findParentContext

Current implementation relies on node.type to extract context. This should still work since we're just reordering, not removing the type information.

```typescript
// Should still work - extracts based on node.type, not position
const findParentContext = (targetId: string, nodes: HierarchyNode[], parentContext = {}) => {
  for (const node of nodes) {
    const currentContext = { ...parentContext };

    // Extract context based on node type (not position)
    if (node.type === 'activity') {
      currentContext.activity_id = node.activity_id;
      currentContext.activity_name = node.name;
    } else if (node.type === 'city') {
      currentContext.city_id = node.city_id;
      currentContext.city_name = node.name;
    }
    // ... etc
  }
};
```

---

### Phase 3: Testing Plan

#### 3.1 Hierarchy Order Permutations (6 total)

| # | Order | Expected Hierarchy |
|---|-------|-------------------|
| 1 | activity, city, area | Activity → City → Area → Club |
| 2 | activity, area, city | Activity → Area → City → Club |
| 3 | city, activity, area | City → Activity → Area → Club |
| 4 | city, area, activity | City → Area → Activity → Club |
| 5 | area, activity, city | Area → Activity → City → Club |
| 6 | area, city, activity | Area → City → Activity → Club |

#### 3.2 Disabled Level Scenarios

| # | Enabled Levels | Expected Hierarchy |
|---|----------------|-------------------|
| 1 | activity only | Activity → Club |
| 2 | city only | City → Club |
| 3 | area only | Area → Club |
| 4 | activity, city | Activity → City → Club |
| 5 | activity, area | Activity → Area → Club |
| 6 | city, area | City → Area → Club |

#### 3.3 Rollup Verification

For each permutation, verify:
1. **target_meetups** - Sum matches across all levels
2. **target_revenue** - Sum matches across all levels
3. **current_meetups** - Sum matches across all levels
4. **current_revenue** - Sum matches across all levels
5. **gap_meetups** - Calculated correctly at each level
6. **gap_revenue** - Calculated correctly at each level
7. **progress_summary** - Aggregated correctly
8. **revenue_status** - Rolled up correctly
9. **L4W revenue** - Summed correctly
10. **club_count** - Correct at each level

#### 3.4 Edge Cases

1. **Club with no area** (Unknown) - Should group under "Unknown" area node
2. **Club with no city** (Unknown) - Should group under "Unknown" city node
3. **Launches** - Should appear in correct hierarchy position
4. **Expansion targets** - Clubs with targets in different areas
5. **Multiple targets per club** - Should aggregate correctly
6. **Auto-matching enabled** - Progress/revenue should still work

#### 3.5 UI Testing

1. Drag-drop reordering works
2. Enable/disable toggle works
3. At least one level must remain enabled
4. Hierarchy refreshes on order change
5. Expanded state preserved on reorder (if possible)
6. Task summaries still display correctly
7. + buttons still work at all levels
8. Edit/delete still work

---

## Risk Mitigation

1. **Keep original code path** - If hierarchy_order not provided, use original logic
2. **Extensive logging** - Log hierarchy building steps for debugging
3. **Rollup assertions** - Add checks that rollup totals match expected
4. **Incremental testing** - Test each permutation before moving to next
5. **Fallback UI** - If API fails, show error and use default order

---

## Files to Modify

| File | Changes |
|------|---------|
| `server/src/routes/targets.ts` | Add hierarchy_order support to /v2/hierarchy |
| `client/src/pages/ScalingPlannerV2.tsx` | Add state, UI, and API param |
| (No new files needed) | |

---

## Estimated Lines of Code

- Backend: ~150-200 lines (refactor existing + new logic)
- Frontend: ~80-100 lines (state + UI component)
- Total: ~250-300 lines

---

## Implementation Status (Updated 2026-01-10)

### ✅ COMPLETED

#### Backend Changes (server/src/routes/targets.ts)
1. **Added hierarchy_order parameter parsing** (lines 1702-1725)
   - Parses comma-separated list of levels: `activity`, `city`, `area`
   - Defaults to `['activity', 'city', 'area']` if not provided
   - Sets `useCustomHierarchy` flag when order differs from default

2. **Added helper types and functions** (lines 1501-1722)
   - `HierarchyLevel` type
   - `getLevelValue()` - extracts level value from club data
   - `createLevelNode()` - creates dynamic hierarchy node with all context IDs
   - `ProcessedClubData` and `ProcessedLaunchData` interfaces
   - `buildDynamicHierarchy()` - builds hierarchy from processed data based on order
   - `convertDynamicHierarchyToArray()` - converts Map structure to array with rollups

3. **Implemented dynamic hierarchy builder** (lines 2138-2440)
   - Processes clubs into `ProcessedClubData[]` with all metrics
   - Processes launches into `ProcessedLaunchData[]`
   - Calls `buildDynamicHierarchy()` to build hierarchy based on order
   - Calls `convertDynamicHierarchyToArray()` to calculate gaps/validations
   - Returns response with `hierarchy_order` field

4. **Added expansion targets handling** (lines 2404-2582)
   - Identifies expansion targets (targets in areas different from club's home area)
   - Creates virtual club nodes marked with "(Expansion)" suffix
   - Places expansion clubs in correct hierarchy based on expansion area
   - Ensures rollup totals match across all hierarchy orders

5. **Kept original code path** (lines 2620+)
   - When `useCustomHierarchy` is false, uses original hardcoded logic
   - Added `hierarchy_order` to response for consistency

6. **Backend Testing (curl)**
   - ✅ Default order works: `activity,city,area` returns 12 activities
   - ✅ Custom order works: `city,activity,area` returns 5 cities at top level
   - ✅ Disabled levels work: `area` only returns 6 areas with clubs directly under them
   - ✅ All 6 permutations return consistent totals (167 meetups, 17 clubs)
   - ✅ Expansion targets properly included in all hierarchy orders

#### Frontend Changes (client/src/pages/ScalingPlannerV2.tsx) - COMPLETE
1. **Added imports** (lines 27-29)
   - `GripVertical`, `Layers`, `Check` from lucide-react

2. **Added state** (lines 2154-2170)
   - `HierarchyLevel` type
   - `hierarchyLevels` state - order of levels
   - `enabledLevels` state - Set of enabled levels
   - `draggingLevel` state - for drag-drop
   - `enabledHierarchyOrder` memo - filtered and ordered for API
   - `isCustomHierarchy` memo - checks if using non-default order

3. **Updated fetchData** (lines 2247-2289)
   - Builds URLSearchParams with `hierarchy_order` parameter
   - Added `enabledHierarchyOrder` to dependencies

4. **Added handlers** (lines 2296-2343)
   - `handleDragStart`, `handleDragEnd`, `handleDragOver`, `handleDrop`
   - `toggleLevel` - enables/disables levels (prevents disabling last level)
   - `levelConfig` - icon/color/label for each level

5. **Added UI Component** (lines 3114-3190)
   - Hierarchy Order Controls bar with drag-drop pills
   - Each pill: Activity (purple), City (blue), Area (emerald)
   - Enable/disable toggle (checkmark/X)
   - "Reset to default" button when custom order is active
   - Responsive design with proper spacing

### Database Password Note
- Production DB password is `postgresdev` (stored in server/.env as `PROD_DB_PASSWORD=postgresdev`)

---

## Next Steps

1. [x] Review and approve this plan
2. [x] Implement backend changes
3. [x] Test backend with curl for all permutations
4. [x] Implement frontend changes (state, handlers, UI complete)
5. [x] Add hierarchy order pills UI to ScalingPlannerV2
6. [x] Test full flow locally (all 6 permutations + disabled levels)
7. [x] Verify rollup calculations are correct (167 meetups, 17 clubs across all orders)
8. [ ] Get user approval and commit changes
