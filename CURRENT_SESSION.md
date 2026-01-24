# Current Session Context - Venue Requirements Dashboard
**Last Updated: 2026-01-23 1:45 PM**

## COMMITS READY FOR PR (8 ahead of origin/main)

| Commit | Description |
|--------|-------------|
| `4c6c2e9` | Fix expand bug and show description below name |
| `280eff3` | Combine Done & Deprioritised into one section with separate sub-hierarchies |
| `e7141d7` | Split Done and Deprioritised into separate sections, make capacity mandatory |
| `9be8260` | Add Completed & Deprioritised section from production |
| `682851c` | Add capacity field and update priority colors to dots |
| `872bdff` | Add TAT analysis, always-visible alert bar, and dynamic SLA dropdown |
| `9a24ac0` | Add info modal and hover tooltips for status/priority guide |
| `5774946` | Add priority hierarchy support and fix club dropdown query |

## FEATURES IMPLEMENTED THIS SESSION

### 1. Capacity Field
- Added type `CapacityBucket` to `/shared/types.ts`
- Options: `<10`, `10-20`, `20-30`, `30-50`, `50-100`, `100-200`, `200-500`, `>500`
- **Capacity is MANDATORY** - can't save without selecting
- Added to table column, Edit modal, Create modal
- Database migration: `/server/database/migrations/add_capacity_to_venue_requirements.sql`

### 2. Priority Colors (Red/Yellow/Green)
- Updated from emojis to colored dots
- Red = Critical (exceeded SLA)
- Yellow = High (approaching SLA)
- Green = Normal (within SLA)
- Updated in alert bar, table rows, and info modal

### 3. Description Display
- Description shown BELOW the name (always visible)
- Gray text, truncated to 1 line
- No hover tooltip needed

### 4. Done & Deprioritised Section
- One collapsible "Done & Deprioritised (N)" outer section
- Inside: separate "Done" and "Deprioritised" sub-sections with their own headers
- Done sub-section: green header with CheckCircle icon
- Deprioritised sub-section: gray header with Pause icon

### 5. Independent Section Expansion
- Fixed bug where clicking a city expanded it in ALL sections
- Each section (active/done/deprioritised) now expands independently
- Uses sectionPrefix in HierarchyRow to create unique expand keys

### 6. TAT Analysis
- Avg TAT tile with click-to-open popup
- Day-wise completion distribution
- Within SLA percentage

### 7. Info Modal
- Help icon next to title
- Explains statuses and priorities with colored dots
- Hover tooltips on status filter chips

### 8. Always-Visible Alert Bar
- Shows Overdue, Due Soon, On Track counts
- Always visible even when all are 0

### 9. Dynamic SLA Dropdown
- Shows actual age values from system merged with defaults

## FILES MODIFIED
- `/shared/types.ts` - CapacityBucket type, CAPACITY_BUCKET_OPTIONS
- `/server/src/routes/requirements.ts` - INSERT/UPDATE with capacity, TAT stats
- `/server/database/migrations/add_capacity_to_venue_requirements.sql`
- `/client/src/pages/VenueRequirementsDashboard.tsx` - All frontend changes

## READY FOR PR
All changes tested and committed. Ready to push and create PR.
