-- Migration: populate_production_city_ids.sql
-- Date: 2026-01-15
-- Description: Populate production_city_id in dim_cities table
--              Required for matching-clubs endpoint city filtering

-- Map dim_cities to production city IDs
UPDATE dim_cities SET production_city_id = 1 WHERE city_name = 'Gurgaon' AND production_city_id IS NULL;
UPDATE dim_cities SET production_city_id = 2 WHERE city_name = 'South Delhi' AND production_city_id IS NULL;
UPDATE dim_cities SET production_city_id = 3 WHERE city_name = 'Noida' AND production_city_id IS NULL;
UPDATE dim_cities SET production_city_id = 4 WHERE city_name = 'Faridabad' AND production_city_id IS NULL;
UPDATE dim_cities SET production_city_id = 5 WHERE city_name = 'West Delhi' AND production_city_id IS NULL;
UPDATE dim_cities SET production_city_id = 6 WHERE city_name = 'North Delhi' AND production_city_id IS NULL;
UPDATE dim_cities SET production_city_id = 7 WHERE city_name = 'Ghaziabad' AND production_city_id IS NULL;
UPDATE dim_cities SET production_city_id = 8 WHERE city_name = 'East Delhi' AND production_city_id IS NULL;
UPDATE dim_cities SET production_city_id = 11 WHERE city_name = 'Jaipur' AND production_city_id IS NULL;
