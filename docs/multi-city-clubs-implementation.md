# Multi-City Clubs Implementation Plan

## Problem Statement

Clubs like "Journaling Nest" operate in multiple cities (West Delhi, North Delhi, South Delhi). Currently, the V2 hierarchy shows each club only ONCE based on its most recent event's location. This means North Delhi meetups are incorrectly grouped under West Delhi.

## Goal

Show clubs under EACH city where they have events, with:
- Meetups/revenue split by city
- Health metrics shared (not split)
- Tasks/requirements visible on all instances but NOT double-counted in roll-ups

## Current Behavior

```
Journaling (Activity)
└── West Delhi (City) ← Club appears here only
    └── Vikaspuri (Area)
        └── Journaling Nest ← All meetups/revenue aggregated
```

## Desired Behavior

```
Journaling (Activity)
├── West Delhi (City)
│   └── Vikaspuri (Area)
│       └── Journaling Nest ← Only West Delhi meetups/revenue
├── North Delhi (City)
│   └── Pitampura (Area)
│       └── Journaling Nest ← Only North Delhi meetups/revenue
└── South Delhi (City)
    └── Malviya Nagar (Area)
        └── Journaling Nest ← Only South Delhi meetups/revenue
```

---

## Implementation Steps

### Phase 1: Modify Club Query (Backend)

**File:** `server/src/routes/targets.ts`

**Current Query Logic:**
```sql
club_locations AS (
  SELECT DISTINCT ON (e.club_id)  -- ONE row per club
    e.club_id,
    ci.id as city_id,
    ar.id as area_id
  FROM event e
  ...
  ORDER BY e.club_id, e.start_time DESC  -- Most recent event
)
```

**New Query Logic:**
```sql
club_locations AS (
  SELECT DISTINCT ON (e.club_id, ci.id)  -- ONE row per (club, city)
    e.club_id,
    ci.id as city_id,
    ci.name as city_name,
    ar.id as area_id,
    ar.name as area_name
  FROM event e
  ...
  ORDER BY e.club_id, ci.id, e.start_time DESC  -- Most recent event per city
)
```

This creates multiple rows for clubs with events in multiple cities.

### Phase 2: Split Meetups/Revenue by City

**Current:** `club_metrics` aggregates ALL events for a club.

**New:** Aggregate per (club_id, city_id):
```sql
club_metrics AS (
  SELECT
    c.pk as club_id,
    ci.id as city_id,  -- Add city grouping
    COUNT(DISTINCT CASE WHEN e.start_time >= ... THEN e.pk END) as current_meetups,
    SUM(CASE WHEN ... THEN p.amount / 100.0 END) as current_revenue
  FROM club c
  JOIN event e ON c.pk = e.club_id
  JOIN location l ON e.location_id = l.id
  JOIN area ar ON l.area_id = ar.id
  JOIN city ci ON ar.city_id = ci.id
  ...
  GROUP BY c.pk, c.name, a.id, a.name, ci.id  -- Group by city too
)
```

### Phase 3: Unique Node IDs

**Current node ID:** `activity:1-city:5-area:22-club:90`

**New node ID:** Include city to make unique:
`activity:1-city:5-area:22-club:90` (already unique per city path)

No change needed since the hierarchy path already includes city.

### Phase 4: Health Metrics (No Split)

Keep health calculation at club level (not per-city). All city instances of a club show the same health metrics.

**Implementation:** Health query remains unchanged - joined to all club instances.

### Phase 5: Tasks Roll-up De-duplication

**Current:** Roll-up sums task counts from children.

**Problem:** If Journaling Nest appears in 3 cities with 5 tasks, roll-up would show 15 tasks instead of 5.

**Solution:** Track unique task IDs during roll-up.

**Backend Change:** When building hierarchy, include task IDs (not just counts) at club level. Roll-up aggregates unique IDs.

```typescript
// In hierarchy node
task_ids?: number[]  // List of task IDs (for de-dup in roll-up)

// Roll-up logic
const allTaskIds = new Set<number>()
children.forEach(child => {
  child.task_ids?.forEach(id => allTaskIds.add(id))
})
node.task_count = allTaskIds.size
```

### Phase 6: Leader Requirements Roll-up De-duplication

Same approach as tasks - track unique requirement IDs.

```typescript
leader_requirement_ids?: number[]  // For de-dup

// Roll-up
const allReqIds = new Set<number>()
children.forEach(child => {
  child.leader_requirement_ids?.forEach(id => allReqIds.add(id))
})
node.leaders_required_total = sumLeadersForUniqueReqs(allReqIds)
```

### Phase 7: Club Count De-duplication

**Current:** Club count = number of club nodes in hierarchy.

**Problem:** Journaling Nest in 3 cities = counted as 3 clubs.

**Solution:** Track unique club IDs in roll-up.

```typescript
// In hierarchy node
unique_club_ids?: number[]

// Roll-up
const allClubIds = new Set<number>()
children.forEach(child => {
  if (child.type === 'club') allClubIds.add(child.club_id)
  child.unique_club_ids?.forEach(id => allClubIds.add(id))
})
node.club_count = allClubIds.size
```

---

## Files to Modify

1. **`server/src/routes/targets.ts`**
   - Modify `club_locations` CTE to group by (club_id, city_id)
   - Modify `club_metrics` CTE to calculate per-city metrics
   - Update roll-up logic for tasks, requirements, club count

2. **`shared/types.ts`** (if needed)
   - Add `task_ids`, `leader_requirement_ids`, `unique_club_ids` to HierarchyNode

3. **`client/src/pages/ScalingPlannerV2.tsx`**
   - Frontend should work without changes (hierarchy structure unchanged)
   - May need minor adjustments if new fields are added

---

## Testing Checklist

- [ ] Journaling Nest appears under West Delhi, North Delhi, South Delhi
- [ ] West Delhi instance shows only West Delhi meetups/revenue
- [ ] North Delhi instance shows only North Delhi meetups/revenue
- [ ] Health metrics same across all instances
- [ ] Tasks show on all instances of the club
- [ ] Task count at Journaling (activity) level is NOT inflated
- [ ] Leader requirements show on all instances
- [ ] Leader count at activity level is NOT inflated
- [ ] Club count at activity level counts Journaling Nest as 1 club
- [ ] Totals at activity level are correct (sum of city totals)
- [ ] Expansion targets show under correct city instance

---

## Rollback Plan

If issues arise, revert the query changes to use `DISTINCT ON (e.club_id)` instead of `DISTINCT ON (e.club_id, ci.id)`.
