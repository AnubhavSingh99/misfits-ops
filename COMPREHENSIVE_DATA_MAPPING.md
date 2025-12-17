# Comprehensive Data Flow Mapping - Misfits Operations Platform

## Current Data Issues Identified

### 🚨 Critical Issues
1. **Activity dropdown showing hardcoded data** instead of database activities
2. **Revenue calculation showing 42 lacs incorrectly** (should be actual database values)
3. **Scaling Planner using mock data** instead of real club data
4. **SSH tunnel connection instability** causing database disconnections
5. **Data type mismatches** between expected and actual database schema

## Database Schema Mapping

### Real Database Tables (Misfits Production)
```sql
-- Core Tables
club: id, name, activity_id, city, area, status, created_at
activity: id, name, description
event: id, club_id, capacity, rating, created_at
booking: id, event_id, user_id, status
payment: id, booking_id, amount (in paisa), status, created_at
```

### Current API Endpoints & Issues

#### ✅ Working Endpoints
- `GET /api/health/clubs` - Health calculations with real data
- `GET /api/clubs/activities` - Activities from database (fixed schema)

#### 🚨 Broken/Incorrect Endpoints
- `GET /api/database/new-clubs` - Not implemented, using mock data
- `GET /api/database/scaling-targets` - Not implemented
- `POST /api/database/scaling-targets` - Not implemented

## Frontend Data Flow Issues

### ScalingPlanner.tsx Issues
```typescript
// ISSUE 1: Hardcoded Activities (FIXED)
// OLD: Static array ['Running', 'Photography', 'Tech', 'Music', 'Dance']
// NEW: Fetches from /api/clubs/activities

// ISSUE 2: Mock Club Data (NEEDS FIX)
const [clubs, setClubs] = useState<Club[]>([
  // This contains hardcoded mock clubs instead of real data
])

// ISSUE 3: Revenue Calculation Issue
// Mock data shows incorrect revenue totals (42 lacs)
// Should fetch real revenue from database
```

## Data Connection Requirements

### Input Sources (Frontend)
1. **Filter Dropdowns**
   - POC: Should come from real club POC assignments
   - City: From `club.city` (real data)
   - Activity: From `activity.name` via `club.activity_id` JOIN
   - Area: From `club.area` (real data)
   - Status: From club status logic (new/monitoring/scaling/achieved)

2. **Club Data Display**
   - Name: `club.name`
   - Current Meetups: COUNT of events per club
   - Target Meetups: User-defined targets (database table needed)
   - Current Revenue: SUM of completed payments
   - Capacity Utilization: AVG(bookings/event capacity) per club

3. **Revenue Calculations**
   - Current Revenue: `SUM(payment.amount)/100` WHERE `status='COMPLETED'`
   - Target Revenue: User-defined (needs database table)

### Database Output (What to show on website)
```sql
-- Real Club Data Query
SELECT
  c.id,
  c.name,
  a.name as activity,
  c.city,
  c.area,
  COUNT(DISTINCT e.id) as current_meetups,
  COALESCE(SUM(p.amount)/100, 0) as current_revenue,
  -- Calculate capacity utilization
  AVG(
    CASE
      WHEN e.capacity > 0
      THEN (COUNT(DISTINCT b.id) * 100.0 / e.capacity)
      ELSE 0
    END
  ) as capacity_utilization
FROM club c
LEFT JOIN activity a ON c.activity_id = a.id
LEFT JOIN event e ON c.id = e.club_id
LEFT JOIN booking b ON e.id = b.event_id AND b.status = 'CONFIRMED'
LEFT JOIN payment p ON b.id = p.booking_id AND p.status = 'COMPLETED'
WHERE c.status = 'ACTIVE'
GROUP BY c.id, c.name, a.name, c.city, c.area
```

## Required API Endpoints (Missing)

### 1. Real Clubs for Scaling
```typescript
GET /api/scaling/clubs
// Should return real clubs with calculated metrics
Response: {
  success: boolean,
  clubs: [{
    id: number,
    name: string,
    activity: string,
    city: string,
    area: string,
    current_meetups: number,
    current_revenue: number, // in rupees
    capacity_utilization: number, // percentage
    health_status: 'healthy' | 'at_risk' | 'critical'
  }]
}
```

### 2. Scaling Targets Management
```typescript
GET /api/scaling/targets
POST /api/scaling/targets
// Store and retrieve user-defined targets per club
```

### 3. POC Management
```typescript
GET /api/clubs/pocs
// Get list of POCs assigned to clubs
```

## Data Flow Fixes Required

### 1. ScalingPlanner Real Data Integration
```typescript
// Replace mock data with:
const fetchRealClubs = async () => {
  const response = await fetch('/api/scaling/clubs');
  const data = await response.json();
  if (data.success) {
    setClubs(data.clubs.map(club => ({
      ...club,
      // Add scaling-specific fields
      targetMeetups: club.current_meetups + 2, // default
      targetRevenue: club.current_revenue + 5000, // default
      scalingType: determineScalingType(club),
      status: 'new',
      wowComment: '',
      isNewFromDB: true
    })));
  }
};
```

### 2. Revenue Calculation Fix
The 42 lacs issue is likely due to:
- Using mock data instead of real database values
- Incorrect paisa to rupees conversion
- Including test/dummy data in calculations

### 3. Health Dashboard Integration
Connect ScalingPlanner to use same data source as HealthDashboard for consistency.

## Implementation Priority

### Phase 1: Critical Fixes (Now)
1. ✅ Fix activity dropdown to use real data
2. 🔄 Create `/api/scaling/clubs` endpoint
3. 🔄 Replace ScalingPlanner mock data with real data
4. 🔄 Fix revenue calculations

### Phase 2: Complete Integration
1. Implement scaling targets database table
2. Add POC management
3. Create comprehensive club management API
4. Add real-time data sync

## Database Connection Stability
- SSH tunnel needs connection pooling improvement
- Add reconnection logic for database failures
- Implement fallback mechanisms for offline functionality

## Summary of Required Changes

1. **Backend**: Create new API endpoints for scaling operations
2. **Frontend**: Replace all mock data with database calls
3. **Database**: Add tables for scaling targets and POC assignments
4. **Infrastructure**: Improve SSH tunnel stability
5. **Data Validation**: Ensure all calculations use real database values

This mapping ensures all data points flow from database → API → frontend correctly.