# 🗃️ DATABASE REQUIREMENTS - Club Health Report Generation Script Analysis

## 📊 **EXECUTIVE SUMMARY**

Based on your **Club Health Report Generation Script.xlsx**, here's the complete data extraction methodology for the Misfits Operations Platform:

### **Core Database Tables Used:**
```sql
-- Primary Tables
club (pk, name, activity, status)
event (pk, club_id, state, start_time, location_id, max_people, ticket_price)
booking (pk, event_id, booking_status, booking_payment_status)
location (id, area_id)
area (id, city_id)
city (id, name)

-- Status Values
club.status: 'ACTIVE' (only these are included)
event.state: 'CREATED' (excludes 'CANCELLED')
booking.booking_status: 'REGISTERED', 'WAITLISTED', 'ATTENDED', 'NOT_ATTENDED', 'OPEN_FOR_REPLACEMENT'
booking.booking_payment_status: 'COMPLETED', 'PENDING'
```

---

## 🎯 **CRITICAL HEALTH METRICS (Your 4-Metric System)**

### **1. CAPACITY HEALTH**
```sql
-- Bookings Capacity % = Total Registrations / Max Capacity × 100
SELECT
  COUNT(CASE WHEN b.booking_status IN ('REGISTERED', 'WAITLISTED', 'ATTENDED', 'NOT_ATTENDED', 'OPEN_FOR_REPLACEMENT') THEN 1 END)::numeric / NULLIF(e.max_people, 0) * 100 as bookings_capacity_pct
```
**Thresholds:**
- Green: ≥75% | Yellow: 50-74% | Red: <50%

### **2. REPEAT RATE HEALTH**
```sql
-- Repeat Rate % = Returning members / Total attendees × 100
-- (Complex query tracking user booking history across events)
```
**Thresholds:**
- Green: ≥65% | Yellow: 45-64% | Red: <45%

### **3. RATING HEALTH**
```sql
-- Latest rating from reviews table
SELECT AVG(rating) FROM reviews WHERE event_id = ?
```
**Thresholds:**
- Green: ≥4.7 | Yellow: 4.5-4.69 | Red: <4.5

### **4. REVENUE HEALTH**
```sql
-- Actual Revenue = SUM(ticket_price) WHERE payment completed
SELECT SUM(e.ticket_price::numeric / 100)
FROM event e
JOIN booking b ON e.pk = b.event_id
WHERE b.booking_payment_status = 'COMPLETED'
```

---

## 📅 **TIME PERIOD CALCULATIONS (IST Timezone Critical)**

### **Week Boundaries Logic:**
```sql
WITH week_boundaries AS (
  SELECT
    -- Last completed week (Monday to Sunday in IST)
    (DATE_TRUNC('week', (NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata' - INTERVAL '1 week') AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'UTC' as last_week_start_utc,
    (DATE_TRUNC('week', (NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'UTC' - INTERVAL '1 second' as last_week_end_utc,

    -- 4 weeks period for active club identification
    (DATE_TRUNC('week', (NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata' - INTERVAL '4 weeks') AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'UTC' as four_weeks_start_utc
)
```

---

## 🏢 **ACTIVE CLUB IDENTIFICATION**

### **Active Club Definition:**
- **Time Window:** Last 4 weeks
- **Criteria:** ≥1 event with state='CREATED'
- **Status:** club.status = 'ACTIVE'
- **Exclusions:** Test clubs (name NOT LIKE '%test%')

```sql
-- Active clubs in last 4 weeks
SELECT DISTINCT c.pk as club_id,
  (SELECT city2.name FROM event e2
   LEFT JOIN location loc2 ON e2.location_id = loc2.id
   LEFT JOIN area a2 ON loc2.area_id = a2.id
   LEFT JOIN city city2 ON a2.city_id = city2.id
   WHERE e2.club_id = c.pk AND e2.state = 'CREATED'
   ORDER BY e2.start_time DESC LIMIT 1) as city_name
FROM club c
JOIN event e ON c.pk = e.club_id
WHERE c.status = 'ACTIVE'
  AND e.state = 'CREATED'
  AND e.start_time >= four_weeks_start_utc
  AND e.start_time <= last_week_end_utc
  AND c.name NOT LIKE '%test%'
```

---

## 💰 **REVENUE CALCULATIONS**

### **Revenue Per Week:**
```sql
SELECT
  SUM(CASE WHEN b.booking_payment_status = 'COMPLETED'
      THEN e.ticket_price::numeric / 100 ELSE 0 END) as total_revenue
FROM event e
JOIN booking b ON e.pk = b.event_id
WHERE e.start_time >= last_week_start_utc
  AND e.start_time <= last_week_end_utc
  AND e.state = 'CREATED'
```

### **Revenue Growth (Current vs Previous):**
- **Current Month:** Sum of completed payments in current month
- **Target:** 40% growth from 3-month average
- **Progress:** (current_revenue / target_revenue) × 100

---

## 🎯 **HEALTH CLASSIFICATION LOGIC**

### **Overall Health Determination:**
```sql
CASE
  -- RED: 2+ components are red
  WHEN (capacity_health = 'Red')::int + (repeat_health = 'Red')::int + (rating_health = 'Red')::int >= 2
  THEN 'Red'

  -- YELLOW: Any component is yellow (but not 2+ red)
  WHEN capacity_health = 'Yellow' OR repeat_health = 'Yellow' OR rating_health = 'Yellow'
  THEN 'Yellow'

  -- GREEN: All components are green
  ELSE 'Green'
END as overall_health
```

### **Component Health Logic:**
```sql
-- Capacity Health
CASE WHEN bookings_capacity_pct >= 75 THEN 'Green'
     WHEN bookings_capacity_pct >= 50 THEN 'Yellow'
     ELSE 'Red' END as capacity_health

-- Repeat Health
CASE WHEN repeat_rate_pct >= 65 THEN 'Green'
     WHEN repeat_rate_pct >= 45 THEN 'Yellow'
     ELSE 'Red' END as repeat_health

-- Rating Health
CASE WHEN avg_rating >= 4.7 THEN 'Green'
     WHEN avg_rating >= 4.5 THEN 'Yellow'
     ELSE 'Red' END as rating_health
```

---

## 📈 **WEEK-OVER-WEEK TRACKING**

### **WoW Metrics Tracked:**
1. **Meetup Count Change**
2. **Capacity Utilization Change**
3. **Revenue Change**
4. **Registration Count Change**
5. **Attendance Rate Change**
6. **Rating Change**
7. **No-Show Rate Change**
8. **Payment Completion Rate Change**

### **Change Classification:**
- **📈 Positive:** >5% capacity increase OR >10% revenue increase
- **📉 Negative:** >5% capacity decrease OR >10% revenue decrease
- **📊 Stable:** ±5% change (normal variation)

---

## 🏙️ **CITY-LEVEL AGGREGATIONS**

### **City Performance Query:**
```sql
SELECT
  city.name as city_name,
  COUNT(DISTINCT ac.club_id) as total_active_clubs,
  COUNT(DISTINCT e.pk) as total_meetups,
  COUNT(CASE WHEN b.booking_status IN ('REGISTERED', 'WAITLISTED', 'ATTENDED', 'NOT_ATTENDED', 'OPEN_FOR_REPLACEMENT') THEN 1 END) as total_registrations,
  ROUND(SUM(CASE WHEN b.booking_payment_status = 'COMPLETED' THEN e.ticket_price::numeric / 100 ELSE 0 END), 1) as total_revenue,
  ROUND(COUNT(CASE WHEN b.booking_status IN (...) THEN 1 END)::numeric / NULLIF(SUM(e.max_people), 0) * 100, 1) as avg_capacity_pct
FROM active_clubs_by_city ac
LEFT JOIN event e ON e.club_id = ac.club_id
LEFT JOIN booking b ON e.pk = b.event_id
GROUP BY city.name
ORDER BY total_revenue DESC
```

---

## 🎪 **POC/SPOC INTEGRATION**

### **SPOC Assignment Logic:**
- **Source:** External CSV file (`spoc_data.csv`)
- **Mapping:** Club name → SPOC assignment
- **Integration:** Left join SPOC data to main club query
- **Filtering:** "View as Rahul" → Filter clubs assigned to Rahul

---

## 🔄 **CHANGE DETECTION SYSTEM**

### **Operational Changes Tracked:**
```sql
-- Venue changes (location_id comparison)
-- Price changes (ticket_price comparison)
-- Schedule changes (day/time comparison)
-- Impact analysis (>10% capacity change)
```

### **Change Impact Classification:**
- **🏢 Venue:** Location changes
- **💰 Price:** Ticket price adjustments
- **📅 Day:** Schedule day modifications
- **⏰ Time:** Start time changes

---

## 📊 **CRITICAL ALERTS GENERATION**

### **Alert Conditions:**
```sql
-- Critical Health Alert
CASE WHEN (red_clubs / total_clubs * 100) > 15
     THEN 'CRITICAL: ' || red_clubs || ' clubs need immediate intervention'
END

-- Revenue Miss Alert
CASE WHEN (actual_revenue / target_revenue * 100) < 80
     THEN 'WARNING: Revenue ' || ROUND(shortfall_amount) || ' below target'
END

-- Capacity Alert
CASE WHEN avg_capacity_across_all_clubs < 60
     THEN 'ALERT: System-wide capacity utilization below threshold'
END
```

---

## 🎮 **GAMIFICATION DATA POINTS**

### **Point Allocation Events:**
```sql
-- Stage progression points
-- Revenue achievement points
-- Health improvement points
-- Special milestone points
```

### **Team Performance Metrics:**
- **Revenue per Team:** Sum of team member club revenue
- **Health Distribution per Team:** Green/Yellow/Red club counts
- **Growth Rate per Team:** Month-over-month improvement

---

## ⚙️ **IMPLEMENTATION REQUIREMENTS**

### **Database Connection:**
- **Host:** localhost:5433 (SSH tunnel to production)
- **Credentials:** dev/postgres
- **Timezone:** All queries must handle UTC ↔ Asia/Kolkata conversion

### **Query Performance:**
- **11 CTEs** in main comprehensive query
- **Pre-aggregated capacity** to prevent JOIN multiplication
- **Indexed columns:** club.pk, event.club_id, booking.event_id

### **Data Quality Filters:**
- **Test Exclusion:** `name NOT LIKE '%test%'`
- **Active Only:** `club.status = 'ACTIVE'`
- **Valid Events:** `event.state = 'CREATED'`
- **Valid Bookings:** Status in approved list

---

## 🚀 **NEXT STEPS FOR PLATFORM INTEGRATION**

1. **Update Database Routes** → Use exact SQL from health script
2. **Implement Timezone Handling** → IST conversion in all queries
3. **Add SPOC Integration** → CSV upload and assignment logic
4. **Create Change Detection** → Week-over-week comparison system
5. **Build Alert Engine** → Threshold-based notifications
6. **Implement Gamification** → Point tracking and team competition

The Club Health Report Generation Script provides the complete methodology for extracting ₹42L → ₹60L pipeline data and all health metrics needed for the Misfits Operations Platform!