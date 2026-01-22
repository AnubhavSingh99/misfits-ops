# Venue Requirements Architecture

## Overview

Venue requirements are used to track venue sourcing needs for clubs, new launches, and expansion targets. This document covers all the places where venue requirements can be created and managed.

---

## Database Schema

### Table: `venue_requirements` (Local Database: `misfits_ops`)

```sql
CREATE TABLE venue_requirements (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  activity_id INTEGER,
  activity_name VARCHAR(100),
  city_id INTEGER,
  city_name VARCHAR(100),
  area_id INTEGER,
  area_name VARCHAR(100),
  club_id INTEGER,           -- For existing clubs
  club_name VARCHAR(100),
  launch_id INTEGER,         -- For new club launches
  target_id INTEGER,         -- For expansion targets (club_dimensional_targets.id)
  team VARCHAR(20),          -- 'blue' | 'green' | 'yellow'
  status VARCHAR(50),        -- 'not_picked' | 'in_progress' | 'done' | 'deprioritised'
  notes TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### Key Relationships

- `club_id` → Production `club.pk` (existing clubs)
- `launch_id` → Local `new_club_launches.id` (planned launches)
- `target_id` → Local `club_dimensional_targets.id` (expansion targets)

---

## API Endpoints

### 1. GET `/api/requirements/venues`
Lists venue requirements with filters.

**Query Parameters:**
- `activity_id`, `city_id`, `area_id`, `club_id`, `launch_id`
- `team`, `status`, `search`

### 2. POST `/api/requirements/venues`
Creates a new venue requirement.

**Request Body:**
```typescript
{
  name: string;
  activity_id?: number;
  activity_name?: string;
  city_id?: number;
  city_name?: string;
  area_id?: number;
  area_name?: string;
  club_id?: number;
  club_name?: string;
  launch_id?: number;    // For new launches
  target_id?: number;    // For expansion targets
  team?: string;
  notes?: string;
}
```

### 3. GET `/api/requirements/clubs-and-launches`
Gets clubs, launches, and expansion targets for dropdown selection.

**Query Parameters:**
- `activity_id` (required for filtering)
- `city_id`
- `area_id`

**Response:**
```json
{
  "success": true,
  "clubs": [{ "id": 123, "name": "Club Name", "type": "club" }],
  "launches": [{ "id": 456, "name": "Launch Name", "type": "launch" }],
  "expansionTargets": [{
    "target_id": 789,
    "club_id": 123,
    "club_name": "Checkmate Chess Club",
    "name": "Checkmate Chess Club - Malviya Nagar",
    "type": "expansion"
  }],
  "total": 3
}
```

**Implementation Notes:**
- Clubs: Queried from production DB, location inferred from events
- Launches: Queried from local `new_club_launches` table
- Expansion Targets: Queried from local `club_dimensional_targets` table
  - `activity_id` in targets is often NULL, so we filter by club's activity from production
  - Club names are enriched from production since they're often NULL in targets

---

## Frontend Components

### 1. VenueRequirementsDashboard

**File:** `client/src/pages/VenueRequirementsDashboard.tsx`

**Purpose:** Standalone dashboard for managing all venue requirements.

**Modal:** `CreateRequirementModal` (defined inline ~line 1708)

**Selection Method:** Dropdown-based
1. User selects Activity from dropdown
2. User selects City from dropdown (filtered by activity)
3. User selects Area from dropdown (filtered by city)
4. User selects Club/Launch/Expansion from dropdown (populated via `/api/requirements/clubs-and-launches`)

**Key Code:**
```typescript
// Fetch clubs and launches when area changes
useEffect(() => {
  if (selectedActivityId && selectedCityId && selectedAreaId) {
    const params = new URLSearchParams();
    params.append('activity_id', String(selectedActivityId));
    params.append('city_id', String(selectedCityId));
    params.append('area_id', String(selectedAreaId));
    const res = await fetch(`/api/requirements/clubs-and-launches?${params}`);
    // Combines clubs, launches, expansionTargets into single dropdown
  }
}, [selectedActivityId, selectedCityId, selectedAreaId]);
```

---

### 2. RequirementSelector Component

**File:** `client/src/components/scaling/RequirementSelector.tsx`

**Purpose:** Reusable component for selecting/creating requirements within task modals.

**Modal:** `CreateRequirementModal` (defined inside ~line 310)

**Selection Method:** Context inheritance
- Receives context from parent component
- Context includes: `activity_id`, `city_id`, `area_id`, `club_id`, `club_name`, `launch_id`, `target_id`
- No dropdown needed - context is inherited from hierarchy node

**Props Interface:**
```typescript
interface RequirementSelectorProps {
  type: 'leader' | 'venue';
  context: {
    activity_id?: number;
    activity_name?: string;
    city_id?: number;
    city_name?: string;
    area_id?: number;
    area_name?: string;
    club_id?: number;
    club_name?: string;
    launch_id?: number;   // For new launches
    target_id?: number;   // For expansion targets
  };
  selectedRequirements: (LeaderRequirement | VenueRequirement)[];
  onSelectionsChange: (requirements) => void;
}
```

**UI Context Display:**
```tsx
{/* Shows inherited context as badges */}
{context.activity_name && <span className="badge">{context.activity_name}</span>}
{context.city_name && <span className="badge">{context.city_name}</span>}
{context.area_name && <span className="badge">{context.area_name}</span>}
{context.club_name && !context.launch_id && !context.target_id && (
  <span className="badge">Club: {context.club_name}</span>
)}
{context.launch_id && (
  <span className="badge violet">🚀 Launch: {context.club_name}</span>
)}
{context.target_id && (
  <span className="badge amber">📍 Expansion: {context.club_name}</span>
)}
```

---

### 3. ScalingTaskCreateModal

**File:** `client/src/components/scaling/ScalingTaskCreateModal.tsx`

**Purpose:** Modal for creating new scaling tasks from V2 dashboard.

**Contains:** Two `RequirementSelector` components (leader + venue)

**Context Source:** `getScalingTaskContext(node)` in ScalingPlannerV2

```typescript
// In ScalingPlannerV2.tsx
const getScalingTaskContext = (node: HierarchyNode) => {
  const parentContext = findParentContext(node.id, hierarchy) || {};
  const isLaunch = node.type === 'launch';
  const isExpansion = node.is_expansion === true;

  return {
    task_scope: node.type,
    activity_id: parentContext.activity_id || node.activity_id,
    activity_name: parentContext.activity_name || node.activity_name,
    city_id: parentContext.city_id || node.city_id,
    city_name: parentContext.city_name || node.city_name,
    area_id: parentContext.area_id || node.area_id,
    area_name: parentContext.area_name || node.area_name,
    club_id: node.club_id,
    club_name: isLaunch ? node.name : node.club_name,
    launch_id: node.launch_id,
    target_id: isExpansion ? node.target_id : undefined,
    is_expansion: isExpansion
  };
};
```

**Passing Context to RequirementSelector:**
```tsx
<RequirementSelector
  type="venue"
  context={{
    activity_id: selectedActivityId || context.activity_id,
    activity_name: selectedActivityName || context.activity_name,
    city_id: selectedCityId || context.city_id,
    city_name: selectedCityName || context.city_name,
    area_id: selectedAreaId || context.area_id,
    area_name: selectedAreaName || context.area_name,
    club_id: selectedClubId || context.club_id,
    club_name: selectedClubName || context.club_name,
    launch_id: context.launch_id,
    target_id: context.target_id
  }}
  selectedRequirements={selectedVenueRequirements}
  onSelectionsChange={(reqs) => updateVenueRequirements(reqs)}
/>
```

---

### 4. ScalingTaskEditModal

**File:** `client/src/components/scaling/ScalingTaskEditModal.tsx`

**Purpose:** Modal for editing existing scaling tasks.

**Contains:** Two `RequirementSelector` components (leader + venue)

**Context Source:** Existing task data

```tsx
<RequirementSelector
  type="venue"
  context={{
    activity_id: task.activity_id,
    activity_name: task.activity_name,
    city_id: task.city_id,
    city_name: task.city_name,
    area_id: task.area_id,
    area_name: task.area_name,
    club_id: task.club_id,
    club_name: task.club_name,
    launch_id: task.launch_id,
    target_id: task.target_id
  }}
  selectedRequirements={selectedVenueRequirements}
  onSelectionsChange={(reqs) => updateVenueRequirements(reqs)}
/>
```

---

## Context Flow Diagram

```
ScalingPlannerV2 (hierarchy node clicked)
  │
  ├── getScalingTaskContext(node)
  │     │
  │     ├── Extracts: activity_id, city_id, area_id from parent traversal
  │     ├── Extracts: club_id, club_name from node
  │     ├── Extracts: launch_id (if node.type === 'launch')
  │     └── Extracts: target_id (if node.is_expansion === true)
  │
  └── ScalingTaskCreateModal (receives full context)
        │
        └── RequirementSelector (receives context from task)
              │
              └── CreateRequirementModal (inherits context, passes to API)
                    │
                    └── POST /api/requirements/venues
                          (stores with launch_id/target_id)
```

---

## Summary Table

| Location | Component | Selection Method | launch_id Support | target_id Support |
|----------|-----------|------------------|-------------------|-------------------|
| VenueRequirementsDashboard | Inline CreateRequirementModal | Dropdown | ✅ | ✅ |
| ScalingTaskCreateModal | RequirementSelector | Context inheritance | ✅ | ✅ |
| ScalingTaskEditModal | RequirementSelector | Task data | ✅ | ✅ |

---

## Expansion Targets

### What is an Expansion Target?

An expansion target represents a club expanding into a new area (different from their home area). These are stored in `club_dimensional_targets` table.

### How Expansion Targets Show in Hierarchy

In `targets.ts`, the hierarchy building code:
1. Gets all clubs and their targets from `club_dimensional_targets`
2. For each club, compares target area vs club's home area (from events)
3. If target area differs from home area → creates an expansion node
4. Node marked with `is_expansion: true` and includes `target_id`

```typescript
// In targets.ts ~line 3380
const expansionClubNode = {
  type: 'club',
  id: `club:${clubId}-expansion-${areaId}`,
  name: `${club.club_name} (Expansion)`,
  club_id: clubId,
  target_id: targets.length === 1 ? parseInt(targets[0].target_id) : null,
  is_expansion: true,
  // ... other properties
};
```

### Filtering Expansion Targets by Activity

Since `activity_id` in `club_dimensional_targets` is often NULL, the `/api/requirements/clubs-and-launches` endpoint:
1. First queries production to get all club_ids for the selected activity
2. Then filters expansion targets by those club_ids
3. Enriches results with club names from production

```typescript
// Get club_ids for the activity
const activityClubsResult = await queryProduction(
  `SELECT pk FROM club WHERE activity_id = $1`,
  [activity_id]
);
const activityClubIds = activityClubsResult.rows.map(r => r.pk);

// Filter expansion targets by those club_ids
expansionQuery += ` AND cdt.club_id = ANY($1)`;
```

---

## Files Reference

| File | Purpose |
|------|---------|
| `server/src/routes/requirements.ts` | API endpoints for venue requirements |
| `client/src/pages/VenueRequirementsDashboard.tsx` | Standalone venue requirements dashboard |
| `client/src/components/scaling/RequirementSelector.tsx` | Reusable requirement selector with modal |
| `client/src/components/scaling/ScalingTaskCreateModal.tsx` | Task creation modal with requirements |
| `client/src/components/scaling/ScalingTaskEditModal.tsx` | Task edit modal with requirements |
| `client/src/pages/ScalingPlannerV2.tsx` | Main V2 dashboard, context builder |
| `shared/types.ts` | TypeScript interfaces including HierarchyNode |
| `server/database/migrations/add_venue_requirements_launch_id.sql` | Migration adding launch_id/target_id columns |

---

## Recent Fixes (2026-01-22)

1. **Added launch_id and target_id columns** to venue_requirements table
2. **Fixed expansion targets in dropdown** - filter by club's activity, enrich with club names
3. **Fixed context inheritance** - launch_id and target_id now flow from hierarchy node through task modal to requirement selector
4. **Added is_expansion** to HierarchyNode interface
5. **Fixed static import** of queryProduction in requirements.ts
