# Misfits Ops Platform - Feature Backlog

## Status Legend
- `TODO` - Not started
- `IN_PROGRESS` - Currently being worked on
- `DONE` - Completed
- `BLOCKED` - Waiting on something

---

## Current Sprint

### 1. V2 Dashboard Health Integration
**Status:** `DONE`
**Priority:** P0
**Completed:** 2026-01-10

**Backend (DONE):**
- [x] Add health metrics query (capacity, repeat_rate, rating)
- [x] Calculate health_score and health_status per club
- [x] Roll-up health to parent nodes (excluding launches)
- [x] Add health_distribution to summary
- [x] Exclude WAITLISTED bookings from calculations
- [x] Update HierarchyNode types

**Frontend (DONE):**
- [x] Create HealthDot.tsx component
- [x] Create HealthDistributionBar component (for roll-ups)
- [x] Create HealthInfoModal.tsx (calculation logic explanation)
- [x] Add Health column to table (after Hierarchy, before Target)
- [x] Add health to sortable columns
- [x] Update HierarchyRollupHeader with health distribution

**Deferred to future sprint:**
- [ ] Health filter integration in HierarchyFilterBar
- [ ] Unified tooltip with health + meetup details (using existing tooltip instead)

---

## Backlog

### 2. Task List Tooltip for Hierarchy Nodes
**Status:** `DONE`
**Priority:** P1
**Completed:** 2026-01-10

**Description:** When a hierarchy node has less than 7 tasks, show a task list tooltip on hover with the same tile view as Sprint modal.

**Implementation:**
- [x] Created `TaskListTooltip.tsx` component
- [x] Shows compact task tiles on hover when ≤6 tasks
- [x] 300ms delay before showing to avoid accidental triggers
- [x] Portal-based tooltip to escape overflow:hidden
- [x] Status quick toggle (Start/Done) works inline
- [x] Integrated into HierarchyRow via wrapping TaskSummaryCell

---

### 3. Team Assignments - Platform-Wide
**Status:** `DONE`
**Priority:** P1
**Completed:** 2026-01-10

**Description:** Currently teams are hardcoded with city-wise bifurcation (green team has Jaipur and Bangalore). Need to change so that activity bifurcation applies platform-wide, not just Delhi NCR.

**Implementation:**
- [x] Removed GREEN_EXCLUSIVE_CITIES logic (Jaipur, Bangalore no longer Green-only)
- [x] Activity assignments now apply to ALL cities platform-wide
- [x] Updated `getTeamForClub()` to only use activity, city param is now optional
- [x] Kept legacy constants for backward compatibility but they're not used

**Team Activity Assignments (Platform-Wide):**
- Blue: Board Gaming, Football, Social Deduction, Quiz
- Yellow: Badminton, Art, Journaling, Box Cricket
- Green: All other activities

---

### 4. Sprint Modal Loading/Flickering Fix
**Status:** `DONE`
**Priority:** P1
**Completed:** 2026-01-10

**Description:** Sprint modal takes long time to load, loads once, then flickers, then stabilizes.

**Implementation:**
- [x] Separated initial fetch from cascading filter updates
- [x] Parallel fetch of all filter options (Promise.all) for faster initial load
- [x] Batched state updates to prevent multiple re-renders
- [x] Added debounce (150ms) on cascading filter updates
- [x] Added `initialFetchDone` flag to prevent re-initialization

---

### 5. Feature Request / Bug Report System
**Status:** `DONE`
**Priority:** P2
**Completed:** 2026-01-10

**Description:** Add a button at top-right of dashboard for users to submit feature requests or bug reports.

**Implementation:**
- [x] Type selector: Feature Request / Bug Report
- [x] Feature description field
- [x] Requestor name field
- [x] Image upload with drag-and-drop support
- [x] Compress images before storing on server (Sharp: webp, 80% quality, max 1200px)
- [x] Created `FeedbackModal.tsx` component with modern UI
- [x] Created `server/src/routes/feedback.ts` backend route
- [x] Feedback button added to dashboard header (next to refresh)

**Storage:**
- `docs/user_feature_request_backlog.md` - Feature requests with status
- `docs/bug_reports.md` - Bug reports with status
- `server/uploads/feedback_images/` - Compressed images (webp)

---

### 6. Monthly Revenue Tile (Sep 2025 - Mar 2026)
**Status:** `DONE`
**Priority:** P2
**Completed:** 2026-01-10

**Description:** Changed March tile in summary to show monthly revenue trend from Sep 2025 to Mar 2026.

**Implementation:**
- [x] Modern, super understandable design with mini bar chart
- [x] Shows total revenue per month (Sep 2025 - Mar 2026)
- [x] Hover tooltips with exact revenue per month
- [x] Month-over-month growth percentage badge
- [x] Backend returns `monthly_revenue` array with monthly breakdown
- [x] Responsive design with beautiful animations

---

## Completed

### Health Query - WAITLISTED Exclusion
**Status:** `DONE`
**Completed:** 2026-01-10

- Updated health metrics query to exclude WAITLISTED bookings
- Applies to capacity calculation and repeat rate calculation

---

## Notes

- All booking calculations should exclude: DEREGISTERED, INITIATED, WAITLISTED
- New club launches do NOT get health scores and are NOT counted in roll-ups
- Health score formula: capacity(30%) + repeat_rate(40%) + rating(30%) for established clubs
- New clubs (<2 months): capacity(60%) + rating(40%)
