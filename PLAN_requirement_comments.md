# Implementation Plan: Comments for Leader & Venue Requirements

## Implementation Status

| Step | Description | Status |
|------|-------------|--------|
| 1 | Database Migration | ✅ Done |
| 2 | Backend API (GET/POST comments) | ✅ Done |
| 3 | Add comments_count to list/hierarchy | ✅ Done |
| 4 | Shared Types | ✅ Done |
| 5 | Leader Dashboard Comments | ✅ Done |
| 6 | Venue Dashboard Comments | ✅ Done |
| 7 | Leader Tooltip Comments | ✅ Done |
| 8 | Test & Deploy | ⏳ In Progress |

---

## Overview

Add inline comment functionality to Leader and Venue Requirements, mirroring the existing task comments implementation. Comments will appear in both the Requirements Dashboard and the Summary Tooltips in the Scaling Planner.

---

## Current State

### Task Comments (Reference Implementation)
- **Database**: `scaling_task_comments` table with `task_id`, `comment_text`, `author_name`, `created_at`
- **API**: `POST/GET /api/scaling-tasks/:id/comments`
- **UI**: Collapsible inline section in `ScalingTaskTileV2.tsx` with lazy loading

### Requirements (Target)
- **Database**: `leader_requirements` and `venue_requirements` tables
- **Dashboard**: `LeaderRequirementsDashboard.tsx`, `VenueRequirementsDashboard.tsx`
- **Tooltip**: `LeaderRequirementsTooltip.tsx` (used in Scaling Planner)

---

## Implementation Plan

### Phase 1: Database Schema

**File**: `server/database/migrations/XXX_requirement_comments.sql`

```sql
-- Unified comments table for both leader and venue requirements
CREATE TABLE IF NOT EXISTS requirement_comments (
  id SERIAL PRIMARY KEY,
  requirement_id INTEGER NOT NULL,
  requirement_type VARCHAR(10) NOT NULL CHECK (requirement_type IN ('leader', 'venue')),
  comment_text TEXT NOT NULL,
  author_name VARCHAR(100) DEFAULT 'Anonymous',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient querying
CREATE INDEX idx_req_comments_lookup ON requirement_comments(requirement_type, requirement_id);
CREATE INDEX idx_req_comments_created ON requirement_comments(requirement_type, requirement_id, created_at DESC);
```

**Rationale**: Unified table with `requirement_type` discriminator is simpler than two separate tables and allows shared API logic.

---

### Phase 2: Backend API Routes

**File**: `server/src/routes/requirements.ts`

Add two new endpoints:

#### 2.1 Get Comments
```
GET /api/requirements/:type/:id/comments
```
- `type`: 'leaders' or 'venues'
- Returns: `{ success: true, comments: [...] }`

#### 2.2 Add Comment
```
POST /api/requirements/:type/:id/comments
```
- Body: `{ comment_text: string, author_name?: string }`
- Returns: `{ success: true, comment: {...} }`

#### 2.3 Update Existing Endpoints
- Add `comments_count` to hierarchy and list queries via subquery
- Include `comments_count` in individual requirement responses

---

### Phase 3: Shared Types

**File**: `shared/types.ts`

```typescript
export interface RequirementComment {
  id: number;
  requirement_id: number;
  requirement_type: 'leader' | 'venue';
  comment_text: string;
  author_name: string;
  created_at: string;
}

// Update BaseRequirement interface
export interface BaseRequirement {
  // ... existing fields
  comments_count?: number;
}
```

---

### Phase 4: Frontend - Requirements Dashboard

**Files**:
- `client/src/pages/LeaderRequirementsDashboard.tsx`
- `client/src/pages/VenueRequirementsDashboard.tsx`

#### 4.1 Add Inline Comments Section (Similar to ScalingTaskTileV2)

For each requirement row in the table:
1. Add MessageSquare icon button with `comments_count` badge
2. On click, expand inline comments section below the row
3. Show:
   - Author selector dropdown
   - Comment input field
   - List of existing comments (newest first)
4. Lazy load comments on first expand

#### 4.2 UI Pattern
```
┌─────────────────────────────────────────────────────────┐
│ [Requirement Row]                    [💬 3] [Edit] [Del]│
├─────────────────────────────────────────────────────────┤
│ ▼ Comments                                              │
│   ┌─────────────────────────────────────────────────┐  │
│   │ Author: [Dropdown ▼]                            │  │
│   │ [Comment input...                    ] [Submit] │  │
│   └─────────────────────────────────────────────────┘  │
│   ┌─ Comment ───────────────────────────────────────┐  │
│   │ 👤 John · 2 hours ago                           │  │
│   │ This leader is confirmed for next week          │  │
│   └─────────────────────────────────────────────────┘  │
│   ┌─ Comment ───────────────────────────────────────┐  │
│   │ 👤 Sarah · 1 day ago                            │  │
│   │ Reached out to potential candidate              │  │
│   └─────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

### Phase 5: Frontend - Summary Tooltip

**File**: `client/src/components/scaling/LeaderRequirementsTooltip.tsx`

#### 5.1 Add Comments to Requirement Tiles

For each requirement tile in the tooltip:
1. Add small MessageSquare icon with count
2. On click, expand inline comments section within the tile
3. Same functionality as dashboard (view + add comments)

#### 5.2 UI Pattern
```
┌─ Requirement Tile ──────────────────────────────────────┐
│ [3 Leaders] Badminton Leader - Club Name    [NP ▼] [💬2]│
│ Growth · Platform                     [+Task] [✎] [🗑] │
├─────────────────────────────────────────────────────────┤
│ ▼ Comments (expanded)                                   │
│   Author: [Dropdown] [Input...] [Add]                   │
│   • John (2h ago): Leader confirmed                     │
│   • Sarah (1d ago): Reached out                         │
└─────────────────────────────────────────────────────────┘
```

---

### Phase 6: Venue Requirements Tooltip

**Status**: NOT NEEDED

Venue requirements only appear in the dashboard, not in Scaling Planner tooltips. Comments will only be added to the Venue Requirements Dashboard.

---

## File Changes Summary

| File | Changes |
|------|---------|
| `server/database/migrations/017_requirement_comments.sql` | NEW - Create comments table |
| `server/src/routes/requirements.ts` | Add GET/POST comments endpoints, add comments_count to queries |
| `shared/types.ts` | Add RequirementComment interface, update BaseRequirement |
| `client/src/pages/LeaderRequirementsDashboard.tsx` | Add inline comments UI |
| `client/src/pages/VenueRequirementsDashboard.tsx` | Add inline comments UI |
| `client/src/components/scaling/LeaderRequirementsTooltip.tsx` | Add comments to requirement tiles |

**Note**: No VenueRequirementsTooltip changes needed (doesn't exist).

---

## Estimated Effort

1. **Database Migration**: 10 mins
2. **Backend API**: 30 mins
3. **Shared Types**: 5 mins
4. **Leader Dashboard Comments**: 45 mins
5. **Venue Dashboard Comments**: 15 mins (copy from leader)
6. **Leader Tooltip Comments**: 45 mins
7. **Testing & Fixes**: 30 mins

**Total**: ~3 hours

---

## Questions - Answered

1. ✅ Unified table approach vs separate tables - **Using unified**
2. ✅ Comments in both dashboard and tooltip - **Confirmed**
3. ✅ Is there a VenueRequirementsTooltip needed? - **No, dashboard only for venues**
4. ✅ Should comments be deletable/editable? - **Append-only (no edit/delete)**

---

## Final Scope

| Location | Leader Requirements | Venue Requirements |
|----------|--------------------|--------------------|
| Dashboard | ✅ Inline comments | ✅ Inline comments |
| Tooltip (Scaling Planner) | ✅ Inline comments | ❌ No tooltip exists |

---

## Approval

- [ ] Plan approved - Ready to implement
