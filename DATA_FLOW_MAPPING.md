# 🗺️ Misfits Operations Platform - Complete Data Flow Mapping

## 📊 **DATABASE SOURCES (What comes FROM production database)**

### **Core Database Tables (Production Misfits DB)**
```sql
-- Main revenue source tables
payment (pk, booking_id, amount, status, created_at)
booking (pk, event_id, user_id)
event (pk, club_id, capacity, created_at)
club (pk, name, activity, status)
reviews (event_id, rating)
```

---

## 🏗️ **SECTION 1: DASHBOARD - Revenue Pipeline & System State**

### **FROM DATABASE:**
| Data Point | Source Query | Purpose |
|------------|--------------|---------|
| **Current Revenue** | `SUM(p.amount)/100 FROM payment p WHERE p.status='COMPLETED' AND current month` | Main ₹42L → actual revenue |
| **Target Revenue** | `Calculated as current_avg * 1.4 (40% growth target)` | ₹60L pipeline goal |
| **Progress %** | `(current_revenue / target_revenue) * 100` | Pipeline completion |
| **Club Health Distribution** | `CASE WHEN capacity>=20 AND rating>=4.0... THEN 'green'` | Health pie chart |
| **Active Meetups Count** | `COUNT(DISTINCT e.id) FROM event e WHERE last 30 days` | Live meetup tracking |
| **Critical Alerts** | `WHERE health='red' AND count > 15% of total` | System warnings |

### **WEBSITE INPUTS:**
- **No direct inputs** - Dashboard is read-only display
- Auto-refreshes every 30 seconds
- Date range: Last 3 months (hardcoded)

### **INPUT → DISPLAY FLOW:**
- **Time-based filtering**: System automatically shows current month vs 3-month average
- **Alert generation**: If red clubs > 15%, auto-generates critical alerts
- **Color coding**: Green (healthy), Yellow (warning), Red (critical)

---

## 🏢 **SECTION 2: CLUBS - Health Tracking & Management**

### **FROM DATABASE:**
| Data Point | Source Query | Purpose |
|------------|--------------|---------|
| **Club Health Status** | `4-metric calculation: capacity_util + repeat_rate + rating + revenue` | Health color coding |
| **L1/L2 Classification** | `CASE WHEN events/weeks >= 2 THEN 'L2' WHEN >=1 THEN 'L1'` | Club maturity level |
| **Revenue per Club** | `SUM(p.amount)/100 GROUP BY club` | Individual club performance |
| **Capacity Utilization** | `AVG(attendees/capacity) * 100` | Efficiency metric |
| **Repeat Attendee Rate** | `COUNT(DISTINCT returning_users) / COUNT(DISTINCT total_users)` | Engagement metric |
| **Average Rating** | `AVG(rating) FROM reviews WHERE event.club_id` | Quality metric |
| **Event Frequency** | `COUNT(events) / COUNT(weeks)` | Activity consistency |

### **WEBSITE INPUTS:**
```javascript
// Filter Controls on Clubs page
{
  activity: "Music" | "Running" | "Dance" | "Photography", // Dropdown
  city: "Mumbai" | "Delhi" | "Bangalore" | "Pune",       // Dropdown
  health_status: "green" | "yellow" | "red",             // Button filter
  club_level: "L1" | "L2" | "Inactive",                  // Tab filter
  date_range: "last_7_days" | "last_30_days" | "last_90_days", // Date picker
  sort_by: "health" | "revenue" | "rating" | "capacity"  // Sort dropdown
}
```

### **INPUT → DISPLAY FLOW:**
1. **Activity Filter** → `WHERE club.activity = selected_activity`
2. **City Filter** → `WHERE event.city = selected_city`
3. **Health Filter** → Show only clubs with matching calculated health status
4. **Date Range** → `WHERE event.created_at >= date_range_start`
5. **Sort** → `ORDER BY selected_metric DESC`

**Example**: User selects "Music + Mumbai + Green" → Query filters to healthy music clubs in Mumbai

---

## 📈 **SECTION 3: SCALING PLANNER - Historical Performance**

### **FROM DATABASE:**
| Data Point | Source Query | Purpose |
|------------|--------------|---------|
| **Historical Revenue Growth** | `SUM(p.amount) GROUP BY DATE_TRUNC('month', p.created_at)` | Month-over-month trends |
| **New vs Existing Club Revenue** | `CASE WHEN c.created_at >= month_start THEN 'new' ELSE 'existing'` | Growth attribution |
| **Stage Progression Data** | `JOIN stage_history ON club.id` | Pipeline movement tracking |
| **POC Performance** | `SUM(revenue) GROUP BY poc_id` | Team performance |
| **City-wise Growth** | `SUM(revenue) GROUP BY city, month` | Geographic expansion |
| **Activity Performance** | `SUM(revenue) GROUP BY activity, month` | Vertical analysis |

### **WEBSITE INPUTS:**
```javascript
// Scaling Planner Controls
{
  view_as: "Rahul" | "Saurabh" | "Aditya" | "All",      // POC dropdown
  city_filter: "Mumbai" | "Delhi" | "All",               // City dropdown
  time_period: "Last 3 Months" | "Last 6 Months",       // Time dropdown
  compare_to: "vs Previous 3 Months" | "vs Same Period Last Year", // Compare dropdown
  growth_view: "Revenue" | "Club Count" | "Meetup Count" // Metric toggle
}
```

### **INPUT → DISPLAY FLOW:**
1. **View As (POC)** → Filter by `WHERE poc_id = selected_poc OR activities IN poc_activities`
2. **City Filter** → `WHERE event.city = selected_city`
3. **Time Period** → `WHERE created_at BETWEEN start_date AND end_date`
4. **Compare To** → Run same query for comparison period
5. **Growth View** → Change aggregation from SUM(amount) to COUNT(clubs) etc.

**Example**: "Rahul + Mumbai + Last 3 Months vs Previous" → Shows only Rahul's running/cycling clubs in Mumbai

---

## 🎯 **SECTION 4: POC MANAGEMENT - Team Assignment**

### **FROM DATABASE:**
| Data Point | Source Query | Purpose |
|------------|--------------|---------|
| **POC Club Assignments** | `SELECT * FROM poc_structure JOIN club ON activities/cities` | Current ownership |
| **Revenue per POC** | `SUM(revenue) WHERE poc_id GROUP BY poc` | Performance tracking |
| **Club Count per POC** | `COUNT(clubs) WHERE poc_id GROUP BY poc` | Workload tracking |
| **Team Performance** | `SUM(revenue) GROUP BY team_name` | Phoenix vs Rocket vs Support |
| **Unassigned Clubs** | `WHERE poc_id IS NULL OR poc_inactive` | Allocation gaps |

### **WEBSITE INPUTS:**
```javascript
// POC Management Controls
{
  action_type: "assign" | "reassign" | "bulk_assign",    // Action dropdown
  selected_clubs: [club_ids],                            // Multi-select checkboxes
  target_poc: "Rahul" | "Saurabh" | "Aditya",           // POC dropdown
  assignment_reason: "workload_balance" | "expertise",   // Reason dropdown
  effective_date: Date,                                  // Date picker
  auto_assign_rules: boolean                             // Toggle for auto-assignment
}
```

### **INPUT → DISPLAY FLOW:**
1. **Club Selection** → Store selected club IDs in state
2. **POC Assignment** → `UPDATE club SET poc_id = selected_poc WHERE id IN selected_clubs`
3. **Assignment History** → `INSERT INTO assignment_history (club_id, old_poc, new_poc, reason)`
4. **Auto-assign Rules** → Apply city/activity-based automatic assignments
5. **Workload Calculation** → Recalculate poc_structure.club_count after assignment

---

## 📊 **SECTION 5: WOW TRACKING - Week over Week Changes**

### **FROM DATABASE:**
| Data Point | Source Query | Purpose |
|------------|--------------|---------|
| **Weekly Revenue Changes** | `Compare SUM(revenue) current_week vs previous_week` | Growth tracking |
| **Health Status Changes** | `Compare health_status current_week vs previous_week` | Health monitoring |
| **Stage Progressions** | `WHERE stage_changed_date BETWEEN week_start AND week_end` | Pipeline movement |
| **New Club Launches** | `WHERE club.created_at BETWEEN week_start AND week_end` | Expansion tracking |
| **Meetup Count Changes** | `Compare COUNT(events) current_week vs previous_week` | Activity level |

### **WEBSITE INPUTS:**
```javascript
// WoW Tracking Controls
{
  week_selection: Date,                                  // Week picker
  metrics_view: "revenue" | "health" | "meetups",      // Toggle view
  comparison_type: "wow" | "mom" | "yoy",               // Comparison dropdown
  comment_form: {
    club_id: UUID,                                      // Selected club
    comment: string,                                    // Text area
    action_taken: string,                               // Action dropdown
    blocker: string,                                    // Issue description
    next_steps: string                                  // Action plan
  }
}
```

### **INPUT → DISPLAY FLOW:**
1. **Week Selection** → `WHERE DATE_TRUNC('week', date) = selected_week`
2. **Metrics Toggle** → Switch between revenue, health, meetup count queries
3. **Comment Input** → `INSERT INTO weekly_comments (club_id, comment, created_by, week)`
4. **Action Tracking** → Store actions taken and follow-up needed
5. **Trend Calculation** → `(current_week - previous_week) / previous_week * 100`

---

## 💰 **SECTION 6: REVENUE GROWTH - Timeline Analysis**

### **FROM DATABASE:**
| Data Point | Source Query | Purpose |
|------------|--------------|---------|
| **Monthly Revenue Trends** | `SUM(p.amount) GROUP BY DATE_TRUNC('month'), activity, city` | Growth patterns |
| **Revenue Attribution** | `CASE WHEN new_club THEN 'expansion' ELSE 'growth'` | Source analysis |
| **Seasonal Patterns** | `GROUP BY EXTRACT(month), activity` | Seasonal trends |
| **POC Contribution** | `SUM(revenue) GROUP BY poc_id, month` | Team performance |
| **Growth Rate Calculation** | `(current_month - previous_month) / previous_month` | Percentage growth |

### **WEBSITE INPUTS:**
```javascript
// Revenue Growth Controls
{
  start_date: Date,                                      // Calendar picker
  end_date: Date,                                        // Calendar picker
  comparison_start: Date,                                // Comparison period start
  comparison_end: Date,                                  // Comparison period end
  breakdown_by: "city" | "activity" | "poc" | "team",   // Grouping dropdown
  chart_type: "line" | "bar" | "area",                  // Visualization type
  show_projections: boolean,                             // Toggle predictions
  currency_format: "rupees" | "lakhs" | "crores"        // Display format
}
```

### **INPUT → DISPLAY FLOW:**
1. **Date Range Selection** → `WHERE payment.created_at BETWEEN start_date AND end_date`
2. **Comparison Period** → Run parallel query for comparison period
3. **Breakdown By** → Add `GROUP BY selected_dimension` to query
4. **Chart Type** → Frontend visualization change (same data)
5. **Projections** → Apply trend analysis to predict future growth
6. **Currency Format** → Frontend display formatting (₹42L vs ₹4,200,000)

---

## 🎮 **SECTION 7: GAMIFICATION - Team Competition**

### **FROM DATABASE:**
| Data Point | Source Query | Purpose |
|------------|--------------|---------|
| **Team Points** | `SUM(points) FROM gamification_points GROUP BY team` | Leaderboard |
| **Achievement Badges** | `COUNT(badges) WHERE earned_date GROUP BY team` | Recognition |
| **Stage Progression Points** | `points WHERE event_type = 'stage_progression'` | Pipeline rewards |
| **Revenue Achievement Points** | `points WHERE event_type = 'revenue_target'` | Performance rewards |
| **Health Improvement Points** | `points WHERE event_type = 'health_improvement'` | Quality rewards |

### **WEBSITE INPUTS:**
```javascript
// Gamification Controls - Mostly Display Only
{
  leaderboard_period: "weekly" | "monthly" | "quarterly", // Time filter
  team_filter: "Phoenix" | "Rocket" | "Support" | "All",   // Team filter
  points_breakdown: "total" | "revenue" | "health",        // Category filter
  competition_view: "current" | "historical"               // Time view
}
```

### **INPUT → DISPLAY FLOW:**
1. **Period Selection** → `WHERE created_at BETWEEN period_start AND period_end`
2. **Team Filter** → `WHERE team_name = selected_team`
3. **Points Breakdown** → `WHERE point_category = selected_category`
4. **Competition View** → Toggle between current season and historical data

---

## 📤 **SECTION 8: CSV UPLOAD - Bulk Data Import**

### **FROM WEBSITE INPUT:**
```javascript
// CSV Upload Processing
{
  file_upload: File,                                     // CSV file input
  mapping_config: {
    club_name: "column_1",                              // Column mapping
    activity: "column_2",
    city: "column_3",
    revenue: "column_4"
  },
  validation_rules: {
    required_fields: ["name", "activity", "city"],      // Validation config
    data_types: {"revenue": "number"}
  },
  upload_action: "create" | "update" | "upsert"         // Action type
}
```

### **INPUT → DATABASE FLOW:**
1. **File Parse** → Extract CSV data into JSON array
2. **Validation** → Check required fields, data types, duplicates
3. **Mapping** → Map CSV columns to database fields
4. **Batch Insert** → `INSERT INTO club (name, activity, city...) VALUES batch`
5. **Error Handling** → Log failed rows, partial success handling
6. **Confirmation** → Return success count, error list, preview of changes

---

## 🔄 **REAL-TIME DATA FLOW SUMMARY**

### **Update Frequency:**
| Component | Update Method | Frequency |
|-----------|---------------|-----------|
| Dashboard | Auto-refresh + WebSocket | 30 seconds |
| Revenue Pipeline | Database poll | 5 minutes |
| Health Status | Calculated on-demand | Page load |
| WoW Tracking | Manual refresh | On comment add |
| Gamification | Point calculation job | Daily at midnight |

### **Data Dependencies:**
```
payment → revenue calculations → pipeline status
club + event + booking → health metrics → club status
poc_structure → filtering → personalized views
stage_history → progression tracking → gamification points
```

### **Critical Path:**
1. **Payment data** drives revenue pipeline (₹42L → ₹60L tracking)
2. **Club health** drives task generation and alerts
3. **POC assignments** drive filtered views and permissions
4. **Stage progressions** drive gamification and team competition

---

## ⚡ **KEY INTEGRATION POINTS**

### **Database → Website Display:**
- Real revenue replaces hardcoded ₹42L
- Live health calculation replaces static health data
- Dynamic POC filtering based on actual assignments
- Real-time alerts based on database thresholds

### **Website Input → Database Updates:**
- POC reassignments update club ownership
- Comments and actions logged for accountability
- CSV uploads bulk create/update club data
- Filter selections drive dynamic query generation

### **Feedback Loops:**
- Health issues → Task generation → Action tracking → Health improvement
- Revenue targets → Performance tracking → Team competition → Motivation
- Stage progression → Point allocation → Leaderboard → Recognition
- User actions → Audit trail → Performance review → Process improvement

This mapping ensures every data point has a clear source (database) and purpose (website display/input), with well-defined transformation rules connecting input actions to database updates and display changes.