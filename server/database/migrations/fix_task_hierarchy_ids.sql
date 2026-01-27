-- Migration: Fix scaling_tasks with wrong/missing hierarchy IDs
-- Date: 2026-01-27
-- Description: Fixes tasks where activity_id doesn't match activity_name
--              and removes invalid "All Data" task

-- Fix Badminton tasks with wrong activity_id (ID 1 = Board Gaming, should be 31 = Badminton)
-- Affected tasks: 1, 3, 23, 24
UPDATE scaling_tasks
SET activity_id = 31
WHERE LOWER(activity_name) = 'badminton'
  AND (activity_id IS NULL OR activity_id != 31);

-- Delete the "All Data" task (task 25) - "All Data" is not a real activity
-- It's a UI rollup label, not something tasks should be created under
DELETE FROM scaling_tasks WHERE id = 25;

-- Verify the fix
SELECT id, activity_name, activity_id, city_name, city_id, title
FROM scaling_tasks
WHERE LOWER(activity_name) IN ('badminton', 'all data', 'filtered data')
   OR activity_id IS NULL
ORDER BY id;
