-- =============================================================================
-- MISFITS PRODUCTION DATABASE INDEXES
-- =============================================================================
-- Run this script against the production Misfits database to dramatically
-- improve query performance. These indexes support the optimized queries
-- in the misfits-ops dashboard.
--
-- IMPORTANT: Run during low-traffic periods. Index creation locks tables.
-- Estimated time: 5-15 minutes depending on data size.
--
-- Usage:
--   ~/db_connect.sh file scripts/create_production_indexes.sql
--
-- Or via SSH tunnel:
--   PGPASSWORD=postgres psql -h localhost -p 5433 -U dev -d misfits -f scripts/create_production_indexes.sql
-- =============================================================================

-- Begin transaction for safety
BEGIN;

-- =============================================================================
-- EVENT TABLE INDEXES (Most Critical - Used in Health Dashboard)
-- =============================================================================

-- Index for filtering events by club and date (used in health metrics, repeat rate)
-- This is the MOST IMPORTANT index - eliminates sequential scans on event table
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_event_club_created
    ON event(club_id, created_at DESC);

-- Index for filtering events by location (used in city/area lookups)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_event_location
    ON event(location_id);

-- Index for date-based queries (trend analysis, weekly reports)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_event_created_at
    ON event(created_at DESC);

-- Index for start_time ordering (used in scaling planner)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_event_club_start_time
    ON event(club_id, start_time DESC);

-- =============================================================================
-- BOOKING TABLE INDEXES (Critical - Used in Capacity/Revenue Calculations)
-- =============================================================================

-- Index for joining bookings to events and filtering by status
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_booking_event_status
    ON booking(event_id, booking_status);

-- Index for payment status filtering (revenue calculations)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_booking_event_payment_status
    ON booking(event_id, booking_payment_status);

-- Index for repeat user calculations (unique users per club)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_booking_user_status
    ON booking(user_id, booking_status);

-- =============================================================================
-- CLUB TABLE INDEXES (Important - Filtered in Almost Every Query)
-- =============================================================================

-- Index for filtering active, non-private clubs
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_club_status_private
    ON club(status, is_private);

-- Index for activity-based queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_club_activity
    ON club(activity_id, status);

-- Index for club lookups by id
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_club_id
    ON club(id);

-- =============================================================================
-- LOCATION/AREA/CITY INDEXES (Important - Used in City/Area Lookups)
-- =============================================================================

-- Index for location to area join
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_location_area
    ON location(area_id);

-- Index for area to city join
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_area_city
    ON area(city_id);

-- Index for active cities
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_city_active
    ON city(is_active);

-- =============================================================================
-- PAYMENT/TRANSACTION INDEXES (Important - Revenue Queries)
-- =============================================================================

-- Index for payment state and date filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_state_created
    ON payment(state, created_at DESC);

-- Index for transaction to payment join
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transaction_payment
    ON transaction(payment_id);

-- Index for transaction entity lookups (booking joins)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transaction_entity
    ON transaction(entity_id, entity_type);

-- =============================================================================
-- ACTIVITY TABLE INDEXES
-- =============================================================================

-- Index for activity name filtering (excluding Test)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activity_name
    ON activity(name);

-- =============================================================================
-- USER TABLE INDEXES (For Repeat Rate Calculations)
-- =============================================================================

-- Index for user status filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_status
    ON users(status);

-- =============================================================================
-- ANALYZE TABLES (Update Statistics for Query Planner)
-- =============================================================================

ANALYZE event;
ANALYZE booking;
ANALYZE club;
ANALYZE location;
ANALYZE area;
ANALYZE city;
ANALYZE payment;
ANALYZE transaction;
ANALYZE activity;
ANALYZE users;

COMMIT;

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================
-- Run these to verify indexes were created successfully:

-- List all indexes on key tables
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename IN ('event', 'booking', 'club', 'location', 'area', 'city', 'payment', 'transaction')
ORDER BY tablename, indexname;

-- Check index usage statistics (run after some queries have executed)
-- SELECT
--     schemaname,
--     relname as table_name,
--     indexrelname as index_name,
--     idx_scan as index_scans,
--     idx_tup_read as tuples_read,
--     idx_tup_fetch as tuples_fetched
-- FROM pg_stat_user_indexes
-- WHERE schemaname = 'public'
-- ORDER BY idx_scan DESC;
