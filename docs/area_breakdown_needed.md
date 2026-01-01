# Area Breakdown Needed from Database

## Query Required:
```sql
-- Get real area breakdown with active clubs
SELECT
  COALESCE(ci.name, 'Unknown City') as city,
  COALESCE(a.name, 'Unknown Area') as area,
  c.activity,
  COUNT(*) as club_count,
  -- L1/L2 classification based on event frequency
  COUNT(DISTINCT CASE
    WHEN (c.activity IN ('BADMINTON', 'FOOTBALL', 'BASKETBALL', 'BOX_CRICKET', 'PICKLEBALL')
          AND weekly_events.event_count >= 4)
      OR (c.activity NOT IN ('BADMINTON', 'FOOTBALL', 'BASKETBALL', 'BOX_CRICKET', 'PICKLEBALL')
          AND weekly_events.event_count >= 2)
    THEN c.id END) as l2_clubs,
  COUNT(DISTINCT CASE
    WHEN NOT ((c.activity IN ('BADMINTON', 'FOOTBALL', 'BASKETBALL', 'BOX_CRICKET', 'PICKLEBALL')
               AND weekly_events.event_count >= 4)
           OR (c.activity NOT IN ('BADMINTON', 'FOOTBALL', 'BASKETBALL', 'BOX_CRICKET', 'PICKLEBALL')
               AND weekly_events.event_count >= 2))
    THEN c.id END) as l1_clubs
FROM club c
LEFT JOIN area a ON c.area_id = a.pk
LEFT JOIN city ci ON a.city_id = ci.pk
LEFT JOIN (
  SELECT
    club_id,
    COUNT(*) / 4 as event_count  -- Events per week (assuming 4 weeks)
  FROM event
  WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
  GROUP BY club_id
) weekly_events ON c.pk = weekly_events.club_id
WHERE c.status = 'ACTIVE'
  AND c.activity NOT IN ('TEST', 'DEFAULT')
GROUP BY ci.name, a.name, c.activity
HAVING COUNT(*) > 0
ORDER BY ci.name, a.name, c.activity;
```

## Data Needed for Excel Model:
1. **Real city breakdown** (not fake Gurgaon/Delhi NCR numbers)
2. **Real area breakdown** (actual area names from database)
3. **Activity distribution per area** (which areas have which activities)
4. **L1 vs L2 classification per area** (based on actual event frequency)
5. **Club counts per area-activity combination**

## Current Excel Errors to Fix:
- Replace fake city/area data with real database data
- Fix L1/L2 count mismatches across sheets
- Use real area names for scaling strategy
- Base expansion plans on actual geographic distribution