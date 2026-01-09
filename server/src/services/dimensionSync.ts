import { logger } from '../utils/logger';
import { queryLocal, queryProduction } from './database';

/**
 * Dimension Sync Service
 * Syncs areas and cities from production database to local dimension tables
 */

export interface SyncResult {
  success: boolean;
  cities_synced: number;
  areas_synced: number;
  errors: string[];
}

/**
 * Sync cities from production to local dim_cities table
 */
async function syncCities(): Promise<number> {
  const cities = await queryProduction(`
    SELECT id, name, state
    FROM city
    WHERE is_active = true
    ORDER BY name
  `);

  let syncedCount = 0;

  for (const city of cities.rows) {
    try {
      await queryLocal(`
        INSERT INTO dim_cities (production_city_id, city_name, state, is_active)
        VALUES ($1, $2, $3, TRUE)
        ON CONFLICT (city_name) DO UPDATE SET
          production_city_id = EXCLUDED.production_city_id,
          state = EXCLUDED.state,
          is_active = TRUE,
          updated_at = CURRENT_TIMESTAMP
      `, [city.id, city.name, city.state]);
      syncedCount++;
    } catch (err: any) {
      logger.warn(`Failed to sync city ${city.name}:`, err.message);
    }
  }

  return syncedCount;
}

/**
 * Sync areas from production to local dim_areas table
 */
async function syncAreas(): Promise<number> {
  const areas = await queryProduction(`
    SELECT a.id, a.name, c.name as city_name
    FROM area a
    JOIN city c ON a.city_id = c.id
    WHERE c.is_active = true
    ORDER BY c.name, a.name
  `);

  let syncedCount = 0;

  for (const area of areas.rows) {
    try {
      // Get the local city_id
      const cityResult = await queryLocal(`
        SELECT id FROM dim_cities WHERE city_name = $1
      `, [area.city_name]);

      if (cityResult.rows[0]) {
        await queryLocal(`
          INSERT INTO dim_areas (production_area_id, area_name, city_id, is_custom, is_active)
          VALUES ($1, $2, $3, FALSE, TRUE)
          ON CONFLICT (area_name, city_id) DO UPDATE SET
            production_area_id = EXCLUDED.production_area_id,
            is_active = TRUE,
            updated_at = CURRENT_TIMESTAMP
        `, [area.id, area.name, cityResult.rows[0].id]);
        syncedCount++;
      }
    } catch (err: any) {
      logger.warn(`Failed to sync area ${area.name}:`, err.message);
    }
  }

  return syncedCount;
}

/**
 * Main sync function - syncs all dimensions from production
 */
export async function syncDimensionsFromProduction(): Promise<SyncResult> {
  const errors: string[] = [];
  let citiesSynced = 0;
  let areasSynced = 0;

  try {
    logger.info('Starting dimension sync from production...');

    // Sync cities first (areas depend on cities)
    try {
      citiesSynced = await syncCities();
      logger.info(`Synced ${citiesSynced} cities`);
    } catch (err: any) {
      errors.push(`Cities sync failed: ${err.message}`);
      logger.error('Failed to sync cities:', err);
    }

    // Sync areas
    try {
      areasSynced = await syncAreas();
      logger.info(`Synced ${areasSynced} areas`);
    } catch (err: any) {
      errors.push(`Areas sync failed: ${err.message}`);
      logger.error('Failed to sync areas:', err);
    }

    logger.info(`Dimension sync completed: ${citiesSynced} cities, ${areasSynced} areas`);

    return {
      success: errors.length === 0,
      cities_synced: citiesSynced,
      areas_synced: areasSynced,
      errors
    };
  } catch (error: any) {
    logger.error('Dimension sync failed:', error);
    return {
      success: false,
      cities_synced: citiesSynced,
      areas_synced: areasSynced,
      errors: [error.message]
    };
  }
}

/**
 * Get all dimension values for dropdowns
 */
export async function getAllDimensions() {
  const [cities, areas, dayTypes, formats] = await Promise.all([
    queryLocal(`
      SELECT id, city_name as name, state, production_city_id, is_active
      FROM dim_cities
      WHERE is_active = TRUE
      ORDER BY city_name
    `),
    queryLocal(`
      SELECT da.id, da.area_name as name, da.city_id, dc.city_name,
             da.production_area_id, da.is_custom, da.is_active
      FROM dim_areas da
      LEFT JOIN dim_cities dc ON da.city_id = dc.id
      WHERE da.is_active = TRUE
      ORDER BY dc.city_name, da.area_name
    `),
    queryLocal(`
      SELECT id, day_type as name, display_order, is_custom, is_active
      FROM dim_day_types
      WHERE is_active = TRUE
      ORDER BY display_order, day_type
    `),
    queryLocal(`
      SELECT id, format_name as name, display_order, is_custom, is_active
      FROM dim_formats
      WHERE is_active = TRUE
      ORDER BY display_order, format_name
    `)
  ]);

  return {
    city: {
      values: cities.rows,
      allowCustom: false // Cities must come from production
    },
    area: {
      values: areas.rows,
      allowCustom: true
    },
    day_type: {
      values: dayTypes.rows,
      allowCustom: true
    },
    format: {
      values: formats.rows,
      allowCustom: true
    }
  };
}

/**
 * Get areas for a specific city
 */
export async function getAreasByCity(cityId: number) {
  const result = await queryLocal(`
    SELECT id, area_name as name, is_custom
    FROM dim_areas
    WHERE city_id = $1 AND is_active = TRUE
    ORDER BY area_name
  `, [cityId]);

  return result.rows;
}

/**
 * Add a custom dimension value
 */
export async function addCustomDimensionValue(
  dimensionType: 'area' | 'day_type' | 'format',
  value: string,
  cityId?: number
): Promise<{ id: number; name: string }> {
  switch (dimensionType) {
    case 'area':
      if (!cityId) {
        throw new Error('city_id is required for custom areas');
      }
      const areaResult = await queryLocal(`
        INSERT INTO dim_areas (area_name, city_id, is_custom, is_active)
        VALUES ($1, $2, TRUE, TRUE)
        ON CONFLICT (area_name, city_id) DO UPDATE SET is_active = TRUE
        RETURNING id, area_name as name
      `, [value, cityId]);
      return areaResult.rows[0];

    case 'day_type':
      const dayResult = await queryLocal(`
        INSERT INTO dim_day_types (day_type, is_custom, is_active, display_order)
        VALUES ($1, TRUE, TRUE, 100)
        ON CONFLICT (day_type) DO UPDATE SET is_active = TRUE
        RETURNING id, day_type as name
      `, [value]);
      return dayResult.rows[0];

    case 'format':
      const formatResult = await queryLocal(`
        INSERT INTO dim_formats (format_name, is_custom, is_active, display_order)
        VALUES ($1, TRUE, TRUE, 100)
        ON CONFLICT (format_name) DO UPDATE SET is_active = TRUE
        RETURNING id, format_name as name
      `, [value]);
      return formatResult.rows[0];

    default:
      throw new Error(`Unknown dimension type: ${dimensionType}`);
  }
}

/**
 * Initialize dimensions on server startup
 * This ensures dimension tables are populated before first use
 */
export async function initializeDimensions(): Promise<void> {
  try {
    // Check if we have any cities synced
    const cityCount = await queryLocal(`
      SELECT COUNT(*) as count FROM dim_cities
    `);

    if (parseInt(cityCount.rows[0].count) === 0) {
      logger.info('No cities found in dimension tables, running initial sync...');
      await syncDimensionsFromProduction();
    } else {
      logger.info(`Dimension tables already populated (${cityCount.rows[0].count} cities)`);
    }
  } catch (error) {
    logger.error('Failed to initialize dimensions:', error);
    // Don't throw - allow server to start even if sync fails
  }
}
