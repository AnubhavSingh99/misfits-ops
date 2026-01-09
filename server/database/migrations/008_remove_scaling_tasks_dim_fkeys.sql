-- Migration: Remove FK constraints from scaling_tasks to local dimension tables
-- Date: 2026-01-07
-- Description: scaling_tasks stores area_id/city_id from PRODUCTION database,
--              but FK constraints were checking LOCAL dim_areas/dim_cities tables.
--              Since we validate against production data anyway, remove these FKs.

ALTER TABLE scaling_tasks DROP CONSTRAINT IF EXISTS scaling_tasks_area_id_fkey;
ALTER TABLE scaling_tasks DROP CONSTRAINT IF EXISTS scaling_tasks_city_id_fkey;
