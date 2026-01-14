# Launch to Club Transition - Implementation Plan

## Overview

Enable automatic and manual transition of "New Club Launch" targets to actual clubs when they appear in the system. This includes auto-detection, manual matching UI, and the ability to revert transitions.

**Key Decisions (Confirmed):**
- Matched launches are **hidden** from hierarchy view
- Matched clubs show a **small icon** indicating they came from a launch target
- Targets are **moved** to club (not duplicated) to avoid double counting in rollups
- **No toast/banner** for auto-matches - inline badge only on club row
- Manual match modal shows clubs from **same city only** when "All Areas" selected

---

## 1. Database Changes

### 1.1 New Columns on `new_club_launches`

```sql
-- Migration: add_launch_transition_columns.sql

ALTER TABLE new_club_launches
ADD COLUMN IF NOT EXISTS match_type VARCHAR(20) DEFAULT NULL;
-- Values: 'auto', 'manual', NULL (not matched)

ALTER TABLE new_club_launches
ADD COLUMN IF NOT EXISTS previous_status VARCHAR(50) DEFAULT NULL;
-- Stores status before transition for revert capability

ALTER TABLE new_club_launches
ADD COLUMN IF NOT EXISTS matched_at TIMESTAMP DEFAULT NULL;
-- When the transition occurred

ALTER TABLE new_club_launches
ADD COLUMN IF NOT EXISTS matched_club_name VARCHAR(255) DEFAULT NULL;
-- Cache club name for display without join
```

### 1.2 Handling Existing Data

For launches already transitioned (where `actual_club_id IS NOT NULL`):

```sql
-- Set existing transitions as 'legacy'
UPDATE new_club_launches
SET
  match_type = 'legacy',
  matched_at = updated_at,
  previous_status = 'planned'
WHERE actual_club_id IS NOT NULL
  AND match_type IS NULL;
```

For launches not yet transitioned: No action needed (columns remain NULL).

---

## 2. Backend API Changes

### 2.1 Update Transition Endpoint

**Endpoint:** `POST /api/targets/v2/launches/:launchId/transition`

**Updated Request Body:**
```typescript
{
  club_id: number,           // Required - the club PK
  club_uuid?: string,        // Optional - club UUID
  club_name?: string,        // Optional - for caching
  transfer_targets: boolean, // Whether to copy targets
  match_type: 'auto' | 'manual'  // How it was matched
}
```

**Updated Logic:**
```typescript
// Store previous status for revert
const previousStatus = launch.launch_status;

// Update launch record
await queryLocal(`
  UPDATE new_club_launches
  SET
    launch_status = 'launched',
    actual_club_id = $1,
    match_type = $2,
    previous_status = $3,
    matched_at = CURRENT_TIMESTAMP,
    matched_club_name = $4,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = $5
`, [club_id, match_type, previousStatus, club_name, launchId]);

// Transfer targets from launch to club (MOVE, not copy)
if (transfer_targets) {
  // Copy launch targets to club_dimensional_targets
  await queryLocal(`
    INSERT INTO club_dimensional_targets (club_id, week_start, dimension, target_value, ...)
    SELECT $1, week_start, dimension, target_value, ...
    FROM launch_dimensional_targets
    WHERE launch_id = $2
    ON CONFLICT (club_id, week_start, dimension) DO UPDATE
    SET target_value = EXCLUDED.target_value
  `, [club_id, launchId]);

  // Mark launch targets as transferred (so they don't count in rollups)
  // The launch is now hidden from hierarchy, so its targets won't appear
}
```

### 2.2 New Revert Endpoint

**Endpoint:** `POST /api/targets/v2/launches/:launchId/revert`

**Request Body:**
```typescript
{
  delete_club_targets?: boolean  // Whether to delete copied targets (default: false)
}
```

**Logic:**
```typescript
router.post('/v2/launches/:launchId/revert', async (req, res) => {
  const launchId = parseInt(req.params.launchId);
  const { delete_club_targets = false } = req.body;

  // Get current launch info
  const launch = await queryLocal(`
    SELECT * FROM new_club_launches WHERE id = $1
  `, [launchId]);

  if (!launch.rows[0]?.actual_club_id) {
    return res.status(400).json({ error: 'Launch is not transitioned' });
  }

  const { actual_club_id, previous_status, matched_at } = launch.rows[0];

  // Optionally delete club targets that were copied from launch
  if (delete_club_targets) {
    await queryLocal(`
      DELETE FROM club_dimensional_targets
      WHERE club_id = $1
        AND created_at >= $2
    `, [actual_club_id, matched_at]);
  }

  // Revert launch status - makes launch visible again in hierarchy
  await queryLocal(`
    UPDATE new_club_launches
    SET
      launch_status = COALESCE($1, 'planned'),
      actual_club_id = NULL,
      match_type = NULL,
      previous_status = NULL,
      matched_at = NULL,
      matched_club_name = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
  `, [previous_status, launchId]);

  res.json({ success: true, message: 'Launch transition reverted' });
});
```

### 2.3 Auto-Detection Logic

**Location:** In the hierarchy building logic (`/api/targets/v2/hierarchy`)

**When:** After fetching launches, before building hierarchy

#### Auto-Matching Criteria (COMPULSORY)

A launch is auto-matched to a club when **ALL** of these conditions are met:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    AUTO-MATCH DECISION FLOW                          │
└─────────────────────────────────────────────────────────────────────┘

Launch Record:
├── activity_name: "Badminton"
├── planned_area (area_id): 42 (Dwarka)
├── actual_club_id: NULL (not yet matched)
├── launch_status: "planned" (not "launched")
└── created_at: 2026-01-01

                    ▼

Step 1: Find clubs with SAME ACTIVITY
        SELECT * FROM club WHERE activity.name = 'Badminton'

                    ▼

Step 2: Filter to clubs with EVENTS IN SAME AREA
        WHERE EXISTS (event in area_id = 42)

                    ▼

Step 3: Filter to ACTIVE clubs only
        WHERE club.status = 'ACTIVE'

                    ▼

Step 4: COMPULSORY - First event IN THAT AREA after launch was created
        Club's first event IN THE LAUNCH'S SPECIFIC AREA must be
        AFTER the launch was created.

        This handles BOTH scenarios:
        - New club starting in area → first event is after launch ✓
        - Old club expanding to area → first event IN THIS AREA is after launch ✓
        - Club already in area before launch → NO MATCH ✗

                    ▼

Step 5: If multiple matches - NAME MATCHING
        Compare launch planned_club_name with club.name
        Use fuzzy matching / similarity score
        Pick best name match

                    ▼

Match Found?
├── YES → Auto-transition with match_type = 'auto'
│         - Transfer targets to club
│         - Hide launch from hierarchy
│         - Show icon on club row
└── NO  → Leave as unmatched launch (visible in hierarchy)
```

#### Examples

```
Launch: "New Dwarka Badminton Club" (created Jan 1, 2026)
Area: Dwarka (area_id: 42)

Club A: "Dwarka Shuttlers" (brand new club)
        - First event ever: Jan 10 in Dwarka
        - First DWARKA event: Jan 10 ✓ (after Jan 1)
        → MATCHES ✓

Club B: "Shuttle Stars" (old club from Noida, expanding)
        - Operating in Noida since 2020
        - First DWARKA event: Jan 15 ✓ (after Jan 1)
        → MATCHES ✓ (expansion counts!)

Club C: "Old Dwarka Club" (already operating in Dwarka)
        - First DWARKA event: March 2021 ✗ (before Jan 1)
        → NO MATCH ✗ (was already there)
```

#### Name Matching Logic (for multiple club matches)

```typescript
function findBestNameMatch(launchName: string, clubs: Club[]): Club | null {
  // Normalize names for comparison
  const normalize = (name: string) =>
    name.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  const normalizedLaunch = normalize(launchName);

  // Calculate similarity scores
  const scored = clubs.map(club => ({
    club,
    score: calculateSimilarity(normalizedLaunch, normalize(club.name))
  }));

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Return best match if score is above threshold (0.3)
  return scored[0]?.score > 0.3 ? scored[0].club : null;
}

function calculateSimilarity(a: string, b: string): number {
  // Levenshtein-based similarity or word overlap
  const wordsA = new Set(a.split(' '));
  const wordsB = new Set(b.split(' '));
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return intersection / union; // Jaccard similarity
}
```

#### Code Implementation

```typescript
async function autoMatchLaunches(launches: Launch[]) {
  const unmatchedLaunches = launches.filter(l =>
    !l.actual_club_id &&
    l.launch_status !== 'launched' &&
    l.match_type !== 'manual'  // Don't override manual decisions
  );

  for (const launch of unmatchedLaunches) {
    // Find clubs that match criteria
    // COMPULSORY: Club's first event IN THIS SPECIFIC AREA must be after launch created
    // This handles both new clubs AND old clubs expanding to the area
    const matchingClubs = await queryProduction(`
      SELECT DISTINCT
        c.pk as club_id,
        c.uuid as club_uuid,
        c.name as club_name,
        c.created_at,
        a.name as activity_name,
        (
          SELECT MIN(e2.start_time)
          FROM event e2
          WHERE e2.club_id = c.pk
            AND e2.area_id = da.production_area_id
        ) as first_area_event_time
      FROM club c
      JOIN activity a ON c.activity_id = a.id
      JOIN dim_areas da ON da.id = $2
      WHERE a.name = $1
        AND c.status = 'ACTIVE'
        -- Club must have events in the launch's area
        AND EXISTS (
          SELECT 1 FROM event e
          WHERE e.club_id = c.pk
            AND e.area_id = da.production_area_id
        )
        -- COMPULSORY: First event IN THIS AREA must be AFTER launch was created
        AND (
          SELECT MIN(e3.start_time)
          FROM event e3
          WHERE e3.club_id = c.pk
            AND e3.area_id = da.production_area_id
        ) > $3
      ORDER BY c.created_at DESC
    `, [launch.activity_name, launch.area_id, launch.created_at]);

    if (matchingClubs.rows.length === 0) continue;

    // If multiple matches, use name matching
    let matchedClub = matchingClubs.rows[0];
    if (matchingClubs.rows.length > 1) {
      const bestMatch = findBestNameMatch(launch.planned_club_name, matchingClubs.rows);
      if (bestMatch) {
        matchedClub = bestMatch;
      }
    }

    // Perform auto-transition
    await transitionLaunch(launch.id, {
      club_id: matchedClub.club_id,
      club_uuid: matchedClub.club_uuid,
      club_name: matchedClub.club_name,
      transfer_targets: true,
      match_type: 'auto'
    });

    logger.info(`Auto-matched launch ${launch.id} (${launch.planned_club_name}) ` +
                `to club ${matchedClub.club_id} (${matchedClub.club_name})`);
  }
}
```

#### When Auto-Match Runs

**RECOMMENDED: Option A (on hierarchy load) for MVP**

```
On Every Hierarchy Load (Real-time)
├── Pros: Matches appear immediately
├── Cons: Slight performance overhead
└── Implementation: Call autoMatchLaunches() in GET /api/targets/v2/hierarchy
```

### 2.4 Get Matching Clubs Endpoint (for Manual Match Modal)

**Endpoint:** `GET /api/targets/v2/launches/:launchId/matching-clubs`

**Query Params:**
```
?activity_name=Badminton
&city_id=5 (required - filter by city, "All Areas" shows same city only)
&area_id=42 (optional - filter by specific area)
&search=shuttle (optional - search by name)
```

**Response:**
```typescript
{
  success: true,
  clubs: [
    {
      club_id: 123,
      club_uuid: "abc-123",
      club_name: "Shuttle Masters",
      city_name: "Delhi",
      area_name: "Dwarka",
      is_same_area: true,  // Matches launch's area
      is_same_city: true,  // Matches launch's city
      event_count: 15,
      health_status: "green",
      first_event_after_launch: true  // Has events after launch created
    },
    // ... more clubs (same city only)
  ],
  launch: {
    id: 5,
    activity_name: "Badminton",
    planned_city: "Delhi",
    planned_area: "Dwarka",
    planned_club_name: "New Shuttle Club"
  }
}
```

---

## 3. Frontend UI Changes

### 3.0 Component Files (Created)

The following UI components have been created:

| Component | File | Purpose |
|-----------|------|---------|
| `MatchedLaunchIndicator` | `client/src/components/scaling/MatchedLaunchIndicator.tsx` | Small icon on club rows with hover tooltip + undo |
| `LinkToClubModal` | `client/src/components/scaling/LinkToClubModal.tsx` | Manual matching modal with filters & club list |
| `UndoLinkModal` | `client/src/components/scaling/UndoLinkModal.tsx` | Confirmation modal for unlinking |

### 3.1 Hierarchy Display Logic

**Matched launches are HIDDEN from hierarchy view**

When a launch is matched to a club:
1. Launch row disappears from hierarchy
2. Club row shows a small "matched" indicator icon
3. Hovering the icon shows original launch target info
4. Icon includes undo action

### 3.2 Club Row with Matched Launch Indicator

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Shuttle Masters    🔗    │ Targets │ Meetups │ Revenue │ Actions           │
│ Badminton • Dwarka  ⓘ   │  ...    │  ...    │  ...    │  ...              │
└─────────────────────────────────────────────────────────────────────────────┘
                      │
                      └── Small link icon (🔗) indicates matched from launch

On hover over 🔗 icon:
┌─────────────────────────────────────────────┐
│  Matched from Launch Target                 │
│  ─────────────────────────────────────────  │
│  Original: "New Dwarka Badminton Club"      │
│  Matched: Jan 14, 2026 (auto)               │
│                                             │
│  [Undo Match]                               │
└─────────────────────────────────────────────┘
```

**Design Principles:**
- Keep it minimal - don't overcrowd the dashboard
- Icon only visible on clubs that came from launches
- Hover reveals details and undo option
- No separate matched section needed

### 3.3 Unmatched Launch Row (visible in hierarchy)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🚀 New Shuttle Club (Launch)     │ Targets │  --   │  --   │ [🔗] [✏️] [🗑️]│
│    Badminton • Dwarka            │  ...    │       │       │                │
└─────────────────────────────────────────────────────────────────────────────┘
                                                              │
                                                              └── Link to Club button
```

### 3.4 Link to Club Modal

**Modal: `LinkToClubModal`**

```
┌──────────────────────────────────────────────────────────────────┐
│  Link Launch to Existing Club                              [X]   │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Launch: New Shuttle Club                                        │
│  Activity: Badminton                                             │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ Filters                                                     │ │
│  │                                                             │ │
│  │ Activity: [Badminton    ▼]  (locked to launch activity)     │ │
│  │ City:     [Delhi        ▼]  (pre-filled, changeable)        │ │
│  │ Area:     [All Areas    ▼]  (shows same-city clubs only)    │ │
│  │ Search:   [________________]                                │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Available Clubs:                                                │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ ○ Shuttle Masters          Delhi • Dwarka    ✓ Same Area    │ │
│  │ ○ Badminton Blasters       Delhi • Rohini    ✓ Same City    │ │
│  │ ○ Smash Club Delhi         Delhi • Sec 50    ✓ Same City    │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ☑ Transfer targets to club (recommended)                       │
│                                                                  │
│  [Cancel]                                    [Link to Club]      │
└──────────────────────────────────────────────────────────────────┘
```

**Features:**
- Activity is locked (can only match within same activity)
- City pre-filled based on launch's planned_city
- **"All Areas" shows clubs from same city only** (not all cities)
- "Same Area" / "Same City" badges for relevant clubs
- Clubs sorted by relevance (same area first, then alphabetical)
- Search by club name
- Transfer targets checkbox (default: checked)

### 3.5 Undo Confirmation Modal

```
┌──────────────────────────────────────────────────────────────────┐
│  Undo Club Link                                            [X]   │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Are you sure you want to unlink this launch from the club?      │
│                                                                  │
│  Launch: New Shuttle Club                                        │
│  Linked to: Shuttle Masters                                      │
│  Match type: Auto-matched                                        │
│                                                                  │
│  ☐ Also delete targets that were copied to the club              │
│    (Warning: This may affect existing progress tracking)         │
│                                                                  │
│  [Cancel]                                    [Undo Link]         │
└──────────────────────────────────────────────────────────────────┘
```

---

## 4. Rollup & Target Counting Logic

### 4.1 Problem: Avoiding Double Counting

When launch targets are transferred to a club, we must avoid counting them twice in hierarchy rollups.

### 4.2 Solution: Hide Matched Launches

```
BEFORE MATCH:
┌─────────────────────────────────────────────────────────────┐
│ Hierarchy                     │ Targets Rollup              │
├───────────────────────────────┼─────────────────────────────┤
│ Delhi                         │ 500 (sum of all below)      │
│ ├── Dwarka                    │ 200                         │
│ │   ├── Club A (actual)       │ 100                         │
│ │   └── New Launch (planned)  │ 100  ← Launch targets       │
│ └── Rohini                    │ 300                         │
└───────────────────────────────┴─────────────────────────────┘

AFTER MATCH (Launch matched to Club A):
┌─────────────────────────────────────────────────────────────┐
│ Hierarchy                     │ Targets Rollup              │
├───────────────────────────────┼─────────────────────────────┤
│ Delhi                         │ 500 (unchanged)             │
│ ├── Dwarka                    │ 200                         │
│ │   └── Club A (actual) 🔗    │ 200  ← Includes launch      │
│ │       └── (hover: matched)  │        targets transferred  │
│ └── Rohini                    │ 300                         │
└───────────────────────────────┴─────────────────────────────┘

NOTE: Launch row is HIDDEN, its targets are now in Club A
      Total rollup unchanged (no double counting)
```

### 4.3 Implementation in Hierarchy Query

```typescript
// In hierarchy building logic

// Step 1: Exclude matched launches from launch results
const launches = await queryLocal(`
  SELECT * FROM new_club_launches
  WHERE actual_club_id IS NULL  -- Only unmatched launches
    AND launch_status != 'launched'
`);

// Step 2: Include matched launches in club data for icon display
const matchedLaunches = await queryLocal(`
  SELECT * FROM new_club_launches
  WHERE actual_club_id IS NOT NULL
`);

// Step 3: When building club nodes, add matched launch info
for (const club of clubs) {
  const matchedLaunch = matchedLaunches.find(l => l.actual_club_id === club.pk);
  if (matchedLaunch) {
    club.matched_from_launch = {
      launch_id: matchedLaunch.id,
      original_name: matchedLaunch.planned_club_name,
      matched_at: matchedLaunch.matched_at,
      match_type: matchedLaunch.match_type
    };
  }
}
```

---

## 5. Implementation Order

### Phase 1: Database & Backend
1. [ ] Create migration file for new columns
2. [ ] Update transition endpoint with new fields
3. [ ] Create revert endpoint
4. [ ] Create matching-clubs endpoint
5. [ ] Test endpoints via curl

### Phase 2: Auto-Detection
1. [ ] Add auto-match logic with name matching
2. [ ] Add first-event-after-launch validation (compulsory)
3. [ ] Add logging for auto-matches
4. [ ] Test auto-matching with sample data

### Phase 3: Frontend - Matched Club Indicator
1. [ ] Add matched launch icon to club rows
2. [ ] Create hover tooltip with launch info and undo
3. [ ] Hide matched launches from hierarchy

### Phase 4: Frontend - Manual Match
1. [ ] Create `LinkToClubModal` component
2. [ ] Add "Link to Club" button to unmatched launch rows
3. [ ] Implement club search/filter (same city only)
4. [ ] Connect to transition endpoint

### Phase 5: Frontend - Undo Flow
1. [ ] Create undo confirmation modal
2. [ ] Connect to revert endpoint
3. [ ] Re-show launch in hierarchy after undo

### Phase 6: Testing & Polish
1. [ ] End-to-end testing
2. [ ] Edge cases (no matching clubs, revert after progress made)
3. [ ] Verify rollup counts are correct (no double counting)

---

## 6. Edge Cases & Considerations

### 6.1 What if club is deleted after matching?
- Display "Club not found" with option to revert
- Query should handle missing clubs gracefully

### 6.2 What if targets already exist for the club?
- The `ON CONFLICT DO UPDATE` handles this - merges/updates existing targets

### 6.3 Auto-match vs Manual preference
- Auto-match only runs if `match_type IS NULL`
- Manual matches take precedence
- Users can undo auto-match and manually link to different club

### 6.4 Multiple clubs in same activity/area
- Auto-match uses **name matching** to pick best match
- Manual match shows all options for user choice

### 6.5 Launch progress after transition
- Progress continues to be tracked on the club's target
- Original launch record preserved for audit trail

### 6.6 Revert after targets transferred
- Option to keep or delete transferred targets
- If kept, club keeps the targets even after unlinking

---

## 7. API Summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/targets/v2/launches/:id/transition` | POST | Transition launch to club |
| `/api/targets/v2/launches/:id/revert` | POST | Undo a transition |
| `/api/targets/v2/launches/:id/matching-clubs` | GET | Get clubs for manual match |

---

*Created: 2026-01-14*
*Updated: 2026-01-14*
*Status: READY FOR APPROVAL*
