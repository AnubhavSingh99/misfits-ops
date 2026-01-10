# V2 Dashboard Health Integration Plan

## Overview

Integrate club health metrics seamlessly into the V2 Scaling Dashboard with a clean, non-intrusive design that blends with the existing UI.

---

## Design Principles

1. **Subtle Integration** - Health indicators blend in, don't dominate
2. **Progressive Disclosure** - Simple dot shows status, details on interaction
3. **Consistent Styling** - Match existing V2 color palette and spacing
4. **Actionable Insights** - Every metric leads to potential action

---

## Color Palette (Muted, Professional)

```
Health Colors (Softer than standard traffic lights):
┌─────────────────────────────────────────────────────────────┐
│  🟢 Healthy   │ #10B981 (emerald-500)  │ bg-emerald-500    │
│  🟡 At Risk   │ #F59E0B (amber-500)    │ bg-amber-500      │
│  🔴 Critical  │ #EF4444 (red-500)      │ bg-red-500        │
│  ⚫ Dormant   │ #6B7280 (gray-500)     │ bg-gray-500       │
│  ⬜ Inactive  │ #D1D5DB (gray-300)     │ bg-gray-300       │
└─────────────────────────────────────────────────────────────┘

Dot Styling:
- Size: 10px (w-2.5 h-2.5)
- Border: 1px white ring for contrast
- Hover: Subtle glow matching color
```

---

## Table Layout

### Column Order
```
┌────────────────────────────────────────────────────────────────────────────────────┐
│ Hierarchy │ Health ⓘ │ Target │ Current │ Gap │ L4W Rev │ Stage │ Revenue │ Tasks │
└────────────────────────────────────────────────────────────────────────────────────┘
```

### Health Column Design
```tsx
// Column header
<th className="py-3 px-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">
  <div className="flex items-center gap-1.5">
    <span>Health</span>
    <button className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600">
      <Info size={12} />
    </button>
  </div>
</th>

// Cell - simple dot
<td className="py-3 px-3">
  <div className="flex justify-center">
    <div
      className={`w-2.5 h-2.5 rounded-full ring-1 ring-white cursor-pointer
        transition-all duration-200 hover:scale-125 hover:ring-2
        ${healthColor} ${healthGlow}`}
      onClick={() => showTooltip()}
    />
  </div>
</td>
```

---

## Filter Design (Subtle Integration)

### Current Filter Bar Enhancement
```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  Filters                                                                            │
│                                                                                     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────┐ │
│  │ Activity  ▾  │ │ City      ▾  │ │ Area      ▾  │ │ Team      ▾  │ │ Health ▾ │ │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘ └──────────┘ │
│                                                                                     │
│  Active: [Badminton ×] [Delhi NCR ×]                              [Clear all]      │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### Health Filter Dropdown (Minimal Design)
```
┌────────────────────────┐
│  Health Status         │
├────────────────────────┤
│  ☑ ● Healthy    (45)  │
│  ☑ ● At Risk    (23)  │
│  ☑ ● Critical   (12)  │
│  ☐ ● Dormant     (8)  │
│  ☐ ○ Inactive   (15)  │
├────────────────────────┤
│  [Select All] [Clear]  │
└────────────────────────┘

Styling:
- Same dropdown style as other filters
- Small colored dots (6px) next to labels
- Counts in muted gray
- No bold colors in dropdown itself
```

### Filter Chip for Health (When Active)
```tsx
// Blends with existing filter chips
<span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
  text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
  <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
  Critical
  <button className="hover:text-gray-900">×</button>
</span>
```

---

## Health Calculation Logic

### Club-Level Score (0-100)

```typescript
// Established clubs (≥2 months)
const weights = {
  capacity: 0.30,    // 30%
  repeat_rate: 0.40, // 40% - retention matters most
  rating: 0.30       // 30%
};

// New clubs (<2 months)
const newClubWeights = {
  capacity: 0.60,    // 60%
  repeat_rate: 0.00, // excluded
  rating: 0.40       // 40%
};

const score =
  (capacity_pct / 100) * weights.capacity * 100 +
  (repeat_rate_pct / 100) * weights.repeat_rate * 100 +
  (rating / 5) * weights.rating * 100;
```

### Metric Thresholds

| Metric | Green | Yellow | Red |
|--------|-------|--------|-----|
| Capacity | ≥75% | 50-74% | <50% |
| Repeat Rate | ≥65% | 50-64% | <50% |
| Rating | ≥4.7 | 4.4-4.69 | <4.4 |

### Score to Status

| Score | Status | Color |
|-------|--------|-------|
| ≥70 | Healthy | Green |
| 50-69 | At Risk | Yellow |
| <50 | Critical | Red |
| No events | Dormant | Gray |
| Inactive club | Inactive | Light Gray |

### Roll-up Logic (Weighted Average)

```typescript
// Parent score = average of all children's health scores
const parentScore = children.reduce((sum, c) => sum + c.health_score, 0) / children.length;

// Same thresholds apply
const parentStatus = parentScore >= 70 ? 'green' : parentScore >= 50 ? 'yellow' : 'red';
```

---

## Tooltip Designs

### Club Details Tooltip (480px wide)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Dropshot Society                                                   │
│  Noida • Badminton                            Jan 6 - 12  [▾]      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  HEALTH                                              Score: 72     │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                   │
│  │  Capacity   │ │   Repeat    │ │   Rating    │                   │
│  │     🟢      │ │     🟡      │ │     🟢      │                   │
│  │    82%      │ │    58%      │ │   4.8 ★     │                   │
│  │   ▲ +5%     │ │   ▼ -3%     │ │  ▲ +0.1     │                   │
│  └─────────────┘ └─────────────┘ └─────────────┘                   │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  MEETUPS                                            4 this week    │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ Event           │ Date  │ Price │ Booked │ Rev   │ Target     │ │
│  │ Morning Smash   │ Tue 7 │ ₹299  │ 12/16  │ ₹3.5K │ Weekend    │ │
│  │ Evening Rally   │ Wed 8 │ ₹349  │ 8/12   │ ₹2.8K │ Weekend    │ │
│  │ Pro Training    │ Sat   │ ₹499  │ 6/8    │ ₹3.0K │ Weekday    │ │
│  │ Sunday Special  │ Sun   │ ₹399  │ 10/14  │ ₹4.0K │ Weekend    │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  ⚠️ Repeat rate declining - down 3% from last week                 │
├─────────────────────────────────────────────────────────────────────┤
│  [📋 Task]  [📊 Sprint]  [✏️ Edit]                                 │
└─────────────────────────────────────────────────────────────────────┘
```

### Roll-up Tooltip (420px wide)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Delhi NCR                                                          │
│  Badminton • 28 clubs                                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  REGION HEALTH                                       Avg: 64/100   │
│                                                                     │
│  Distribution:                                                      │
│  🟢 Healthy   ████████████████░░░░░░░░   18 (64%)                  │
│  🟡 At Risk   ██████░░░░░░░░░░░░░░░░░░    7 (25%)                  │
│  🔴 Critical  ██░░░░░░░░░░░░░░░░░░░░░░    3 (11%)                  │
│                                                                     │
│  Averages:                                                          │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐                         │
│  │ Cap: 68%  │ │ Rep: 55%  │ │ Rat: 4.7  │                         │
│  │    🟡     │ │    🟡     │ │    🟢     │                         │
│  └───────────┘ └───────────┘ └───────────┘                         │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  🔴 CRITICAL CLUBS                                                  │
│  • Shuttle Masters (Gurgaon) - Score: 38                           │
│  • Net Warriors (Noida) - Score: 42                                │
│  • Racket Club (Delhi) - Score: 45                                 │
├─────────────────────────────────────────────────────────────────────┤
│  [📋 Region Task]  [📊 Sprint]                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Info Modal (Health Logic)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Health Calculation                                             ✕  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  SCORE FORMULA                                                      │
│  ─────────────────────────────────────────────────────────────────  │
│  Established clubs: Capacity(30%) + Repeat(40%) + Rating(30%)      │
│  New clubs (<2mo):  Capacity(60%) + Rating(40%)                    │
│                                                                     │
│  THRESHOLDS                                                         │
│  ─────────────────────────────────────────────────────────────────  │
│  ┌────────────┬─────────┬───────────┬─────────┐                    │
│  │ Metric     │ 🟢 Green │ 🟡 Yellow │ 🔴 Red  │                    │
│  ├────────────┼─────────┼───────────┼─────────┤                    │
│  │ Capacity   │ ≥75%    │ 50-74%    │ <50%    │                    │
│  │ Repeat     │ ≥65%    │ 50-64%    │ <50%    │                    │
│  │ Rating     │ ≥4.7    │ 4.4-4.69  │ <4.4    │                    │
│  └────────────┴─────────┴───────────┴─────────┘                    │
│                                                                     │
│  STATUS MAPPING                                                     │
│  ─────────────────────────────────────────────────────────────────  │
│  Score ≥70 → 🟢 Healthy    Score <50 → 🔴 Critical                 │
│  Score 50-69 → 🟡 At Risk  No events → ⚫ Dormant                  │
│                                                                     │
│  ROLL-UP                                                            │
│  ─────────────────────────────────────────────────────────────────  │
│  Parent score = Average of all children's health scores            │
│  Same thresholds apply for status                                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Backend (targets.ts) ✅ COMPLETED
- [x] Add health calculation to `/api/targets/v2/hierarchy`
- [x] Compute per-club metrics from production DB (capacity_pct, repeat_rate_pct, avg_rating)
- [x] Calculate health_score and health_status for clubs
- [x] Roll-up health to parent nodes (area, city, activity) - excluding launches
- [x] Add health_distribution to summary

**Implementation Details:**
- Added `healthMetricsQuery` CTE to get capacity, repeat rate, and rating per club
- Added `calculateHealthScore()` function with weighted formula
- Added `getHealthStatus()` function for score → status mapping
- Added `rollupHealth()` function for parent node aggregation (excludes launches)
- Health fields added to both custom and default hierarchy code paths

### Phase 2: Types (shared/types.ts) ✅ COMPLETED
- [x] Extended `HierarchyNode` with health fields:
  ```typescript
  health_score?: number;           // 0-100 weighted score
  health_status?: 'green' | 'yellow' | 'red' | 'gray';
  capacity_pct?: number;           // Capacity utilization %
  repeat_rate_pct?: number;        // Repeat rate %
  avg_rating?: number;             // Average rating (0-5)
  is_new_club?: boolean;           // Less than 2 months old
  // Individual metric health (for clubs)
  capacity_health?: 'green' | 'yellow' | 'red';
  repeat_health?: 'green' | 'yellow' | 'red';
  rating_health?: 'green' | 'yellow' | 'red';
  // Roll-up only
  health_distribution?: {
    green: number;
    yellow: number;
    red: number;
    gray: number;
  };
  ```

### Phase 3: Components ✅ COMPLETED
- [x] `HealthDot.tsx` - Reusable health indicator (green/yellow/red/gray dots with hover effects)
- [x] `HealthDistributionBar.tsx` - Roll-up bar showing distribution (in HealthDot.tsx)
- [x] `HealthInfoModal.tsx` - Logic explanation modal with thresholds table

**Implemented:**
- Club health section integrated into `MeetupDetailsTooltip.tsx` with:
  - Health score display with status indicator
  - 3 metric cards (Capacity, Repeat Rate, Rating) with WoW comparison
  - Trending arrows and percentage changes
  - Warning banner for declining metrics
- Roll-up nodes use `HealthDistributionBar` as indicator (no tooltip)

### Phase 4: Table Integration (ScalingPlannerV2.tsx) ✅ COMPLETED
- [x] Add Health column after Hierarchy
- [x] Add ⓘ button to header with modal
- [x] Render HealthDot for clubs/launches
- [x] Render HealthDistributionBar for parent nodes (activity, city, area)
- [x] Add health_score to sortable columns
- [x] Update HierarchyRollupHeader with health distribution
- [x] Update colSpan for empty state (10 → 11)

### Phase 5: Filter Integration (HierarchyFilterBar.tsx) (DEFERRED)
- [ ] Add health status to filter options
- [ ] Create subtle health filter dropdown
- [ ] Add health filter chips (minimal design)
- [ ] Update filter logic to include health

**Note:** Filter integration deferred to next sprint - current implementation provides sufficient visibility.

### Phase 6: Polish (PARTIAL)
- [x] Hover effects on health dots
- [x] Transitions on hover
- [ ] Loading states for health data
- [ ] Error handling for missing health data
- [ ] Mobile responsiveness testing

---

## Files to Create/Modify

| File | Action | Status | Description |
|------|--------|--------|-------------|
| `server/src/routes/targets.ts` | Modify | ✅ Done | Add health calculation + WoW metrics in meetup-details |
| `shared/types.ts` | Modify | ✅ Done | Extend HierarchyNode |
| `client/src/components/scaling/MeetupDetailsTooltip.tsx` | Modify | ✅ Done | Integrated health section with WoW comparison |
| `client/src/components/scaling/HealthInfoModal.tsx` | Create | ✅ Done | Info modal |
| `client/src/components/scaling/HealthDot.tsx` | Create | ✅ Done | Dot + distribution bar component |
| `client/src/components/scaling/HierarchyFilterBar.tsx` | Modify | ⏳ Deferred | Add health filter |
| `client/src/components/scaling/index.ts` | Modify | ✅ Done | Export new components |
| `client/src/pages/ScalingPlannerV2.tsx` | Modify | ✅ Done | Add Health column |

---

## Success Criteria

1. Health dot visible for all rows (club and roll-up)
2. Click/hover shows appropriate tooltip
3. Info modal explains calculation clearly
4. Filter works without dominating UI
5. Sorting by health_score works
6. Roll-up accurately reflects children's average
7. Performance: <100ms added to load time

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Performance impact | Cache health calculations, compute server-side |
| Visual clutter | Subtle colors, progressive disclosure |
| Data accuracy | Use same formulas as existing health dashboard |
| Mobile UX | Test tooltip positioning on small screens |

---

## Timeline Estimate

| Phase | Effort |
|-------|--------|
| Backend | 2-3 hours |
| Types | 30 mins |
| Components | 3-4 hours |
| Table Integration | 1-2 hours |
| Filter Integration | 1-2 hours |
| Polish | 1-2 hours |
| **Total** | **~10-14 hours** |
