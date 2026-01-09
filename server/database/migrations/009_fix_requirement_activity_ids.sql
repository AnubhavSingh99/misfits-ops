-- Migration: Fix corrupted activity_id values in requirements tables
-- Date: 2026-01-07
-- Description: activity_id values were incorrectly stored during creation.
--              This fixes them by matching activity_name to correct production IDs.

-- Activity ID mapping (from production misfits.activity table):
-- 21 = Art
-- 31 = Badminton
-- 1 = Board Gaming
-- 30 = Box Cricket
-- 3 = Reading
-- 32 = Basketball
-- 10 = Dance
-- 11 = Music
-- etc.

-- Fix leader_requirements
UPDATE leader_requirements SET activity_id = 21 WHERE activity_name = 'Art' AND (activity_id IS NULL OR activity_id != 21);
UPDATE leader_requirements SET activity_id = 31 WHERE activity_name = 'Badminton' AND (activity_id IS NULL OR activity_id != 31);
UPDATE leader_requirements SET activity_id = 1 WHERE activity_name = 'Board Gaming' AND (activity_id IS NULL OR activity_id != 1);
UPDATE leader_requirements SET activity_id = 30 WHERE activity_name = 'Box Cricket' AND (activity_id IS NULL OR activity_id != 30);
UPDATE leader_requirements SET activity_id = 3 WHERE activity_name = 'Reading' AND (activity_id IS NULL OR activity_id != 3);
UPDATE leader_requirements SET activity_id = 32 WHERE activity_name = 'Basketball' AND (activity_id IS NULL OR activity_id != 32);
UPDATE leader_requirements SET activity_id = 10 WHERE activity_name = 'Dance' AND (activity_id IS NULL OR activity_id != 10);
UPDATE leader_requirements SET activity_id = 11 WHERE activity_name = 'Music' AND (activity_id IS NULL OR activity_id != 11);
UPDATE leader_requirements SET activity_id = 33 WHERE activity_name = 'Pickleball' AND (activity_id IS NULL OR activity_id != 33);
UPDATE leader_requirements SET activity_id = 28 WHERE activity_name = 'Football' AND (activity_id IS NULL OR activity_id != 28);
UPDATE leader_requirements SET activity_id = 17 WHERE activity_name = 'Yoga' AND (activity_id IS NULL OR activity_id != 17);

-- Fix venue_requirements
UPDATE venue_requirements SET activity_id = 21 WHERE activity_name = 'Art' AND (activity_id IS NULL OR activity_id != 21);
UPDATE venue_requirements SET activity_id = 31 WHERE activity_name = 'Badminton' AND (activity_id IS NULL OR activity_id != 31);
UPDATE venue_requirements SET activity_id = 1 WHERE activity_name = 'Board Gaming' AND (activity_id IS NULL OR activity_id != 1);
UPDATE venue_requirements SET activity_id = 30 WHERE activity_name = 'Box Cricket' AND (activity_id IS NULL OR activity_id != 30);
UPDATE venue_requirements SET activity_id = 3 WHERE activity_name = 'Reading' AND (activity_id IS NULL OR activity_id != 3);
UPDATE venue_requirements SET activity_id = 32 WHERE activity_name = 'Basketball' AND (activity_id IS NULL OR activity_id != 32);
UPDATE venue_requirements SET activity_id = 10 WHERE activity_name = 'Dance' AND (activity_id IS NULL OR activity_id != 10);
UPDATE venue_requirements SET activity_id = 11 WHERE activity_name = 'Music' AND (activity_id IS NULL OR activity_id != 11);
UPDATE venue_requirements SET activity_id = 33 WHERE activity_name = 'Pickleball' AND (activity_id IS NULL OR activity_id != 33);
UPDATE venue_requirements SET activity_id = 28 WHERE activity_name = 'Football' AND (activity_id IS NULL OR activity_id != 28);
UPDATE venue_requirements SET activity_id = 17 WHERE activity_name = 'Yoga' AND (activity_id IS NULL OR activity_id != 17);
