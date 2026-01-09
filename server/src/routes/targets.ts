import { Router } from 'express';
import { logger } from '../utils/logger';
import { queryLocal, queryProduction } from '../services/database';
import {
  syncDimensionsFromProduction,
  getAllDimensions,
  getAreasByCity,
  addCustomDimensionValue
} from '../services/dimensionSync';
import { getTeamForClub, TeamKey } from '../../../shared/teamConfig';
import { getMeetupDefaults, calculateTargetRevenue } from '../../../shared/meetupDefaults';
import {
  calculateClubRevenueStatus,
  rollupRevenueStatuses,
  getRevenueStatusDisplay,
  createEmptyRevenueStatus,
  type RevenueStatus
} from '../services/revenueStatusService';
import {
  matchClubMeetups,
  type ClubMatchResult,
} from '../services/meetupMatchingService';

const router = Router();

// =====================================================
// HELPER FUNCTIONS
// =====================================================

// Get current metrics for all activities from production (event-based)
async function getCurrentMetrics() {
  const currentMetricsQuery = `
    SELECT
      a.name as activity_name,
      a.id as activity_id,
      COUNT(DISTINCT CASE
        WHEN e.start_time >= CURRENT_DATE - INTERVAL '7 days'
        AND e.start_time < CURRENT_DATE
        AND e.state = 'CREATED'
        THEN e.pk
        ELSE NULL
      END) as current_meetups_week,
      COUNT(DISTINCT CASE
        WHEN e.start_time >= DATE_TRUNC('month', CURRENT_DATE)
        AND e.start_time < CURRENT_TIMESTAMP
        AND e.state = 'CREATED'
        THEN e.pk
        ELSE NULL
      END) as current_meetups_month,
      COUNT(DISTINCT e.pk) as total_events,
      COUNT(DISTINCT CASE
        WHEN c.status = 'ACTIVE'
        THEN c.pk
        ELSE NULL
      END) as active_clubs_count,
      COALESCE(SUM(
        CASE
          WHEN p.state = 'COMPLETED'
          AND e.start_time >= DATE_TRUNC('month', CURRENT_DATE)
          AND e.start_time < CURRENT_TIMESTAMP
          AND e.state = 'CREATED'
          THEN p.amount / 100.0
          ELSE 0
        END
      ), 0) as current_revenue_rupees
    FROM activity a
    LEFT JOIN club c ON a.id = c.activity_id AND c.is_private = false
    LEFT JOIN event e ON c.pk = e.club_id
    LEFT JOIN booking b ON b.event_id = e.pk
    LEFT JOIN transaction t ON t.entity_id = b.id AND t.entity_type = 'BOOKING'
    LEFT JOIN payment p ON p.pk = t.payment_id
    WHERE a.name IS NOT NULL
      AND a.name != 'Test'
      AND a.name != ''
    GROUP BY a.id, a.name
    HAVING COUNT(DISTINCT c.pk) > 0
    ORDER BY active_clubs_count DESC, a.name
  `;

  try {
    const result = await queryProduction(currentMetricsQuery);
    return result.rows;
  } catch (error) {
    logger.error('Failed to fetch current metrics from production:', error);
    return [];
  }
}

// =====================================================
// DIMENSION MANAGEMENT ENDPOINTS
// =====================================================

// GET /api/targets/dimensions - Get all dimension types with values
router.get('/dimensions', async (req, res) => {
  try {
    const dimensions = await getAllDimensions();

    res.json({
      success: true,
      dimensions
    });
  } catch (error) {
    logger.error('Failed to fetch dimensions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dimensions',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/targets/dimensions/:type - Get values for specific dimension
router.get('/dimensions/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const { city_id } = req.query;

    let values: any[] = [];

    switch (type) {
      case 'area':
        if (city_id) {
          // Check if city_id is a production ID (lookup by production_city_id first)
          const cityLookup = await queryLocal(
            `SELECT id FROM dim_cities WHERE production_city_id = $1`,
            [parseInt(city_id as string)]
          );
          const dimCityId = cityLookup.rows[0]?.id || parseInt(city_id as string);

          const areaResult = await queryLocal(`
            SELECT id, area_name as name, city_id, production_area_id, is_custom
            FROM dim_areas
            WHERE city_id = $1 AND is_active = TRUE
            ORDER BY area_name
          `, [dimCityId]);
          values = areaResult.rows;
        } else {
          const result = await queryLocal(`
            SELECT da.id, da.area_name as name, da.city_id, dc.city_name, da.production_area_id, da.is_custom
            FROM dim_areas da
            LEFT JOIN dim_cities dc ON da.city_id = dc.id
            WHERE da.is_active = TRUE
            ORDER BY dc.city_name, da.area_name
          `);
          values = result.rows;
        }
        break;

      case 'city':
        const cityResult = await queryLocal(`
          SELECT id, city_name as name, state, production_city_id
          FROM dim_cities
          WHERE is_active = TRUE
          ORDER BY city_name
        `);
        values = cityResult.rows;
        break;

      case 'day_type':
        const dayResult = await queryLocal(`
          SELECT id, day_type as name, is_custom
          FROM dim_day_types
          WHERE is_active = TRUE
          ORDER BY display_order, day_type
        `);
        values = dayResult.rows;
        break;

      case 'format':
        const formatResult = await queryLocal(`
          SELECT id, format_name as name, is_custom
          FROM dim_formats
          WHERE is_active = TRUE
          ORDER BY display_order, format_name
        `);
        values = formatResult.rows;
        break;

      default:
        return res.status(400).json({
          success: false,
          error: `Unknown dimension type: ${type}`
        });
    }

    res.json({
      success: true,
      dimension_type: type,
      values,
      allowCustom: type !== 'city'
    });
  } catch (error) {
    logger.error(`Failed to fetch dimension values for ${req.params.type}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dimension values',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/targets/dimensions/:type - Add custom dimension value
router.post('/dimensions/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const { value, city_id } = req.body;

    if (!value || typeof value !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'value is required'
      });
    }

    if (type === 'area' && !city_id) {
      return res.status(400).json({
        success: false,
        error: 'city_id is required for custom areas'
      });
    }

    const result = await addCustomDimensionValue(
      type as 'area' | 'day_type' | 'format',
      value.trim(),
      city_id
    );

    res.json({
      success: true,
      dimension: result,
      message: `Custom ${type} added successfully`
    });
  } catch (error) {
    logger.error(`Failed to add custom dimension value:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to add custom dimension value',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/targets/dimensions/sync - Sync dimensions from production
router.post('/dimensions/sync', async (req, res) => {
  try {
    logger.info('Manual dimension sync triggered');
    const result = await syncDimensionsFromProduction();

    res.json({
      success: result.success,
      ...result
    });
  } catch (error) {
    logger.error('Failed to sync dimensions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to sync dimensions',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// =====================================================
// MEETUP DEFAULTS ENDPOINT
// =====================================================

// GET /api/targets/meetup-defaults - Get default meetup cost and capacity
// Uses hardcoded data with fallback: exact match -> city avg -> activity avg
router.get('/meetup-defaults', async (req, res) => {
  try {
    const { activity, city, area } = req.query;

    if (!activity || !city) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: activity and city'
      });
    }

    const defaults = getMeetupDefaults(
      activity as string,
      city as string,
      area as string | undefined
    );

    res.json({
      success: true,
      ...defaults
    });
  } catch (error) {
    logger.error('Failed to get meetup defaults:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get meetup defaults',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// =====================================================
// CLUB DIMENSIONAL TARGET ENDPOINTS
// =====================================================

// GET /api/targets/clubs/:clubId/dimensional - Get dimensional targets for a club
router.get('/clubs/:clubId/dimensional', async (req, res) => {
  try {
    const clubId = parseInt(req.params.clubId);

    // Get club info from production
    const clubInfo = await queryProduction(`
      SELECT c.pk as club_id, c.name as club_name, a.name as activity_name, a.id as activity_id
      FROM club c
      JOIN activity a ON c.activity_id = a.id
      WHERE c.pk = $1
    `, [clubId]);

    if (clubInfo.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Club not found'
      });
    }

    const club = clubInfo.rows[0];

    // Get dimensional targets using the view
    const targetsResult = await queryLocal(`
      SELECT * FROM v_club_dimensional_targets
      WHERE club_id = $1
      ORDER BY area_name, day_type, format_name
    `, [clubId]);

    // Calculate totals
    const totalMeetups = targetsResult.rows.reduce((sum, t) => sum + t.target_meetups, 0);
    const totalRevenue = targetsResult.rows.reduce((sum, t) => sum + t.target_revenue, 0);

    res.json({
      success: true,
      club_id: clubId,
      club_name: club.club_name,
      activity_name: club.activity_name,
      activity_id: club.activity_id,
      dimensional_targets: targetsResult.rows,
      totals: {
        total_target_meetups: totalMeetups,
        total_target_revenue: totalRevenue
      }
    });
  } catch (error) {
    logger.error(`Failed to fetch dimensional targets for club ${req.params.clubId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dimensional targets',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/targets/clubs/:clubId/dimensional - Create dimensional target
router.post('/clubs/:clubId/dimensional', async (req, res) => {
  try {
    const clubId = parseInt(req.params.clubId);
    const {
      area_id,
      day_type_id,
      format_id,
      target_meetups,
      target_revenue,
      activity_id,
      club_name,
      meetup_cost,
      meetup_capacity,
      name  // Optional custom target name
    } = req.body;

    // Auto-calculate target_revenue if meetup_cost and meetup_capacity are provided
    let finalTargetRevenue = target_revenue || 0;
    if (meetup_cost !== undefined && meetup_capacity !== undefined && target_meetups) {
      finalTargetRevenue = calculateTargetRevenue(target_meetups, meetup_cost, meetup_capacity);
    }

    // Validation: area_id is required (Day Type and Format are optional)
    if (!area_id) {
      return res.status(400).json({
        success: false,
        error: 'Area is required. Please select a city and area for this target.',
        field: 'area_id'
      });
    }

    // Resolve area_id: The frontend passes production_area_id, but we need dim_areas.id
    // First check if this area already exists in dim_areas by production_area_id
    let resolvedAreaId = area_id;
    const areaByProdId = await queryLocal(
      `SELECT id FROM dim_areas WHERE production_area_id = $1`,
      [area_id]
    );

    if (areaByProdId.rows.length > 0) {
      // Area exists - use its dim_areas.id
      resolvedAreaId = areaByProdId.rows[0].id;
    } else {
      // Area doesn't exist - fetch from production and create it
      const prodAreaResult = await queryProduction(`
        SELECT ar.id, ar.name as area_name, ci.id as city_id, ci.name as city_name
        FROM area ar
        JOIN city ci ON ar.city_id = ci.id
        WHERE ar.id = $1
      `, [area_id]);

      if (prodAreaResult.rows.length > 0) {
        const prodArea = prodAreaResult.rows[0];

        // Ensure city exists first (by production_city_id)
        const cityByProdId = await queryLocal(
          `SELECT id FROM dim_cities WHERE production_city_id = $1`,
          [prodArea.city_id]
        );

        let dimCityId: number;
        if (cityByProdId.rows.length > 0) {
          dimCityId = cityByProdId.rows[0].id;
        } else {
          // Create city
          const newCity = await queryLocal(
            `INSERT INTO dim_cities (city_name, production_city_id) VALUES ($1, $2)
             ON CONFLICT (city_name) DO UPDATE SET production_city_id = $2
             RETURNING id`,
            [prodArea.city_name, prodArea.city_id]
          );
          dimCityId = newCity.rows[0].id;
        }

        // Create area with production_area_id reference
        const newArea = await queryLocal(
          `INSERT INTO dim_areas (area_name, city_id, production_area_id, is_custom, is_active)
           VALUES ($1, $2, $3, FALSE, TRUE)
           ON CONFLICT (area_name, city_id) DO UPDATE SET production_area_id = $3
           RETURNING id`,
          [prodArea.area_name, dimCityId, area_id]
        );
        resolvedAreaId = newArea.rows[0].id;
      }
    }

    // Use resolvedAreaId from here on
    const area_id_for_target = resolvedAreaId;

    // Check for existing target first - uniqueness based on dimensions + cost + capacity
    const existingCheck = await queryLocal(`
      SELECT id FROM club_dimensional_targets
      WHERE club_id = $1
        AND COALESCE(area_id, -1) = COALESCE($2, -1)
        AND COALESCE(day_type_id, -1) = COALESCE($3, -1)
        AND COALESCE(format_id, -1) = COALESCE($4, -1)
        AND COALESCE(meetup_cost, -1) = COALESCE($5, -1)
        AND COALESCE(meetup_capacity, -1) = COALESCE($6, -1)
    `, [clubId, area_id_for_target || null, day_type_id || null, format_id || null, meetup_cost || null, meetup_capacity || null]);

    let result;
    if (existingCheck.rows.length > 0) {
      // Update existing
      result = await queryLocal(`
        UPDATE club_dimensional_targets SET
          target_meetups = $1,
          target_revenue = $2,
          activity_id = COALESCE($3, activity_id),
          club_name = COALESCE($4, club_name),
          meetup_cost = COALESCE($6, meetup_cost),
          meetup_capacity = COALESCE($7, meetup_capacity),
          name = COALESCE($8, name),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $5
        RETURNING *
      `, [target_meetups || 0, finalTargetRevenue, activity_id, club_name, existingCheck.rows[0].id, meetup_cost, meetup_capacity, name || null]);
    } else {
      // Insert new with initial progress (all target_meetups in "not_picked" stage)
      const initialProgress = {
        not_picked: target_meetups || 0,
        started: 0,
        stage_1: 0,
        stage_2: 0,
        stage_3: 0,
        stage_4: 0,
        realised: 0
      };

      result = await queryLocal(`
        INSERT INTO club_dimensional_targets (
          club_id, activity_id, club_name,
          area_id, day_type_id, format_id,
          target_meetups, target_revenue, progress,
          meetup_cost, meetup_capacity, name
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `, [
        clubId,
        activity_id || null,
        club_name || null,
        area_id_for_target || null,  // Use resolved dim_areas.id, not production area_id
        day_type_id || null,
        format_id || null,
        target_meetups || 0,
        finalTargetRevenue,
        JSON.stringify(initialProgress),
        meetup_cost || null,
        meetup_capacity || null,
        name || null
      ]);
    }

    // Fetch the full target with dimension names
    const fullTarget = await queryLocal(`
      SELECT * FROM v_club_dimensional_targets WHERE id = $1
    `, [result.rows[0].id]);

    res.json({
      success: true,
      target: fullTarget.rows[0],
      message: 'Dimensional target created/updated successfully'
    });
  } catch (error) {
    logger.error(`Failed to create dimensional target for club ${req.params.clubId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to create dimensional target',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// PUT /api/targets/clubs/:clubId/dimensional/:targetId - Update dimensional target
router.put('/clubs/:clubId/dimensional/:targetId', async (req, res) => {
  try {
    const targetId = parseInt(req.params.targetId);
    const { target_meetups, target_revenue, meetup_cost, meetup_capacity, name, day_type_id } = req.body;

    // Auto-calculate target_revenue if meetup_cost and meetup_capacity are provided
    let finalTargetRevenue = target_revenue;
    if (meetup_cost !== undefined && meetup_capacity !== undefined && target_meetups !== undefined) {
      finalTargetRevenue = calculateTargetRevenue(target_meetups, meetup_cost, meetup_capacity);
    }

    const updateQuery = `
      UPDATE club_dimensional_targets
      SET
        target_meetups = COALESCE($2, target_meetups),
        target_revenue = COALESCE($3, target_revenue),
        meetup_cost = COALESCE($4, meetup_cost),
        meetup_capacity = COALESCE($5, meetup_capacity),
        name = COALESCE($6, name),
        day_type_id = COALESCE($7, day_type_id),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const result = await queryLocal(updateQuery, [
      targetId,
      target_meetups,
      finalTargetRevenue,
      meetup_cost,
      meetup_capacity,
      name || null,
      day_type_id || null
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Target not found'
      });
    }

    // Fetch the full target with dimension names
    const fullTarget = await queryLocal(`
      SELECT * FROM v_club_dimensional_targets WHERE id = $1
    `, [targetId]);

    res.json({
      success: true,
      target: fullTarget.rows[0],
      message: 'Dimensional target updated successfully'
    });
  } catch (error) {
    logger.error(`Failed to update dimensional target ${req.params.targetId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to update dimensional target',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// DELETE /api/targets/clubs/:clubId/dimensional/:targetId - Delete dimensional target
router.delete('/clubs/:clubId/dimensional/:targetId', async (req, res) => {
  try {
    const targetId = parseInt(req.params.targetId);

    const deleteQuery = `
      DELETE FROM club_dimensional_targets
      WHERE id = $1
      RETURNING id
    `;

    const result = await queryLocal(deleteQuery, [targetId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Target not found'
      });
    }

    res.json({
      success: true,
      message: 'Dimensional target deleted successfully'
    });
  } catch (error) {
    logger.error(`Failed to delete dimensional target ${req.params.targetId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete dimensional target',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// =====================================================
// LAUNCH DIMENSIONAL TARGET ENDPOINTS
// =====================================================

// GET /api/targets/launches/:launchId/dimensional - Get dimensional targets for a launch
router.get('/launches/:launchId/dimensional', async (req, res) => {
  try {
    const launchId = parseInt(req.params.launchId);

    // Get launch info
    const launchInfo = await queryLocal(`
      SELECT id, planned_club_name, activity_name, planned_city, planned_area
      FROM new_club_launches
      WHERE id = $1
    `, [launchId]);

    if (launchInfo.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Launch not found'
      });
    }

    const launch = launchInfo.rows[0];

    // Get dimensional targets
    const targetsResult = await queryLocal(`
      SELECT
        ldt.*,
        COALESCE(da.area_name, 'All Areas') as area_name,
        COALESCE(dc.city_name, 'All Cities') as city_name,
        COALESCE(dt.day_type, 'All Days') as day_type,
        COALESCE(df.format_name, 'All Formats') as format_name
      FROM launch_dimensional_targets ldt
      LEFT JOIN dim_areas da ON ldt.area_id = da.id
      LEFT JOIN dim_cities dc ON da.city_id = dc.id
      LEFT JOIN dim_day_types dt ON ldt.day_type_id = dt.id
      LEFT JOIN dim_formats df ON ldt.format_id = df.id
      WHERE ldt.launch_id = $1
      ORDER BY area_name, day_type, format_name
    `, [launchId]);

    // Calculate totals
    const totalMeetups = targetsResult.rows.reduce((sum, t) => sum + t.target_meetups, 0);
    const totalRevenue = targetsResult.rows.reduce((sum, t) => sum + t.target_revenue, 0);

    res.json({
      success: true,
      launch_id: launchId,
      planned_club_name: launch.planned_club_name,
      activity_name: launch.activity_name,
      planned_city: launch.planned_city,
      planned_area: launch.planned_area,
      dimensional_targets: targetsResult.rows,
      totals: {
        total_target_meetups: totalMeetups,
        total_target_revenue: totalRevenue
      }
    });
  } catch (error) {
    logger.error(`Failed to fetch dimensional targets for launch ${req.params.launchId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dimensional targets',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/targets/launches/:launchId/dimensional - Create launch dimensional target
router.post('/launches/:launchId/dimensional', async (req, res) => {
  try {
    const launchId = parseInt(req.params.launchId);
    const {
      area_id,
      day_type_id,
      format_id,
      target_meetups,
      target_revenue,
      activity_name
    } = req.body;

    // Validation: area_id is required (Day Type and Format are optional)
    if (!area_id) {
      return res.status(400).json({
        success: false,
        error: 'Area is required. Please select a city and area for this target.',
        field: 'area_id'
      });
    }

    // Resolve area_id: Frontend passes production_area_id, we need dim_areas.id
    let resolvedAreaId = area_id;
    const areaByProdId = await queryLocal(
      `SELECT id FROM dim_areas WHERE production_area_id = $1`,
      [area_id]
    );

    if (areaByProdId.rows.length > 0) {
      resolvedAreaId = areaByProdId.rows[0].id;
    } else {
      // Area doesn't exist - fetch from production and create it
      const prodAreaResult = await queryProduction(`
        SELECT ar.id, ar.name as area_name, ci.id as city_id, ci.name as city_name
        FROM area ar
        JOIN city ci ON ar.city_id = ci.id
        WHERE ar.id = $1
      `, [area_id]);

      if (prodAreaResult.rows.length > 0) {
        const prodArea = prodAreaResult.rows[0];
        const cityByProdId = await queryLocal(
          `SELECT id FROM dim_cities WHERE production_city_id = $1`,
          [prodArea.city_id]
        );

        let dimCityId: number;
        if (cityByProdId.rows.length > 0) {
          dimCityId = cityByProdId.rows[0].id;
        } else {
          const newCity = await queryLocal(
            `INSERT INTO dim_cities (city_name, production_city_id) VALUES ($1, $2)
             ON CONFLICT (city_name) DO UPDATE SET production_city_id = $2
             RETURNING id`,
            [prodArea.city_name, prodArea.city_id]
          );
          dimCityId = newCity.rows[0].id;
        }

        const newArea = await queryLocal(
          `INSERT INTO dim_areas (area_name, city_id, production_area_id, is_custom, is_active)
           VALUES ($1, $2, $3, FALSE, TRUE)
           ON CONFLICT (area_name, city_id) DO UPDATE SET production_area_id = $3
           RETURNING id`,
          [prodArea.area_name, dimCityId, area_id]
        );
        resolvedAreaId = newArea.rows[0].id;
      }
    }

    const insertQuery = `
      INSERT INTO launch_dimensional_targets (
        launch_id, activity_name,
        area_id, day_type_id, format_id,
        target_meetups, target_revenue
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (launch_id, area_id, day_type_id, format_id)
      DO UPDATE SET
        target_meetups = EXCLUDED.target_meetups,
        target_revenue = EXCLUDED.target_revenue,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const result = await queryLocal(insertQuery, [
      launchId,
      activity_name || null,
      resolvedAreaId || null,
      day_type_id || null,
      format_id || null,
      target_meetups || 0,
      target_revenue || 0
    ]);

    res.json({
      success: true,
      target: result.rows[0],
      message: 'Launch dimensional target created/updated successfully'
    });
  } catch (error) {
    logger.error(`Failed to create dimensional target for launch ${req.params.launchId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to create dimensional target',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// PUT /api/targets/launches/:launchId/dimensional/:targetId - Update launch dimensional target
router.put('/launches/:launchId/dimensional/:targetId', async (req, res) => {
  try {
    const targetId = parseInt(req.params.targetId);
    const { target_meetups, target_revenue, meetup_cost, meetup_capacity, name, day_type_id } = req.body;

    // Auto-calculate target_revenue if meetup_cost and meetup_capacity are provided
    let finalTargetRevenue = target_revenue;
    if (meetup_cost !== undefined && meetup_capacity !== undefined && target_meetups !== undefined) {
      finalTargetRevenue = calculateTargetRevenue(target_meetups, meetup_cost, meetup_capacity);
    }

    const updateQuery = `
      UPDATE launch_dimensional_targets
      SET
        target_meetups = COALESCE($2, target_meetups),
        target_revenue = COALESCE($3, target_revenue),
        meetup_cost = COALESCE($4, meetup_cost),
        meetup_capacity = COALESCE($5, meetup_capacity),
        name = COALESCE($6, name),
        day_type_id = COALESCE($7, day_type_id),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const result = await queryLocal(updateQuery, [
      targetId,
      target_meetups,
      finalTargetRevenue,
      meetup_cost,
      meetup_capacity,
      name || null,
      day_type_id || null
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Target not found'
      });
    }

    res.json({
      success: true,
      target: result.rows[0],
      message: 'Launch dimensional target updated successfully'
    });
  } catch (error) {
    logger.error(`Failed to update launch dimensional target ${req.params.targetId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to update dimensional target',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// DELETE /api/targets/launches/:launchId/dimensional/:targetId - Delete launch dimensional target
router.delete('/launches/:launchId/dimensional/:targetId', async (req, res) => {
  try {
    const targetId = parseInt(req.params.targetId);

    const deleteQuery = `
      DELETE FROM launch_dimensional_targets
      WHERE id = $1
      RETURNING id
    `;

    const result = await queryLocal(deleteQuery, [targetId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Target not found'
      });
    }

    res.json({
      success: true,
      message: 'Launch dimensional target deleted successfully'
    });
  } catch (error) {
    logger.error(`Failed to delete launch dimensional target ${req.params.targetId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete dimensional target',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// =====================================================
// DASHBOARD AGGREGATION ENDPOINTS
// =====================================================

// GET /api/targets/dashboard/by-area - Targets aggregated by area
router.get('/dashboard/by-area', async (req, res) => {
  try {
    const result = await queryLocal(`SELECT * FROM v_targets_by_area ORDER BY city_name, area_name`);

    const grandTotal = {
      total_target_meetups: result.rows.reduce((sum, r) => sum + parseInt(r.total_target_meetups), 0),
      total_target_revenue: result.rows.reduce((sum, r) => sum + parseInt(r.total_target_revenue), 0),
      area_count: result.rows.length
    };

    res.json({
      success: true,
      aggregation: 'area',
      data: result.rows,
      grand_total: grandTotal
    });
  } catch (error) {
    logger.error('Failed to fetch targets by area:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch targets by area',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/targets/dashboard/by-city - Targets aggregated by city (rollup from areas)
router.get('/dashboard/by-city', async (req, res) => {
  try {
    // Get city-level aggregation
    const cityResult = await queryLocal(`SELECT * FROM v_targets_by_city ORDER BY city_name`);

    // Get area breakdown for drill-down
    const areaResult = await queryLocal(`SELECT * FROM v_targets_by_area ORDER BY city_name, area_name`);

    // Group areas by city
    const citiesWithAreas = cityResult.rows.map(city => ({
      ...city,
      areas: areaResult.rows
        .filter(a => a.city_id === city.city_id)
        .map(a => ({
          area_name: a.area_name,
          target_meetups: parseInt(a.total_target_meetups),
          target_revenue: parseInt(a.total_target_revenue),
          club_count: parseInt(a.club_count)
        }))
    }));

    // Calculate grand total
    const grandTotal = {
      total_target_meetups: citiesWithAreas.reduce((sum, c) => sum + parseInt(c.total_target_meetups || '0'), 0),
      total_target_revenue: citiesWithAreas.reduce((sum, c) => sum + parseInt(c.total_target_revenue || '0'), 0),
      city_count: citiesWithAreas.length
    };

    res.json({
      success: true,
      aggregation: 'city',
      data: citiesWithAreas,
      grand_total: grandTotal
    });
  } catch (error) {
    logger.error('Failed to fetch targets by city:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch targets by city',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/targets/dashboard/by-day-type - Targets aggregated by day type
router.get('/dashboard/by-day-type', async (req, res) => {
  try {
    const result = await queryLocal(`SELECT * FROM v_targets_by_day_type ORDER BY day_type`);

    // Calculate grand total
    const grandTotal = {
      total_target_meetups: result.rows.reduce((sum: number, r: any) => sum + parseInt(r.total_target_meetups || '0'), 0),
      total_target_revenue: result.rows.reduce((sum: number, r: any) => sum + parseInt(r.total_target_revenue || '0'), 0),
      day_type_count: result.rows.length
    };

    res.json({
      success: true,
      aggregation: 'day_type',
      data: result.rows,
      grand_total: grandTotal
    });
  } catch (error) {
    logger.error('Failed to fetch targets by day type:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch targets by day type',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/targets/dashboard/by-format - Targets aggregated by format
router.get('/dashboard/by-format', async (req, res) => {
  try {
    const result = await queryLocal(`SELECT * FROM v_targets_by_format ORDER BY format_name`);

    // Calculate grand total
    const grandTotal = {
      total_target_meetups: result.rows.reduce((sum: number, r: any) => sum + parseInt(r.total_target_meetups || '0'), 0),
      total_target_revenue: result.rows.reduce((sum: number, r: any) => sum + parseInt(r.total_target_revenue || '0'), 0),
      format_count: result.rows.length
    };

    res.json({
      success: true,
      aggregation: 'format',
      data: result.rows,
      grand_total: grandTotal
    });
  } catch (error) {
    logger.error('Failed to fetch targets by format:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch targets by format',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/targets/dashboard/by-activity - Targets aggregated by activity
router.get('/dashboard/by-activity', async (req, res) => {
  try {
    // Get activity names from production
    const currentMetrics = await getCurrentMetrics();

    // Get activity-level aggregation from dimensional targets
    const activityResult = await queryLocal(`SELECT * FROM v_targets_by_activity`);

    // Combine with activity names
    const activitiesWithTargets = currentMetrics.map(metric => {
      const target = activityResult.rows.find(t => t.activity_id === metric.activity_id) || {};

      return {
        activity_id: metric.activity_id,
        activity_name: metric.activity_name,
        current_meetups_month: parseInt(metric.current_meetups_month || 0),
        current_revenue_rupees: parseFloat(metric.current_revenue_rupees || 0),
        active_clubs_count: parseInt(metric.active_clubs_count || 0),
        total_target_meetups: parseInt(target.total_target_meetups || 0),
        total_target_revenue: parseInt(target.total_target_revenue || 0),
        club_count_with_targets: parseInt(target.club_count || 0)
      };
    });

    // Calculate grand total
    const grandTotal = {
      total_target_meetups: activitiesWithTargets.reduce((sum, a) => sum + a.total_target_meetups, 0),
      total_target_revenue: activitiesWithTargets.reduce((sum, a) => sum + a.total_target_revenue, 0),
      activity_count: activitiesWithTargets.filter(a => a.total_target_meetups > 0).length
    };

    res.json({
      success: true,
      aggregation: 'activity',
      data: activitiesWithTargets,
      grand_total: grandTotal
    });
  } catch (error) {
    logger.error('Failed to fetch targets by activity:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch targets by activity',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/targets/dashboard/summary - Combined summary of all dimensions
router.get('/dashboard/summary', async (req, res) => {
  try {
    const [byArea, byCity, byDayType, byFormat, byActivity] = await Promise.all([
      queryLocal(`SELECT COUNT(*) as count, SUM(total_target_meetups) as meetups FROM v_targets_by_area`),
      queryLocal(`SELECT COUNT(*) as count, SUM(total_target_meetups) as meetups FROM v_targets_by_city`),
      queryLocal(`SELECT COUNT(*) as count, SUM(total_target_meetups) as meetups FROM v_targets_by_day_type`),
      queryLocal(`SELECT COUNT(*) as count, SUM(total_target_meetups) as meetups FROM v_targets_by_format`),
      queryLocal(`SELECT COUNT(*) as count, SUM(total_target_meetups) as meetups FROM v_targets_by_activity`)
    ]);

    // Get total club and launch targets
    const totalClubTargets = await queryLocal(`
      SELECT COUNT(*) as count, SUM(target_meetups) as meetups
      FROM club_dimensional_targets
    `);

    const totalLaunchTargets = await queryLocal(`
      SELECT COUNT(*) as count, SUM(target_meetups) as meetups
      FROM launch_dimensional_targets
    `);

    res.json({
      success: true,
      summary: {
        total_club_dimensional_targets: parseInt(totalClubTargets.rows[0].count || 0),
        total_launch_dimensional_targets: parseInt(totalLaunchTargets.rows[0].count || 0),
        total_club_target_meetups: parseInt(totalClubTargets.rows[0].meetups || 0),
        total_launch_target_meetups: parseInt(totalLaunchTargets.rows[0].meetups || 0),
        by_area: {
          count: parseInt(byArea.rows[0].count || 0),
          total_meetups: parseInt(byArea.rows[0].meetups || 0)
        },
        by_city: {
          count: parseInt(byCity.rows[0].count || 0),
          total_meetups: parseInt(byCity.rows[0].meetups || 0)
        },
        by_day_type: {
          count: parseInt(byDayType.rows[0].count || 0),
          total_meetups: parseInt(byDayType.rows[0].meetups || 0)
        },
        by_format: {
          count: parseInt(byFormat.rows[0].count || 0),
          total_meetups: parseInt(byFormat.rows[0].meetups || 0)
        },
        by_activity: {
          count: parseInt(byActivity.rows[0].count || 0),
          total_meetups: parseInt(byActivity.rows[0].meetups || 0)
        }
      },
      generated_at: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to fetch dashboard summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard summary',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// =====================================================
// ACTIVITY/CLUB LIST ENDPOINTS (For UI)
// =====================================================

// GET /api/targets/activities - Get all activities with their dimensional target totals
router.get('/activities', async (req, res) => {
  try {
    const currentMetrics = await getCurrentMetrics();

    // Get dimensional target totals per activity
    const activityTargets = await queryLocal(`
      SELECT
        activity_id,
        SUM(target_meetups) as total_target_meetups,
        SUM(target_revenue) as total_target_revenue,
        COUNT(*) as dimensional_target_count
      FROM club_dimensional_targets
      WHERE activity_id IS NOT NULL
      GROUP BY activity_id
    `);

    // Combine metrics with dimensional targets
    const combined = currentMetrics.map(metric => {
      const target = activityTargets.rows.find(t => t.activity_id === metric.activity_id) || {};
      const totalTargetMeetups = parseInt(target.total_target_meetups || 0);
      const totalTargetRevenue = parseInt(target.total_target_revenue || 0);

      return {
        activity_name: metric.activity_name,
        activity_id: metric.activity_id,
        current_meetups_week: parseInt(metric.current_meetups_week || 0),
        current_meetups_month: parseInt(metric.current_meetups_month || 0),
        current_revenue_rupees: parseFloat(metric.current_revenue_rupees || 0),
        active_clubs_count: parseInt(metric.active_clubs_count || 0),
        total_events: parseInt(metric.total_events || 0),
        // New dimensional fields
        total_target_meetups: totalTargetMeetups,
        total_target_revenue: totalTargetRevenue,
        dimensional_target_count: parseInt(target.dimensional_target_count || 0),
        // Backward-compatible fields for ScalingTargets component
        target_meetups_existing: totalTargetMeetups,
        target_revenue_existing_rupees: totalTargetRevenue,
        target_meetups_new: 0,
        target_revenue_new_rupees: 0,
        total_target_revenue_rupees: totalTargetRevenue,
        targets_last_updated: null
      };
    });

    res.json({
      success: true,
      activities: combined,
      summary: {
        total_activities: combined.length,
        total_active_clubs: combined.reduce((sum, a) => sum + a.active_clubs_count, 0),
        total_current_meetups: combined.reduce((sum, a) => sum + a.current_meetups_month, 0),
        total_target_meetups: combined.reduce((sum, a) => sum + a.total_target_meetups, 0)
      },
      generated_at: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to fetch activities:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch activities',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/targets/activities/:activityName/clubs - Get clubs for an activity with dimensional targets
router.get('/activities/:activityName/clubs', async (req, res) => {
  try {
    const activityName = decodeURIComponent(req.params.activityName);

    // Get clubs from production
    const clubsQuery = `
      WITH club_locations AS (
        SELECT DISTINCT ON (e.club_id)
          e.club_id,
          ci.name as city_name,
          ar.name as area_name
        FROM event e
        JOIN location l ON e.location_id = l.id
        JOIN area ar ON l.area_id = ar.id
        JOIN city ci ON ar.city_id = ci.id
        ORDER BY e.club_id, e.start_time DESC
      ),
      club_revenue AS (
        SELECT
          e.club_id,
          COALESCE(SUM(p.amount) / 100.0, 0) as current_revenue_rupees
        FROM event e
        JOIN booking b ON b.event_id = e.pk
        JOIN transaction t ON t.entity_id = b.id AND t.entity_type = 'BOOKING'
        JOIN payment p ON p.pk = t.payment_id
        WHERE p.state = 'COMPLETED'
          AND e.start_time >= DATE_TRUNC('month', CURRENT_DATE)
          AND e.start_time < CURRENT_TIMESTAMP
          AND e.state = 'CREATED'
        GROUP BY e.club_id
      ),
      club_metrics AS (
        SELECT
          c.id as club_id,
          c.pk as club_pk,
          c.name as club_name,
          c.status,
          c.created_at,
          a.id as activity_id,
          COUNT(DISTINCT CASE
            WHEN e.start_time >= DATE_TRUNC('month', CURRENT_DATE)
            AND e.start_time < CURRENT_TIMESTAMP
            AND e.state = 'CREATED'
            THEN e.pk
          END) as current_meetups,
          COUNT(DISTINCT e.pk) as total_events
        FROM club c
        LEFT JOIN activity a ON c.activity_id = a.id
        LEFT JOIN event e ON c.pk = e.club_id
        WHERE a.name = $1
          AND c.status = 'ACTIVE'
          AND c.is_private = false
        GROUP BY c.pk, c.id, c.name, c.status, c.created_at, a.id
      )
      SELECT
        cm.club_id,
        cm.club_pk,
        cm.club_name,
        cm.status,
        cm.created_at,
        cm.activity_id,
        cm.current_meetups,
        cm.total_events,
        COALESCE(cr.current_revenue_rupees, 0) as current_revenue_rupees,
        COALESCE(cl.city_name, 'Unknown') as city_name,
        COALESCE(cl.area_name, 'Unknown') as area_name
      FROM club_metrics cm
      LEFT JOIN club_locations cl ON cm.club_pk = cl.club_id
      LEFT JOIN club_revenue cr ON cm.club_pk = cr.club_id
      ORDER BY cm.current_meetups DESC, cm.total_events DESC, cm.club_name
    `;

    const clubsResult = await queryProduction(clubsQuery, [activityName]);

    // Get dimensional target totals for each club
    const clubIds = clubsResult.rows.map(c => c.club_pk);
    let clubTargets: any[] = [];

    if (clubIds.length > 0) {
      const targetQuery = `
        SELECT
          club_id,
          SUM(target_meetups) as total_target_meetups,
          SUM(target_revenue) as total_target_revenue,
          COUNT(*) as dimensional_count
        FROM club_dimensional_targets
        WHERE club_id = ANY($1)
        GROUP BY club_id
      `;
      const targetsResult = await queryLocal(targetQuery, [clubIds]);
      clubTargets = targetsResult.rows;
    }

    // Combine clubs with their target totals
    const clubsWithTargets = clubsResult.rows.map(club => {
      const target = clubTargets.find(t => t.club_id === club.club_pk) || {};
      const createdAt = new Date(club.created_at);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      return {
        club_id: club.club_id,
        club_pk: club.club_pk,
        club_name: club.club_name,
        status: club.status,
        city: club.city_name,
        area: club.area_name,
        activity_id: club.activity_id,
        current_meetups: parseInt(club.current_meetups || 0),
        current_revenue_rupees: parseFloat(club.current_revenue_rupees || 0),
        total_events: parseInt(club.total_events || 0),
        // Target fields matching ClubTarget interface
        target_meetups: parseInt(target.total_target_meetups || 0),
        target_revenue_rupees: parseInt(target.total_target_revenue || 0),
        total_target_meetups: parseInt(target.total_target_meetups || 0),
        total_target_revenue: parseInt(target.total_target_revenue || 0),
        dimensional_count: parseInt(target.dimensional_count || 0),
        created_at: club.created_at,
        // Additional fields for ScalingTargets component
        is_new_club: createdAt > thirtyDaysAgo,
        launch_date: null,
        is_recently_created: createdAt > thirtyDaysAgo,
        scaling_stage: 'not_picked' as const
      };
    });

    res.json({
      success: true,
      activity_name: activityName,
      clubs: clubsWithTargets,
      existing_clubs: clubsWithTargets, // Alias for backward compatibility with ScalingTargets
      summary: {
        total_clubs: clubsWithTargets.length,
        clubs_with_targets: clubsWithTargets.filter(c => c.dimensional_count > 0).length,
        total_current_meetups: clubsWithTargets.reduce((sum, c) => sum + c.current_meetups, 0),
        total_target_meetups: clubsWithTargets.reduce((sum, c) => sum + c.total_target_meetups, 0)
      },
      generated_at: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Failed to fetch clubs for activity ${req.params.activityName}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch clubs',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// =====================================================
// FILTER/UTILITY ENDPOINTS
// =====================================================

// GET /api/targets/filter-options - Get filter options for the UI
router.get('/filter-options', async (req, res) => {
  try {
    const dimensions = await getAllDimensions();

    // Get POCs from production database (club creators)
    const pocsResult = await queryProduction(`
      SELECT DISTINCT CONCAT(u.first_name, ' ', u.last_name) as poc_name
      FROM users u
      JOIN club c ON c.created_by = u.pk
      WHERE c.status = 'ACTIVE'
        AND u.first_name IS NOT NULL
        AND LENGTH(TRIM(u.first_name)) > 0
      ORDER BY poc_name
    `);

    const filters = {
      activities: (await queryProduction(`
        SELECT DISTINCT a.name as activity_name
        FROM activity a
        WHERE a.name IS NOT NULL AND a.name != '' AND a.name != 'Test'
        ORDER BY a.name
      `)).rows.map(r => r.activity_name),
      cities: dimensions.city.values.map((c: any) => c.name),
      areas: dimensions.area.values.map((a: any) => a.name),
      pocs: pocsResult.rows.map((r: any) => r.poc_name),
      statuses: ['ACTIVE', 'INACTIVE'],
      // Also include dimensional filter options
      day_types: dimensions.day_type.values.map((d: any) => d.name),
      formats: dimensions.format.values.map((f: any) => f.name)
    };

    res.json({
      success: true,
      filters
    });
  } catch (error) {
    logger.error('Failed to load filter options:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load filter options',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/targets/cities - Get all cities (for backward compatibility)
router.get('/cities', async (req, res) => {
  try {
    const result = await queryLocal(`
      SELECT id, city_name as name, state, production_city_id
      FROM dim_cities
      WHERE is_active = TRUE
      ORDER BY city_name
    `);

    res.json(result.rows);
  } catch (error) {
    logger.error('Failed to fetch cities:', error);
    res.status(500).json({ error: 'Failed to fetch cities' });
  }
});

// GET /api/targets/areas/:cityId - Get areas for a city (for backward compatibility)
router.get('/areas/:cityId', async (req, res) => {
  try {
    const cityId = parseInt(req.params.cityId);
    const areas = await getAreasByCity(cityId);

    res.json(areas);
  } catch (error) {
    logger.error('Failed to fetch areas:', error);
    res.status(500).json({ error: 'Failed to fetch areas' });
  }
});

// =====================================================
// V2 ENDPOINTS - SCALING PLANNER V2
// =====================================================

// Helper: Default progress object
const defaultProgress = {
  not_picked: 0,
  started: 0,
  stage_1: 0,
  stage_2: 0,
  stage_3: 0,
  stage_4: 0,
  realised: 0
};

// Helper: Sum progress objects
function sumProgress(progresses: any[]): any {
  return progresses.reduce((acc, p) => ({
    not_picked: acc.not_picked + (p?.not_picked || 0),
    started: acc.started + (p?.started || 0),
    stage_1: acc.stage_1 + (p?.stage_1 || 0),
    stage_2: acc.stage_2 + (p?.stage_2 || 0),
    stage_3: acc.stage_3 + (p?.stage_3 || 0),
    stage_4: acc.stage_4 + (p?.stage_4 || 0),
    realised: acc.realised + (p?.realised || 0),
    unattributed_meetups: (acc.unattributed_meetups || 0) + (p?.unattributed_meetups || 0)
  }), { ...defaultProgress, unattributed_meetups: 0 });
}

// Helper: Validate progress against current metrics
function validateProgress(targetMeetups: number, currentMeetups: number, progress: any): { status: string; message?: string } {
  const gap = targetMeetups - currentMeetups;
  const realised = progress?.realised || 0;
  const nonRealised = (progress?.not_picked || 0) + (progress?.started || 0) +
                      (progress?.stage_1 || 0) + (progress?.stage_2 || 0) +
                      (progress?.stage_3 || 0) + (progress?.stage_4 || 0);

  // Check if realised matches current (actuals)
  if (realised < currentMeetups) {
    const achievedButNotMarked = currentMeetups - realised;
    return {
      status: 'needs_update',
      message: `${achievedButNotMarked} meetups achieved, update stages!`
    };
  }

  // Check if non-realised exceeds gap
  if (nonRealised > gap && gap >= 0) {
    return {
      status: 'over_allocated',
      message: `${nonRealised - gap} too many in pending stages`
    };
  }

  return { status: 'valid' };
}

// PUT /api/targets/clubs/:clubId/dimensional/:targetId/progress - Update progress
router.put('/clubs/:clubId/dimensional/:targetId/progress', async (req, res) => {
  try {
    const { targetId } = req.params;
    const { progress } = req.body;

    if (!progress) {
      return res.status(400).json({
        success: false,
        error: 'Progress object is required'
      });
    }

    // Validate progress object has required fields
    const requiredFields = ['not_picked', 'started', 'stage_1', 'stage_2', 'stage_3', 'stage_4', 'realised'];
    for (const field of requiredFields) {
      if (typeof progress[field] !== 'number' || progress[field] < 0) {
        return res.status(400).json({
          success: false,
          error: `Invalid or missing progress field: ${field}`
        });
      }
    }

    // Get target to validate sum matches target_meetups
    const targetResult = await queryLocal(
      `SELECT target_meetups FROM club_dimensional_targets WHERE id = $1`,
      [targetId]
    );

    if (targetResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Target not found'
      });
    }

    const targetMeetups = targetResult.rows[0].target_meetups || 0;
    const stageSum = progress.not_picked + progress.started + progress.stage_1 +
      progress.stage_2 + progress.stage_3 + progress.stage_4 + progress.realised;

    if (stageSum !== targetMeetups) {
      return res.status(400).json({
        success: false,
        error: `Stage distribution sum (${stageSum}) must equal target meetups (${targetMeetups})`,
        validation: {
          stage_sum: stageSum,
          target_meetups: targetMeetups,
          difference: stageSum - targetMeetups
        }
      });
    }

    const result = await queryLocal(`
      UPDATE club_dimensional_targets
      SET progress = $1::jsonb, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [JSON.stringify(progress), targetId]);

    res.json({
      success: true,
      target: result.rows[0]
    });
  } catch (error) {
    logger.error('Failed to update progress:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update progress',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// PUT /api/targets/launches/:launchId/dimensional/:targetId/progress - Update launch target progress
router.put('/launches/:launchId/dimensional/:targetId/progress', async (req, res) => {
  try {
    const { targetId } = req.params;
    const { progress } = req.body;

    if (!progress) {
      return res.status(400).json({
        success: false,
        error: 'Progress object is required'
      });
    }

    // Validate progress object has required fields
    const requiredFields = ['not_picked', 'started', 'stage_1', 'stage_2', 'stage_3', 'stage_4', 'realised'];
    for (const field of requiredFields) {
      if (typeof progress[field] !== 'number' || progress[field] < 0) {
        return res.status(400).json({
          success: false,
          error: `Invalid or missing progress field: ${field}`
        });
      }
    }

    // Get target to validate sum matches target_meetups
    const targetResult = await queryLocal(
      `SELECT target_meetups FROM launch_dimensional_targets WHERE id = $1`,
      [targetId]
    );

    if (targetResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Target not found'
      });
    }

    const targetMeetups = targetResult.rows[0].target_meetups || 0;
    const stageSum = progress.not_picked + progress.started + progress.stage_1 +
      progress.stage_2 + progress.stage_3 + progress.stage_4 + progress.realised;

    if (stageSum !== targetMeetups) {
      return res.status(400).json({
        success: false,
        error: `Stage distribution sum (${stageSum}) must equal target meetups (${targetMeetups})`,
        validation: {
          stage_sum: stageSum,
          target_meetups: targetMeetups,
          difference: stageSum - targetMeetups
        }
      });
    }

    const result = await queryLocal(`
      UPDATE launch_dimensional_targets
      SET progress = $1::jsonb, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [JSON.stringify(progress), targetId]);

    res.json({
      success: true,
      target: result.rows[0]
    });
  } catch (error) {
    logger.error('Failed to update launch progress:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update progress',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/targets/v2/hierarchy - Get full hierarchy for V2 dashboard
router.get('/v2/hierarchy', async (req, res) => {
  try {
    const { activity_id, city_id, area_id, include_launches, targets_only, use_auto_matching } = req.query;
    const autoMatchingEnabled = use_auto_matching === 'true';

    // Store for auto-matching results (club_id -> ClubMatchResult)
    const autoMatchResults = new Map<number, ClubMatchResult>();

    // Get ALL clubs from production with area derived from event locations (like original Scaling Planner)
    // This is the same approach as /api/scaling/clubs
    const clubsQuery = `
      WITH
      -- Pre-compute most recent location for each club (area derived from events)
      club_locations AS (
        SELECT DISTINCT ON (e.club_id)
          e.club_id,
          ci.id as city_id,
          ci.name as city_name,
          ar.id as area_id,
          ar.name as area_name
        FROM event e
        JOIN location l ON e.location_id = l.id
        JOIN area ar ON l.area_id = ar.id
        JOIN city ci ON ar.city_id = ci.id
        ORDER BY e.club_id, e.start_time DESC
      ),
      -- Main club metrics with LAST COMPLETED WEEK meetups and revenue
      -- Last completed week = Monday to Sunday of previous week
      club_metrics AS (
        SELECT
          c.pk as club_id,
          c.name as club_name,
          a.id as activity_id,
          a.name as activity_name,
          COUNT(DISTINCT CASE
            WHEN e.start_time >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '1 week'
            AND e.start_time < DATE_TRUNC('week', CURRENT_DATE)
            AND e.state = 'CREATED'
            THEN e.pk
          END) as current_meetups,
          COALESCE(SUM(
            CASE
              WHEN p.state = 'COMPLETED'
              AND e.start_time >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '1 week'
              AND e.start_time < DATE_TRUNC('week', CURRENT_DATE)
              AND e.state = 'CREATED'
              THEN p.amount / 100.0
              ELSE 0
            END
          ), 0) as current_revenue
        FROM club c
        JOIN activity a ON c.activity_id = a.id
        LEFT JOIN event e ON c.pk = e.club_id
        LEFT JOIN booking b ON b.event_id = e.pk
        LEFT JOIN transaction t ON t.entity_id = b.id AND t.entity_type = 'BOOKING'
        LEFT JOIN payment p ON p.pk = t.payment_id
        WHERE c.status = 'ACTIVE'
          AND c.is_private = false
          AND a.name != 'Test'
          ${activity_id ? `AND a.id = ${parseInt(activity_id as string)}` : ''}
        GROUP BY c.pk, c.name, a.id, a.name
      )
      SELECT
        cm.club_id,
        cm.club_name,
        cm.activity_id,
        cm.activity_name,
        COALESCE(cl.city_id, 0) as city_id,
        COALESCE(cl.city_name, 'Unknown') as city_name,
        COALESCE(cl.area_id, 0) as area_id,
        COALESCE(cl.area_name, 'Unknown') as area_name,
        cm.current_meetups,
        cm.current_revenue
      FROM club_metrics cm
      LEFT JOIN club_locations cl ON cm.club_id = cl.club_id
      ORDER BY cm.activity_name, cl.city_name, cl.area_name, cm.club_name
    `;

    const clubsResult = await queryProduction(clubsQuery);

    // Get last 4 weeks revenue per club from production (event-based)
    const last4WeeksRevenueQuery = `
      SELECT
        c.pk as club_id,
        COALESCE(SUM(
          CASE WHEN p.state = 'COMPLETED' THEN p.amount / 100.0 ELSE 0 END
        ), 0) as total_revenue,
        COUNT(DISTINCT DATE_TRUNC('week', e.start_time)) as weeks_with_data
      FROM club c
      LEFT JOIN event e ON c.pk = e.club_id
        AND e.start_time >= CURRENT_DATE - INTERVAL '4 weeks'
        AND e.start_time < CURRENT_DATE
        AND e.state = 'CREATED'
      LEFT JOIN booking b ON b.event_id = e.pk
      LEFT JOIN transaction t ON t.entity_id = b.id AND t.entity_type = 'BOOKING'
      LEFT JOIN payment p ON p.pk = t.payment_id
      WHERE c.status = 'ACTIVE' AND c.is_private = false
      GROUP BY c.pk
    `;
    const last4WeeksResult = await queryProduction(last4WeeksRevenueQuery);
    const last4WeeksMap = new Map(last4WeeksResult.rows.map((r: any) => [
      parseInt(r.club_id),
      {
        total: parseFloat(r.total_revenue) || 0,
        weeks: parseInt(r.weeks_with_data) || 0
      }
    ]));

    // Get March 2026 revenue (will only have data when March 2026 arrives)
    const march2026RevenueQuery = `
      SELECT COALESCE(SUM(
        CASE WHEN p.state = 'COMPLETED' THEN p.amount / 100.0 ELSE 0 END
      ), 0) as total_revenue
      FROM event e
      JOIN club c ON e.club_id = c.pk
      LEFT JOIN booking b ON b.event_id = e.pk
      LEFT JOIN transaction t ON t.entity_id = b.id AND t.entity_type = 'BOOKING'
      LEFT JOIN payment p ON p.pk = t.payment_id
      WHERE e.start_time >= '2026-03-01' AND e.start_time < '2026-04-01'
        AND e.state = 'CREATED'
        AND c.is_private = false
    `;
    const march2026Result = await queryProduction(march2026RevenueQuery);
    const march2026Revenue = parseFloat(march2026Result.rows[0]?.total_revenue || 0);

    // Get dimensional targets from local DB (these overlay on clubs)
    // Now fetching ALL targets per club to support multiple targets
    // Include area_id to support expansion targets (targets in different areas than club's home area)
    const targetsQuery = `
      SELECT
        cdt.id as target_id,
        cdt.club_id,
        cdt.area_id as target_area_id,
        cdt.name as target_name,
        cdt.target_meetups,
        cdt.target_revenue,
        cdt.meetup_cost,
        cdt.meetup_capacity,
        cdt.day_type_id,
        cdt.format_id,
        dt.day_type as day_type_name,
        df.format_name,
        COALESCE(cdt.progress, '${JSON.stringify(defaultProgress)}'::jsonb) as progress
      FROM club_dimensional_targets cdt
      LEFT JOIN dim_day_types dt ON cdt.day_type_id = dt.id
      LEFT JOIN dim_formats df ON cdt.format_id = df.id
      ${activity_id ? `WHERE cdt.activity_id = ${parseInt(activity_id as string)}` : ''}
      ORDER BY cdt.club_id, cdt.id
    `;
    const targetsResult = await queryLocal(targetsQuery);

    // Map club_id to ARRAY of targets (support multiple targets per club)
    const targetsMap = new Map<number, any[]>();
    for (const t of targetsResult.rows) {
      const clubId = parseInt(t.club_id);
      if (!targetsMap.has(clubId)) {
        targetsMap.set(clubId, []);
      }
      targetsMap.get(clubId)!.push(t);
    }

    // Fetch planned launches if include_launches is true
    const includeLaunches = include_launches === 'true';
    let launchesData: any[] = [];
    let launchTargetsMap = new Map<number, any>();

    if (includeLaunches) {
      // Fetch launches from new_club_launches
      const launchesQuery = `
        SELECT
          ncl.id as launch_id,
          ncl.activity_name,
          ncl.planned_club_name,
          ncl.planned_city,
          ncl.planned_area,
          ncl.planned_launch_date,
          ncl.target_revenue_rupees,
          ncl.launch_status,
          ncl.milestones,
          ncl.actual_club_id
        FROM new_club_launches ncl
        WHERE ncl.launch_status IN ('planned', 'in_progress')
        ORDER BY ncl.activity_name, ncl.planned_city, ncl.planned_area
      `;
      const launchesResult = await queryLocal(launchesQuery);
      launchesData = launchesResult.rows;

      // Fetch launch targets from launch_dimensional_targets (including area_id for proper hierarchy placement)
      if (launchesData.length > 0) {
        const launchIds = launchesData.map(l => l.launch_id);
        const launchTargetsQuery = `
          SELECT
            ldt.id as target_id,
            ldt.launch_id,
            ldt.target_meetups,
            ldt.target_revenue,
            ldt.area_id,
            COALESCE(ldt.progress, '${JSON.stringify(defaultProgress)}'::jsonb) as progress
          FROM launch_dimensional_targets ldt
          WHERE ldt.launch_id = ANY($1)
        `;
        const launchTargetsResult = await queryLocal(launchTargetsQuery, [launchIds]);
        launchTargetsMap = new Map(launchTargetsResult.rows.map((t: any) => [parseInt(t.launch_id), t]));
      }
    }

    // Filter clubs: if targets_only=true, only show clubs with targets
    const showTargetsOnly = targets_only === 'true';
    const clubsToProcess = showTargetsOnly
      ? clubsResult.rows.filter((club: any) => {
          const targets = targetsMap.get(parseInt(club.club_id));
          return targets && targets.length > 0;
        })
      : clubsResult.rows;

    // Auto-matching: fetch meetup-to-target matching for clubs with targets
    if (autoMatchingEnabled) {
      logger.info('Auto-matching enabled, running matching for clubs with targets...');
      const clubsWithTargets = clubsToProcess
        .filter((c: any) => targetsMap.has(parseInt(c.club_id)))
        .map((c: any) => ({ club_id: parseInt(c.club_id), club_name: c.club_name }));

      // Run matching in parallel batches
      const batchSize = 10;
      for (let i = 0; i < clubsWithTargets.length; i += batchSize) {
        const batch = clubsWithTargets.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map(club => matchClubMeetups(club.club_id, club.club_name))
        );
        for (const result of results) {
          autoMatchResults.set(result.club_id, result);
        }
      }
      logger.info(`Auto-matching completed for ${autoMatchResults.size} clubs`);
    }

    // Build hierarchy: Activity → City → Area → Clubs
    const activityMap = new Map<number, any>();

    for (const club of clubsToProcess) {
      const activityId = parseInt(club.activity_id);
      const cityId = parseInt(club.city_id) || 0;
      const areaId = parseInt(club.area_id) || 0;
      const clubId = parseInt(club.club_id);

      // Get ALL targets for this club (may be multiple)
      const targets = targetsMap.get(clubId) || [];
      const hasTargets = targets.length > 0;

      // Aggregate target totals across all targets for the club row
      const targetMeetups = targets.reduce((sum, t) => sum + (parseInt(t.target_meetups) || 0), 0);
      const targetRevenue = targets.reduce((sum, t) => sum + (parseFloat(t.target_revenue) || 0), 0);

      // Check for auto-matching results
      const autoMatchResult = autoMatchResults.get(clubId);

      // Aggregate progress across all targets
      // When auto-matching is enabled, use matched progress from auto-matching results
      let aggregatedProgress: any;
      if (autoMatchResult && autoMatchResult.targets.length > 0) {
        // Use auto-matched progress
        aggregatedProgress = autoMatchResult.targets.reduce((acc, t) => {
          return sumProgress([acc, t.new_progress]);
        }, { ...defaultProgress });
        // Add area-level unattributed meetups (meetups that didn't match any target)
        aggregatedProgress.unattributed_meetups = (aggregatedProgress.unattributed_meetups || 0) + autoMatchResult.total_unattributed_meetups;
      } else {
        // Use stored progress
        aggregatedProgress = targets.reduce((acc, t) => {
          const p = t.progress || defaultProgress;
          return sumProgress([acc, p]);
        }, { ...defaultProgress });
      }

      const currentMeetups = parseInt(club.current_meetups) || 0;
      const currentRevenue = parseFloat(club.current_revenue) || 0;

      // Gap should not be negative
      const gapMeetups = Math.max(0, targetMeetups - currentMeetups);
      const gapRevenue = Math.max(0, targetRevenue - currentRevenue);

      // Get last 4 weeks revenue for this club
      const clubLast4w = last4WeeksMap.get(clubId) || { total: 0, weeks: 0 };
      const last4wTotal = clubLast4w.total;
      const last4wAvg = clubLast4w.weeks > 0 ? last4wTotal / 4 : 0; // Always divide by 4 for consistent avg

      // Calculate revenue status for this club
      // When auto-matching is enabled, rollup the matched revenue statuses
      let clubRevenueStatus: RevenueStatus;
      if (autoMatchResult && autoMatchResult.targets.length > 0) {
        // Rollup from auto-matched revenue statuses + add area unattributed
        const targetStatuses = autoMatchResult.targets.map(t => t.revenue_status);
        clubRevenueStatus = rollupRevenueStatuses(targetStatuses);
        // Add area unattributed revenue (meetups that didn't match any target)
        clubRevenueStatus.unattributed += autoMatchResult.total_unattributed_revenue;
      } else {
        // Use stored progress for revenue calculation
        clubRevenueStatus = calculateClubRevenueStatus(
          targets.map(t => ({
            target_revenue: parseFloat(t.target_revenue) || 0,
            progress: t.progress || defaultProgress
          })),
          currentRevenue
        );
      }
      const hasRevenueData = hasTargets || currentRevenue > 0;

      // Get activity node or create
      if (!activityMap.has(activityId)) {
        activityMap.set(activityId, {
          type: 'activity',
          id: `activity:${activityId}`,
          name: club.activity_name,
          activity_id: activityId,
          target_meetups: 0,
          target_revenue: 0,
          current_meetups: 0,
          current_revenue: 0,
          gap_meetups: 0,
          gap_revenue: 0,
          progress_summary: { ...defaultProgress },
          club_count: 0,
          last_4w_revenue_total: 0,
          revenue_status_list: [] as RevenueStatus[], // Collect for rollup
          children: new Map<number, any>()
        });
      }

      const activityNode = activityMap.get(activityId);
      activityNode.target_meetups += targetMeetups;
      activityNode.target_revenue += targetRevenue;
      activityNode.current_meetups += currentMeetups;
      activityNode.current_revenue += currentRevenue;
      activityNode.club_count++;
      activityNode.last_4w_revenue_total += last4wTotal;
      if (hasRevenueData) {
        activityNode.revenue_status_list.push(clubRevenueStatus);
      }

      // Get city node or create
      // Use composite ID to ensure uniqueness across activities (same city can appear under different activities)
      if (!activityNode.children.has(cityId)) {
        activityNode.children.set(cityId, {
          type: 'city',
          id: `activity:${activityId}-city:${cityId}`,
          name: club.city_name || 'Unknown',
          city_id: cityId,
          target_meetups: 0,
          target_revenue: 0,
          current_meetups: 0,
          current_revenue: 0,
          gap_meetups: 0,
          gap_revenue: 0,
          progress_summary: { ...defaultProgress },
          club_count: 0,
          last_4w_revenue_total: 0,
          revenue_status_list: [] as RevenueStatus[], // Collect for rollup
          children: new Map<number, any>()
        });
      }

      const cityNode = activityNode.children.get(cityId);
      cityNode.target_meetups += targetMeetups;
      cityNode.target_revenue += targetRevenue;
      cityNode.current_meetups += currentMeetups;
      cityNode.current_revenue += currentRevenue;
      cityNode.club_count++;
      cityNode.last_4w_revenue_total += last4wTotal;
      if (hasRevenueData) {
        cityNode.revenue_status_list.push(clubRevenueStatus);
      }

      // Get area node or create
      // Use composite ID to ensure uniqueness across activities and cities
      if (!cityNode.children.has(areaId)) {
        cityNode.children.set(areaId, {
          type: 'area',
          id: `activity:${activityId}-city:${cityId}-area:${areaId}`,
          name: club.area_name || 'Unknown',
          area_id: areaId,
          city_id: cityId,
          target_meetups: 0,
          target_revenue: 0,
          current_meetups: 0,
          current_revenue: 0,
          gap_meetups: 0,
          gap_revenue: 0,
          progress_summary: { ...defaultProgress },
          club_count: 0,
          last_4w_revenue_total: 0,
          revenue_status_list: [] as RevenueStatus[], // Collect for rollup
          children: []
        });
      }

      const areaNode = cityNode.children.get(areaId);
      areaNode.target_meetups += targetMeetups;
      areaNode.target_revenue += targetRevenue;
      areaNode.current_meetups += currentMeetups;
      areaNode.current_revenue += currentRevenue;
      areaNode.club_count++;
      areaNode.last_4w_revenue_total += last4wTotal;
      if (hasRevenueData) {
        areaNode.revenue_status_list.push(clubRevenueStatus);
      }

      // Validate progress using aggregated values
      const validation = validateProgress(targetMeetups, currentMeetups, aggregatedProgress);

      // Add club node with all context IDs for Quick Add
      // Use composite ID for consistency with parent nodes
      // Determine team based on activity-city assignment rules
      const team = getTeamForClub(club.activity_name, club.city_name || 'Unknown');

      // Build target children nodes (one per target)
      const targetChildren = targets.map((t, idx) => {
        const tMeetups = parseInt(t.target_meetups) || 0;
        const tRevenue = parseFloat(t.target_revenue) || 0;
        const targetId = parseInt(t.target_id);

        // Get auto-matched progress if available, otherwise use stored
        const autoMatchedTarget = autoMatchResult?.targets.find(mt => mt.target_id === targetId);
        const tProgress = autoMatchedTarget?.new_progress || t.progress || defaultProgress;
        const tValidation = validateProgress(tMeetups, 0, tProgress); // No current at target level

        // Get auto-matched current values if available
        const matchedMeetups = autoMatchedTarget?.matched_count || 0;
        const matchedRevenue = autoMatchedTarget?.matched_revenue || 0;

        // Get revenue status from auto-matching if available
        const tRevenueStatus = autoMatchedTarget?.revenue_status || null;

        // Build target name: use custom name if set, otherwise from dimensions, else default
        let targetName = t.target_name; // Custom name from DB
        if (!targetName) {
          const dimensionParts = [];
          if (t.day_type_name) dimensionParts.push(t.day_type_name);
          if (t.format_name) dimensionParts.push(t.format_name);
          targetName = dimensionParts.length > 0
            ? dimensionParts.join(' / ')
            : `Target ${idx + 1}`;
        }

        return {
          type: 'target',
          id: `activity:${activityId}-city:${cityId}-area:${areaId}-club:${clubId}-target:${t.target_id}`,
          name: targetName,
          club_id: clubId,
          activity_id: activityId,
          area_id: areaId,
          city_id: cityId,
          target_id: targetId,
          target_meetups: tMeetups,
          target_revenue: tRevenue,
          meetup_cost: parseFloat(t.meetup_cost) || null,
          meetup_capacity: parseInt(t.meetup_capacity) || null,
          day_type_id: t.day_type_id ? parseInt(t.day_type_id) : null,
          day_type_name: t.day_type_name || null,
          format_id: t.format_id ? parseInt(t.format_id) : null,
          // Use matched meetup/revenue counts when auto-matching is enabled
          current_meetups: matchedMeetups,
          current_revenue: matchedRevenue,
          gap_meetups: Math.max(0, tMeetups - matchedMeetups),
          gap_revenue: Math.max(0, tRevenue - matchedRevenue),
          progress_summary: tProgress,
          validation_status: tValidation.status,
          validation_message: tValidation.message,
          has_target: true,
          is_launch: false,
          team: team,
          // Add target-level revenue status when auto-matching
          revenue_status: tRevenueStatus,
          revenue_status_display: tRevenueStatus ? getRevenueStatusDisplay(tRevenueStatus) : null
        };
      });

      // Get day_type info from first target (for single-target clubs with day type)
      const primaryTarget = targets.length > 0 ? targets[0] : null;
      const dayTypeId = primaryTarget?.day_type_id ? parseInt(primaryTarget.day_type_id) : null;
      const dayTypeName = primaryTarget?.day_type_name || null;

      const clubNode = {
        type: 'club',
        id: `activity:${activityId}-city:${cityId}-area:${areaId}-club:${clubId}`,
        name: club.club_name,
        club_id: clubId,
        activity_id: parseInt(activityId),
        area_id: areaId,
        city_id: cityId,
        target_id: targets.length === 1 ? parseInt(targets[0].target_id) : null, // Only set if single target
        target_meetups: targetMeetups,
        target_revenue: targetRevenue,
        current_meetups: currentMeetups,
        current_revenue: currentRevenue,
        gap_meetups: gapMeetups,
        gap_revenue: gapRevenue,
        progress_summary: aggregatedProgress,
        validation_status: validation.status,
        validation_message: validation.message,
        has_target: hasTargets,
        is_launch: false,
        last_4w_revenue_total: last4wTotal,
        last_4w_revenue_avg: last4wAvg,
        team: team,
        target_count: targets.length, // Number of targets for this club
        day_type_id: dayTypeId,
        day_type_name: dayTypeName,
        revenue_status: hasRevenueData ? clubRevenueStatus : null,
        revenue_status_display: hasRevenueData ? getRevenueStatusDisplay(clubRevenueStatus) : null,
        children: targetChildren.length > 1 ? targetChildren : undefined // Only show children when 2+ targets
      };

      areaNode.children.push(clubNode);

      // Roll up progress only if club has targets
      if (hasTargets) {
        areaNode.progress_summary = sumProgress([areaNode.progress_summary, aggregatedProgress]);
      }
    }

    // Process expansion targets - clubs with targets in areas different from their home area
    // Collect unique expansion area_ids (areas where targets exist but not the club's home area)
    const expansionTargets: { club: any, target: any, expansionAreaId: number }[] = [];
    for (const club of clubsToProcess) {
      const clubId = parseInt(club.club_id);
      const homeAreaId = parseInt(club.area_id) || 0;
      const targets = targetsMap.get(clubId) || [];

      for (const target of targets) {
        const targetAreaId = target.target_area_id ? parseInt(target.target_area_id) : null;
        // If target has a different area than the club's home area, it's an expansion
        if (targetAreaId && targetAreaId !== homeAreaId) {
          expansionTargets.push({ club, target, expansionAreaId: targetAreaId });
        }
      }
    }

    // Process expansion targets if any
    if (expansionTargets.length > 0) {
      // Get unique expansion area IDs
      const expansionAreaIds = [...new Set(expansionTargets.map(e => e.expansionAreaId))];

      // Fetch area info from production for expansion areas
      const areaInfoQuery = `
        SELECT ar.id, ar.name as area_name, ci.id as city_id, ci.name as city_name
        FROM area ar
        JOIN city ci ON ar.city_id = ci.id
        WHERE ar.id = ANY($1)
      `;
      const areaInfoResult = await queryProduction(areaInfoQuery, [expansionAreaIds]);
      const expansionAreaInfo = new Map(areaInfoResult.rows.map((a: any) => [parseInt(a.id), a]));

      // Group expansion targets by (club_id, expansion_area_id)
      const expansionsByClubArea = new Map<string, { club: any, targets: any[], areaInfo: any }>();
      for (const { club, target, expansionAreaId } of expansionTargets) {
        const key = `${club.club_id}-${expansionAreaId}`;
        if (!expansionsByClubArea.has(key)) {
          expansionsByClubArea.set(key, {
            club,
            targets: [],
            areaInfo: expansionAreaInfo.get(expansionAreaId)
          });
        }
        expansionsByClubArea.get(key)!.targets.push(target);
      }

      // Create virtual club entries for each expansion
      for (const [, { club, targets, areaInfo }] of expansionsByClubArea) {
        if (!areaInfo) continue; // Skip if area info not found

        const activityId = parseInt(club.activity_id);
        const cityId = parseInt(areaInfo.city_id);
        const areaId = parseInt(areaInfo.id);
        const clubId = parseInt(club.club_id);

        // Aggregate targets for this expansion
        const targetMeetups = targets.reduce((sum: number, t: any) => sum + (parseInt(t.target_meetups) || 0), 0);
        const targetRevenue = targets.reduce((sum: number, t: any) => sum + (parseFloat(t.target_revenue) || 0), 0);

        // For expansion areas, current meetups/revenue = 0 (no events there yet)
        const currentMeetups = 0;
        const currentRevenue = 0;

        // Aggregate progress
        const aggregatedProgress = targets.reduce((acc: any, t: any) => {
          const p = t.progress || defaultProgress;
          return sumProgress([acc, p]);
        }, { ...defaultProgress });

        // Get team assignment
        const team = getTeamForClub(club.activity_name, areaInfo.city_name);

        // Ensure activity node exists
        if (!activityMap.has(activityId)) {
          activityMap.set(activityId, {
            type: 'activity',
            id: `activity:${activityId}`,
            name: club.activity_name,
            activity_id: activityId,
            target_meetups: 0,
            target_revenue: 0,
            current_meetups: 0,
            current_revenue: 0,
            gap_meetups: 0,
            gap_revenue: 0,
            progress_summary: { ...defaultProgress },
            club_count: 0,
            last_4w_revenue_total: 0,
            revenue_status_list: [],
            children: new Map<number, any>()
          });
        }

        const activityNode = activityMap.get(activityId);
        activityNode.target_meetups += targetMeetups;
        activityNode.target_revenue += targetRevenue;

        // Ensure city node exists
        if (!activityNode.children.has(cityId)) {
          activityNode.children.set(cityId, {
            type: 'city',
            id: `activity:${activityId}-city:${cityId}`,
            name: areaInfo.city_name,
            city_id: cityId,
            target_meetups: 0,
            target_revenue: 0,
            current_meetups: 0,
            current_revenue: 0,
            gap_meetups: 0,
            gap_revenue: 0,
            progress_summary: { ...defaultProgress },
            club_count: 0,
            last_4w_revenue_total: 0,
            revenue_status_list: [],
            children: new Map<number, any>()
          });
        }

        const cityNode = activityNode.children.get(cityId);
        cityNode.target_meetups += targetMeetups;
        cityNode.target_revenue += targetRevenue;

        // Ensure area node exists
        if (!cityNode.children.has(areaId)) {
          cityNode.children.set(areaId, {
            type: 'area',
            id: `activity:${activityId}-city:${cityId}-area:${areaId}`,
            name: areaInfo.area_name,
            area_id: areaId,
            city_id: cityId,
            target_meetups: 0,
            target_revenue: 0,
            current_meetups: 0,
            current_revenue: 0,
            gap_meetups: 0,
            gap_revenue: 0,
            progress_summary: { ...defaultProgress },
            club_count: 0,
            last_4w_revenue_total: 0,
            revenue_status_list: [],
            children: []
          });
        }

        const areaNode = cityNode.children.get(areaId);
        areaNode.target_meetups += targetMeetups;
        areaNode.target_revenue += targetRevenue;

        // Build target children for this expansion
        const targetChildren = targets.map((t: any, idx: number) => {
          const tMeetups = parseInt(t.target_meetups) || 0;
          const tRevenue = parseFloat(t.target_revenue) || 0;
          const targetId = parseInt(t.target_id);
          const tProgress = t.progress || defaultProgress;

          let targetName = t.target_name;
          if (!targetName) {
            const dimensionParts = [];
            if (t.day_type_name) dimensionParts.push(t.day_type_name);
            if (t.format_name) dimensionParts.push(t.format_name);
            targetName = dimensionParts.length > 0
              ? dimensionParts.join(' / ')
              : `Target ${idx + 1}`;
          }

          return {
            type: 'target',
            id: `activity:${activityId}-city:${cityId}-area:${areaId}-club:${clubId}-target:${targetId}`,
            name: targetName,
            club_id: clubId,
            activity_id: activityId,
            area_id: areaId,
            city_id: cityId,
            target_id: targetId,
            target_meetups: tMeetups,
            target_revenue: tRevenue,
            meetup_cost: parseFloat(t.meetup_cost) || null,
            meetup_capacity: parseInt(t.meetup_capacity) || null,
            day_type_id: t.day_type_id ? parseInt(t.day_type_id) : null,
            day_type_name: t.day_type_name || null,
            format_id: t.format_id ? parseInt(t.format_id) : null,
            current_meetups: 0,
            current_revenue: 0,
            gap_meetups: Math.max(0, tMeetups),
            gap_revenue: Math.max(0, tRevenue),
            progress_summary: tProgress,
            has_target: true,
            is_launch: false,
            is_expansion: true, // Mark as expansion target
            team: team
          };
        });

        // Create virtual club node for this expansion (marked as expansion)
        const expansionClubNode = {
          type: 'club',
          id: `activity:${activityId}-city:${cityId}-area:${areaId}-club:${clubId}-expansion`,
          name: `${club.club_name} (Expansion)`,
          club_id: clubId,
          activity_id: activityId,
          area_id: areaId,
          city_id: cityId,
          target_id: targets.length === 1 ? parseInt(targets[0].target_id) : null, // Set target_id for single target
          target_meetups: targetMeetups,
          target_revenue: targetRevenue,
          current_meetups: currentMeetups,
          current_revenue: currentRevenue,
          gap_meetups: Math.max(0, targetMeetups - currentMeetups),
          gap_revenue: Math.max(0, targetRevenue - currentRevenue),
          progress_summary: aggregatedProgress,
          has_target: true,
          is_launch: false,
          is_expansion: true, // Mark as expansion
          team: team,
          target_count: targets.length,
          children: targetChildren.length > 1 ? targetChildren : undefined
        };

        areaNode.children.push(expansionClubNode);
        areaNode.club_count = (areaNode.club_count || 0) + 1;
        areaNode.progress_summary = sumProgress([areaNode.progress_summary, aggregatedProgress]);

        cityNode.club_count = (cityNode.club_count || 0) + 1;
        activityNode.club_count = (activityNode.club_count || 0) + 1;
      }
    }

    // Process launches and add to hierarchy
    let launchCount = 0;
    if (includeLaunches && launchesData.length > 0) {
      // Get activity name to ID mapping from production
      const activityMapQuery = `SELECT id, name FROM activity WHERE name != 'Test'`;
      const activityMapResult = await queryProduction(activityMapQuery);
      const activityNameToId = new Map(activityMapResult.rows.map((a: any) => [a.name, parseInt(a.id)]));

      // Get area info from production for launches
      const areaInfoQuery = `
        SELECT ar.id, ar.name, ci.id as city_id, ci.name as city_name
        FROM area ar
        JOIN city ci ON ar.city_id = ci.id
      `;
      const areaInfoResult = await queryProduction(areaInfoQuery);
      const areaNameToInfo = new Map(areaInfoResult.rows.map((a: any) => [a.name.toLowerCase(), a]));

      for (const launch of launchesData) {
        const activityId = activityNameToId.get(launch.activity_name);
        if (!activityId) continue; // Skip if activity not found

        // Get launch target (may have area_id)
        const launchTarget = launchTargetsMap.get(launch.launch_id);
        const targetAreaId = launchTarget?.area_id ? parseInt(launchTarget.area_id) : null;

        // Get area info - try by area_id from target first, then by area name
        // This ensures launches are placed in the correct city/area hierarchy
        let areaInfo = targetAreaId ?
          areaInfoResult.rows.find((a: any) => parseInt(a.id) === targetAreaId) :
          areaNameToInfo.get((launch.planned_area || '').toLowerCase());

        if (!areaInfo) {
          // Create a placeholder for launches without area info
          areaInfo = { id: 0, name: launch.planned_area || 'Unknown', city_id: 0, city_name: launch.planned_city || 'Unknown' };
        }

        const cityId = parseInt(areaInfo.city_id) || 0;
        const areaId = parseInt(areaInfo.id) || 0;

        // Use launchTarget from earlier lookup (used for area_id resolution)
        const targetMeetups = launchTarget?.target_meetups || 0;
        const targetRevenue = launchTarget?.target_revenue || parseFloat(launch.target_revenue_rupees) || 0;
        const progress = launchTarget?.progress || defaultProgress;

        // Launches have no current meetups/revenue (they're planned)
        const currentMeetups = 0;
        const currentRevenue = 0;
        const gapMeetups = Math.max(0, targetMeetups - currentMeetups);
        const gapRevenue = Math.max(0, targetRevenue - currentRevenue);

        // Ensure activity node exists
        if (!activityMap.has(activityId)) {
          const activityName = launch.activity_name;
          activityMap.set(activityId, {
            type: 'activity',
            id: `activity:${activityId}`,
            name: activityName,
            activity_id: activityId,
            target_meetups: 0,
            target_revenue: 0,
            current_meetups: 0,
            current_revenue: 0,
            gap_meetups: 0,
            gap_revenue: 0,
            progress_summary: { ...defaultProgress },
            club_count: 0,
            launch_count: 0,
            children: new Map<number, any>()
          });
        }

        const activityNode = activityMap.get(activityId);
        activityNode.target_meetups += targetMeetups;
        activityNode.target_revenue += targetRevenue;
        if (!activityNode.launch_count) activityNode.launch_count = 0;
        activityNode.launch_count++;

        // Ensure city node exists
        // Use composite ID to ensure uniqueness across activities
        if (!activityNode.children.has(cityId)) {
          activityNode.children.set(cityId, {
            type: 'city',
            id: `activity:${activityId}-city:${cityId}`,
            name: areaInfo.city_name || 'Unknown',
            city_id: cityId,
            target_meetups: 0,
            target_revenue: 0,
            current_meetups: 0,
            current_revenue: 0,
            gap_meetups: 0,
            gap_revenue: 0,
            progress_summary: { ...defaultProgress },
            club_count: 0,
            launch_count: 0,
            children: new Map<number, any>()
          });
        }

        const cityNode = activityNode.children.get(cityId);
        cityNode.target_meetups += targetMeetups;
        cityNode.target_revenue += targetRevenue;
        if (!cityNode.launch_count) cityNode.launch_count = 0;
        cityNode.launch_count++;

        // Ensure area node exists
        // Use composite ID to ensure uniqueness across activities and cities
        if (!cityNode.children.has(areaId)) {
          cityNode.children.set(areaId, {
            type: 'area',
            id: `activity:${activityId}-city:${cityId}-area:${areaId}`,
            name: areaInfo.name || 'Unknown',
            area_id: areaId,
            city_id: cityId,
            target_meetups: 0,
            target_revenue: 0,
            current_meetups: 0,
            current_revenue: 0,
            gap_meetups: 0,
            gap_revenue: 0,
            progress_summary: { ...defaultProgress },
            club_count: 0,
            launch_count: 0,
            children: []
          });
        }

        const areaNode = cityNode.children.get(areaId);
        areaNode.target_meetups += targetMeetups;
        areaNode.target_revenue += targetRevenue;
        if (!areaNode.launch_count) areaNode.launch_count = 0;
        areaNode.launch_count++;

        // Validate progress
        const validation = validateProgress(targetMeetups, currentMeetups, progress);

        // Add launch node
        // Use composite ID for consistency with parent nodes
        // Determine team assignment based on activity and city
        const launchTeam = getTeamForClub(launch.activity_name, areaInfo.city_name || 'Unknown');

        const launchNode = {
          type: 'launch',
          id: `activity:${activityId}-city:${cityId}-area:${areaId}-launch:${launch.launch_id}`,
          name: launch.planned_club_name || `New ${launch.activity_name} Club`,
          launch_id: launch.launch_id,
          activity_id: activityId,
          activity_name: launch.activity_name,
          area_id: areaId,
          city_id: cityId,
          target_id: launchTarget?.target_id || null,
          target_meetups: targetMeetups,
          target_revenue: targetRevenue,
          current_meetups: currentMeetups,
          current_revenue: currentRevenue,
          gap_meetups: gapMeetups,
          gap_revenue: gapRevenue,
          progress_summary: progress,
          validation_status: validation.status,
          validation_message: validation.message,
          has_target: !!launchTarget || targetMeetups > 0,
          is_launch: true,
          launch_status: launch.launch_status,
          planned_launch_date: launch.planned_launch_date,
          milestones: launch.milestones,
          team: launchTeam
        };

        areaNode.children.push(launchNode);
        launchCount++;

        // Roll up progress
        if (launchTarget || targetMeetups > 0) {
          areaNode.progress_summary = sumProgress([areaNode.progress_summary, progress]);
        }
      }
    }

    // Convert maps to arrays and calculate gaps/validations
    const hierarchy: any[] = [];

    for (const [, activityNode] of activityMap) {
      const cityNodes: any[] = [];
      const activityName = activityNode.name; // Capture activity name for children

      for (const [, cityNode] of activityNode.children) {
        const areaNodes: any[] = [];
        const cityName = cityNode.name; // Capture city name for children

        // Add parent names to city node for task summary matching
        cityNode.activity_name = activityName;
        cityNode.city_name = cityName; // Set city_name on itself for consistency

        for (const [, areaNode] of cityNode.children) {
          // Add parent names to area node for task summary matching
          areaNode.activity_name = activityName;
          areaNode.city_name = cityName;
          areaNode.area_name = areaNode.name; // Set area_name on itself for consistency

          // Add parent names to children (clubs/launches) for task summary matching
          if (areaNode.children && Array.isArray(areaNode.children)) {
            for (const child of areaNode.children) {
              child.activity_name = activityName;
              child.city_name = cityName;
              child.area_name = areaNode.name;
              // Also propagate to target children if they exist
              if (child.children && Array.isArray(child.children)) {
                for (const target of child.children) {
                  target.activity_name = activityName;
                  target.city_name = cityName;
                  target.area_name = areaNode.name;
                  target.club_name = child.name;
                }
              }
            }
          }

          // Gap should not be negative
          areaNode.gap_meetups = Math.max(0, areaNode.target_meetups - areaNode.current_meetups);
          areaNode.gap_revenue = Math.max(0, areaNode.target_revenue - areaNode.current_revenue);
          // Calculate last 4w avg for area (total / 4 for consistent weekly average)
          areaNode.last_4w_revenue_avg = areaNode.last_4w_revenue_total / 4;
          const areaValidation = validateProgress(areaNode.target_meetups, areaNode.current_meetups, areaNode.progress_summary);
          areaNode.validation_status = areaValidation.status;
          areaNode.validation_message = areaValidation.message;
          // Roll up revenue status for area
          const areaRevenueStatusList = areaNode.revenue_status_list || [];
          areaNode.revenue_status = areaRevenueStatusList.length > 0
            ? rollupRevenueStatuses(areaRevenueStatusList)
            : null;
          areaNode.revenue_status_display = areaNode.revenue_status
            ? getRevenueStatusDisplay(areaNode.revenue_status)
            : null;
          delete areaNode.revenue_status_list; // Clean up temporary list
          areaNodes.push(areaNode);
        }

        cityNode.children = areaNodes;
        cityNode.area_count = areaNodes.length;
        // Gap should not be negative
        cityNode.gap_meetups = Math.max(0, cityNode.target_meetups - cityNode.current_meetups);
        cityNode.gap_revenue = Math.max(0, cityNode.target_revenue - cityNode.current_revenue);
        // Calculate last 4w avg for city
        cityNode.last_4w_revenue_avg = cityNode.last_4w_revenue_total / 4;
        cityNode.progress_summary = sumProgress(areaNodes.map(a => a.progress_summary));
        const cityValidation = validateProgress(cityNode.target_meetups, cityNode.current_meetups, cityNode.progress_summary);
        cityNode.validation_status = cityValidation.status;
        cityNode.validation_message = cityValidation.message;
        // Roll up revenue status for city
        const cityRevenueStatusList = cityNode.revenue_status_list || [];
        cityNode.revenue_status = cityRevenueStatusList.length > 0
          ? rollupRevenueStatuses(cityRevenueStatusList)
          : null;
        cityNode.revenue_status_display = cityNode.revenue_status
          ? getRevenueStatusDisplay(cityNode.revenue_status)
          : null;
        delete cityNode.revenue_status_list; // Clean up temporary list
        cityNodes.push(cityNode);
      }

      activityNode.children = cityNodes;
      activityNode.city_count = cityNodes.length;
      // Gap should not be negative
      activityNode.gap_meetups = Math.max(0, activityNode.target_meetups - activityNode.current_meetups);
      activityNode.gap_revenue = Math.max(0, activityNode.target_revenue - activityNode.current_revenue);
      // Calculate last 4w avg for activity
      activityNode.last_4w_revenue_avg = activityNode.last_4w_revenue_total / 4;
      activityNode.progress_summary = sumProgress(cityNodes.map(c => c.progress_summary));
      const activityValidation = validateProgress(activityNode.target_meetups, activityNode.current_meetups, activityNode.progress_summary);
      activityNode.validation_status = activityValidation.status;
      activityNode.validation_message = activityValidation.message;
      // Roll up revenue status for activity
      const activityRevenueStatusList = activityNode.revenue_status_list || [];
      activityNode.revenue_status = activityRevenueStatusList.length > 0
        ? rollupRevenueStatuses(activityRevenueStatusList)
        : null;
      activityNode.revenue_status_display = activityNode.revenue_status
        ? getRevenueStatusDisplay(activityNode.revenue_status)
        : null;
      delete activityNode.revenue_status_list; // Clean up temporary list
      hierarchy.push(activityNode);
    }

    // Calculate overall summary
    const overallProgress = sumProgress(hierarchy.map(a => a.progress_summary));
    const totalTargetMeetups = hierarchy.reduce((sum, a) => sum + a.target_meetups, 0);
    const totalTargetRevenue = hierarchy.reduce((sum, a) => sum + a.target_revenue, 0);
    const totalCurrentMeetups = hierarchy.reduce((sum, a) => sum + a.current_meetups, 0);
    const totalCurrentRevenue = hierarchy.reduce((sum, a) => sum + a.current_revenue, 0);
    const totalLast4wRevenue = hierarchy.reduce((sum, a) => sum + (a.last_4w_revenue_total || 0), 0);

    res.json({
      success: true,
      hierarchy,
      summary: {
        total_activities: hierarchy.length,
        total_cities: hierarchy.reduce((sum, a) => sum + (a.city_count || 0), 0),
        total_areas: hierarchy.reduce((sum, a) => sum + a.children.reduce((s: number, c: any) => s + (c.area_count || 0), 0), 0),
        total_clubs: clubsToProcess.length,
        total_launches: launchCount,
        total_target_meetups: totalTargetMeetups,
        total_target_revenue: totalTargetRevenue,
        total_current_meetups: totalCurrentMeetups,
        total_current_revenue: totalCurrentRevenue,
        overall_progress: overallProgress,
        overall_validation_status: validateProgress(totalTargetMeetups, totalCurrentMeetups, overallProgress).status,
        // Monthly projections (weekly × 4.2)
        monthly_target_meetups: Math.round(totalTargetMeetups * 4.2),
        monthly_target_revenue: Math.round(totalTargetRevenue * 4.2),
        // Last 4 weeks totals
        last_4w_revenue_total: totalLast4wRevenue,
        last_4w_revenue_avg: totalLast4wRevenue / 4,
        // March 2026 specific
        march_2026_revenue: march2026Revenue
      }
    });
  } catch (error) {
    logger.error('Failed to fetch V2 hierarchy:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch hierarchy',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/targets/v2/trends - Get 3-week trends
router.get('/v2/trends', async (req, res) => {
  try {
    const { activity_id } = req.query;

    // Get weekly metrics for the last 3 weeks from production
    const trendsQuery = `
      SELECT
        DATE_TRUNC('week', e.start_time) as week_start,
        COUNT(DISTINCT e.pk) as meetups,
        COALESCE(SUM(
          CASE WHEN p.state = 'COMPLETED' THEN p.amount / 100.0 ELSE 0 END
        ), 0) as revenue
      FROM event e
      LEFT JOIN club c ON e.club_id = c.pk
      LEFT JOIN booking b ON b.event_id = e.pk
      LEFT JOIN transaction t ON t.entity_id = b.id AND t.entity_type = 'BOOKING'
      LEFT JOIN payment p ON p.pk = t.payment_id
      WHERE e.start_time >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '3 weeks'
        AND e.start_time < DATE_TRUNC('week', CURRENT_DATE) + INTERVAL '1 week'
        AND e.state = 'CREATED'
        AND c.is_private = false
        ${activity_id ? 'AND c.activity_id = $1' : ''}
      GROUP BY DATE_TRUNC('week', e.start_time)
      ORDER BY week_start
    `;

    const params = activity_id ? [parseInt(activity_id as string)] : [];
    const result = await queryProduction(trendsQuery, params);

    // Format weeks
    const weeks = result.rows.map((row: any) => {
      const weekStart = new Date(row.week_start);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      return {
        week_start: weekStart.toISOString().split('T')[0],
        week_end: weekEnd.toISOString().split('T')[0],
        week_label: `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
        meetups: parseInt(row.meetups || 0),
        revenue: parseFloat(row.revenue || 0)
      };
    });

    // Calculate summary
    const totalMeetups = weeks.reduce((sum, w) => sum + w.meetups, 0);
    const totalRevenue = weeks.reduce((sum, w) => sum + w.revenue, 0);
    const avgMeetupsPerWeek = weeks.length > 0 ? totalMeetups / weeks.length : 0;
    const avgRevenuePerWeek = weeks.length > 0 ? totalRevenue / weeks.length : 0;

    // Calculate trend (compare last week to previous week)
    let trendDirection: 'up' | 'down' | 'stable' = 'stable';
    let trendPercentage = 0;

    if (weeks.length >= 2) {
      const lastWeek = weeks[weeks.length - 1];
      const prevWeek = weeks[weeks.length - 2];
      if (prevWeek.meetups > 0) {
        trendPercentage = ((lastWeek.meetups - prevWeek.meetups) / prevWeek.meetups) * 100;
        if (trendPercentage > 5) trendDirection = 'up';
        else if (trendPercentage < -5) trendDirection = 'down';
      }
    }

    res.json({
      success: true,
      weeks,
      summary: {
        total_meetups: totalMeetups,
        total_revenue: totalRevenue,
        avg_meetups_per_week: Math.round(avgMeetupsPerWeek),
        avg_revenue_per_week: Math.round(avgRevenuePerWeek),
        trend_direction: trendDirection,
        trend_percentage: Math.round(trendPercentage * 10) / 10
      }
    });
  } catch (error) {
    logger.error('Failed to fetch V2 trends:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch trends',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// =====================================================
// V2 LAUNCH ENDPOINTS
// =====================================================

// POST /api/targets/v2/launches - Create new club launch
router.post('/v2/launches', async (req, res) => {
  try {
    const {
      activity_name,
      planned_club_name,
      area_id,
      planned_city,
      planned_area,
      planned_launch_date,
      target_meetups,
      target_revenue,
      day_type_id,
      format_id,
      meetup_cost,
      meetup_capacity
    } = req.body;

    // Auto-calculate target_revenue if meetup_cost and meetup_capacity are provided
    let finalTargetRevenue = target_revenue || 0;
    if (meetup_cost !== undefined && meetup_capacity !== undefined && target_meetups) {
      finalTargetRevenue = calculateTargetRevenue(target_meetups, meetup_cost, meetup_capacity);
    }

    // Validate required fields
    if (!activity_name) {
      return res.status(400).json({
        success: false,
        error: 'Activity name is required'
      });
    }

    // Get area info if area_id provided
    let cityName = planned_city;
    let areaName = planned_area;

    // Resolve area_id: Frontend passes production_area_id, we need dim_areas.id
    let resolvedAreaId: number | null = null;

    if (area_id) {
      const areaResult = await queryProduction(`
        SELECT ar.name as area_name, ci.name as city_name, ci.id as city_id
        FROM area ar
        JOIN city ci ON ar.city_id = ci.id
        WHERE ar.id = $1
      `, [area_id]);

      if (areaResult.rows.length > 0) {
        areaName = areaResult.rows[0].area_name;
        cityName = areaResult.rows[0].city_name;
        const prodCityId = areaResult.rows[0].city_id;

        // Look up dim_areas by production_area_id (not by id)
        const areaByProdId = await queryLocal(
          `SELECT id FROM dim_areas WHERE production_area_id = $1`,
          [area_id]
        );

        if (areaByProdId.rows.length > 0) {
          resolvedAreaId = areaByProdId.rows[0].id;
        } else {
          // Area doesn't exist - create it
          const cityByProdId = await queryLocal(
            `SELECT id FROM dim_cities WHERE production_city_id = $1`,
            [prodCityId]
          );

          let dimCityId: number;
          if (cityByProdId.rows.length > 0) {
            dimCityId = cityByProdId.rows[0].id;
          } else {
            const newCity = await queryLocal(
              `INSERT INTO dim_cities (city_name, production_city_id) VALUES ($1, $2)
               ON CONFLICT (city_name) DO UPDATE SET production_city_id = $2
               RETURNING id`,
              [cityName, prodCityId]
            );
            dimCityId = newCity.rows[0].id;
          }

          const newArea = await queryLocal(
            `INSERT INTO dim_areas (area_name, city_id, production_area_id, is_custom, is_active)
             VALUES ($1, $2, $3, FALSE, TRUE)
             ON CONFLICT (area_name, city_id) DO UPDATE SET production_area_id = $3
             RETURNING id`,
            [areaName, dimCityId, area_id]
          );
          resolvedAreaId = newArea.rows[0].id;
        }
      }
    }

    // Insert into new_club_launches
    const launchResult = await queryLocal(`
      INSERT INTO new_club_launches (
        activity_name, planned_club_name, planned_city, planned_area,
        planned_launch_date, target_revenue_rupees, launch_status
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'planned')
      RETURNING *
    `, [
      activity_name,
      planned_club_name || `New ${activity_name} Club`,
      cityName || null,
      areaName || null,
      planned_launch_date || null,
      finalTargetRevenue
    ]);

    const launchId = launchResult.rows[0].id;

    // If target_meetups or dimensions provided, create launch_dimensional_target
    if (target_meetups || resolvedAreaId || day_type_id || format_id) {
      // Set initial progress with all target_meetups in "not_picked" stage
      const initialProgress = {
        not_picked: target_meetups || 0,
        started: 0,
        stage_1: 0,
        stage_2: 0,
        stage_3: 0,
        stage_4: 0,
        realised: 0
      };

      await queryLocal(`
        INSERT INTO launch_dimensional_targets (
          launch_id, activity_name, area_id, day_type_id, format_id,
          target_meetups, target_revenue, progress,
          meetup_cost, meetup_capacity
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        launchId,
        activity_name,
        resolvedAreaId || null,  // Use resolved dim_areas.id, not production area_id
        day_type_id || null,
        format_id || null,
        target_meetups || 0,
        finalTargetRevenue,
        JSON.stringify(initialProgress),
        meetup_cost || null,
        meetup_capacity || null
      ]);
    }

    logger.info(`Created new club launch: ${launchId} - ${planned_club_name || activity_name}`);

    res.json({
      success: true,
      launch: launchResult.rows[0],
      message: 'Club launch created successfully'
    });
  } catch (error) {
    logger.error('Failed to create club launch:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create club launch',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// PUT /api/targets/v2/launches/:launchId - Update launch details
router.put('/v2/launches/:launchId', async (req, res) => {
  try {
    const launchId = parseInt(req.params.launchId);
    const {
      planned_club_name,
      planned_launch_date,
      launch_status,
      target_meetups,
      target_revenue,
      meetup_cost,
      meetup_capacity
    } = req.body;

    // Auto-calculate target_revenue if meetup_cost and meetup_capacity are provided
    let finalTargetRevenue = target_revenue;
    if (meetup_cost !== undefined && meetup_capacity !== undefined && target_meetups !== undefined) {
      finalTargetRevenue = calculateTargetRevenue(target_meetups, meetup_cost, meetup_capacity);
    }

    // Update launch
    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramIndex = 1;

    if (planned_club_name !== undefined) {
      updateFields.push(`planned_club_name = $${paramIndex++}`);
      updateValues.push(planned_club_name);
    }
    if (planned_launch_date !== undefined) {
      updateFields.push(`planned_launch_date = $${paramIndex++}`);
      updateValues.push(planned_launch_date);
    }
    if (launch_status !== undefined) {
      updateFields.push(`launch_status = $${paramIndex++}`);
      updateValues.push(launch_status);
    }
    if (finalTargetRevenue !== undefined) {
      updateFields.push(`target_revenue_rupees = $${paramIndex++}`);
      updateValues.push(finalTargetRevenue);
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    updateValues.push(launchId);

    const result = await queryLocal(`
      UPDATE new_club_launches
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, updateValues);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Launch not found'
      });
    }

    // Update dimensional target if target_meetups or cost/capacity provided
    if (target_meetups !== undefined || meetup_cost !== undefined || meetup_capacity !== undefined) {
      await queryLocal(`
        UPDATE launch_dimensional_targets
        SET
          target_meetups = COALESCE($1, target_meetups),
          target_revenue = COALESCE($2, target_revenue),
          meetup_cost = COALESCE($3, meetup_cost),
          meetup_capacity = COALESCE($4, meetup_capacity),
          updated_at = CURRENT_TIMESTAMP
        WHERE launch_id = $5
      `, [target_meetups, finalTargetRevenue, meetup_cost, meetup_capacity, launchId]);
    }

    res.json({
      success: true,
      launch: result.rows[0],
      message: 'Launch updated successfully'
    });
  } catch (error) {
    logger.error(`Failed to update launch ${req.params.launchId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to update launch',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// PUT /api/targets/v2/launches/:launchId/progress - Update launch stage progress
router.put('/v2/launches/:launchId/progress', async (req, res) => {
  try {
    const launchId = parseInt(req.params.launchId);
    const { progress } = req.body;

    if (!progress) {
      return res.status(400).json({
        success: false,
        error: 'Progress object is required'
      });
    }

    // Validate progress object has required fields
    const requiredFields = ['not_picked', 'started', 'stage_1', 'stage_2', 'stage_3', 'stage_4', 'realised'];
    for (const field of requiredFields) {
      if (typeof progress[field] !== 'number' || progress[field] < 0) {
        return res.status(400).json({
          success: false,
          error: `Invalid or missing progress field: ${field}`
        });
      }
    }

    // Get target to validate sum matches target_meetups
    const targetResult = await queryLocal(
      `SELECT target_meetups FROM launch_dimensional_targets WHERE launch_id = $1`,
      [launchId]
    );

    if (targetResult.rows.length > 0) {
      const targetMeetups = targetResult.rows[0].target_meetups || 0;
      const stageSum = progress.not_picked + progress.started + progress.stage_1 +
        progress.stage_2 + progress.stage_3 + progress.stage_4 + progress.realised;

      if (targetMeetups > 0 && stageSum !== targetMeetups) {
        return res.status(400).json({
          success: false,
          error: `Stage distribution sum (${stageSum}) must equal target meetups (${targetMeetups})`,
          validation: {
            stage_sum: stageSum,
            target_meetups: targetMeetups,
            difference: stageSum - targetMeetups
          }
        });
      }
    }

    // Update progress in launch_dimensional_targets
    const result = await queryLocal(`
      UPDATE launch_dimensional_targets
      SET progress = $1, updated_at = CURRENT_TIMESTAMP
      WHERE launch_id = $2
      RETURNING *
    `, [JSON.stringify(progress), launchId]);

    if (result.rows.length === 0) {
      // If no dimensional target exists, create one
      const launchResult = await queryLocal(`SELECT activity_name FROM new_club_launches WHERE id = $1`, [launchId]);
      if (launchResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Launch not found'
        });
      }

      await queryLocal(`
        INSERT INTO launch_dimensional_targets (launch_id, activity_name, progress)
        VALUES ($1, $2, $3)
      `, [launchId, launchResult.rows[0].activity_name, JSON.stringify(progress)]);
    }

    res.json({
      success: true,
      progress,
      message: 'Launch progress updated successfully'
    });
  } catch (error) {
    logger.error(`Failed to update launch progress ${req.params.launchId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to update launch progress',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// DELETE /api/targets/v2/launches/:launchId - Delete launch
router.delete('/v2/launches/:launchId', async (req, res) => {
  try {
    const launchId = parseInt(req.params.launchId);

    // Delete dimensional targets first
    await queryLocal(`DELETE FROM launch_dimensional_targets WHERE launch_id = $1`, [launchId]);

    // Delete the launch
    const result = await queryLocal(`
      DELETE FROM new_club_launches WHERE id = $1 RETURNING *
    `, [launchId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Launch not found'
      });
    }

    logger.info(`Deleted launch: ${launchId}`);

    res.json({
      success: true,
      message: 'Launch deleted successfully'
    });
  } catch (error) {
    logger.error(`Failed to delete launch ${req.params.launchId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete launch',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/targets/v2/launches/:launchId/transition - Transition launch to existing club
router.post('/v2/launches/:launchId/transition', async (req, res) => {
  try {
    const launchId = parseInt(req.params.launchId);
    const { club_id, club_uuid, transfer_targets } = req.body;

    if (!club_id) {
      return res.status(400).json({
        success: false,
        error: 'club_id is required'
      });
    }

    // Get launch info
    const launchResult = await queryLocal(`
      SELECT * FROM new_club_launches WHERE id = $1
    `, [launchId]);

    if (launchResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Launch not found'
      });
    }

    const launch = launchResult.rows[0];

    // Get launch dimensional targets
    const launchTargetResult = await queryLocal(`
      SELECT * FROM launch_dimensional_targets WHERE launch_id = $1
    `, [launchId]);

    // Update launch status and link to club
    await queryLocal(`
      UPDATE new_club_launches
      SET launch_status = 'launched', actual_club_id = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [club_uuid || club_id, launchId]);

    // Transfer targets if requested
    if (transfer_targets && launchTargetResult.rows.length > 0) {
      const launchTarget = launchTargetResult.rows[0];

      // Get activity_id from activity_name
      const activityResult = await queryProduction(`
        SELECT id FROM activity WHERE name = $1
      `, [launch.activity_name]);

      const activityId = activityResult.rows[0]?.id;

      // Create club dimensional target
      await queryLocal(`
        INSERT INTO club_dimensional_targets (
          club_id, activity_id, area_id, day_type_id, format_id,
          target_meetups, target_revenue, progress
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (club_id, COALESCE(area_id, -1), COALESCE(day_type_id, -1), COALESCE(format_id, -1))
        DO UPDATE SET
          target_meetups = EXCLUDED.target_meetups,
          target_revenue = EXCLUDED.target_revenue,
          progress = EXCLUDED.progress,
          updated_at = CURRENT_TIMESTAMP
      `, [
        club_id,
        activityId,
        launchTarget.area_id,
        launchTarget.day_type_id,
        launchTarget.format_id,
        launchTarget.target_meetups,
        launchTarget.target_revenue,
        launchTarget.progress
      ]);
    }

    logger.info(`Transitioned launch ${launchId} to club ${club_id}`);

    res.json({
      success: true,
      message: 'Launch transitioned to club successfully',
      club_id,
      launch_id: launchId
    });
  } catch (error) {
    logger.error(`Failed to transition launch ${req.params.launchId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to transition launch',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/targets/v2/launches - Get all launches (for dropdown selection etc)
router.get('/v2/launches', async (req, res) => {
  try {
    const { status } = req.query;

    let query = `
      SELECT
        ncl.*,
        ldt.target_meetups,
        ldt.progress,
        ldt.area_id,
        ldt.day_type_id,
        ldt.format_id
      FROM new_club_launches ncl
      LEFT JOIN launch_dimensional_targets ldt ON ncl.id = ldt.launch_id
    `;

    const params: any[] = [];
    if (status) {
      query += ` WHERE ncl.launch_status = $1`;
      params.push(status);
    }

    query += ` ORDER BY ncl.created_at DESC`;

    const result = await queryLocal(query, params);

    res.json({
      success: true,
      launches: result.rows
    });
  } catch (error) {
    logger.error('Failed to fetch launches:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch launches',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// =====================================================
// CLUB PICKER ENDPOINT (for expansion modal)
// =====================================================

// GET /api/targets/picker/clubs - Get active clubs for club picker dropdown
router.get('/picker/clubs', async (req, res) => {
  try {
    const { activity_id, city_id, search } = req.query;

    // Build query to get active clubs with their location context
    // Uses CTE pattern from hierarchy building for consistency
    let query = `
      WITH club_locations AS (
        -- Get most recent location for each club (area derived from events)
        SELECT DISTINCT ON (e.club_id)
          e.club_id,
          ci.id as city_id,
          ci.name as city_name,
          ar.id as area_id,
          ar.name as area_name
        FROM event e
        JOIN location l ON e.location_id = l.id
        JOIN area ar ON l.area_id = ar.id
        JOIN city ci ON ar.city_id = ci.id
        WHERE e.state = 'CREATED'
        ORDER BY e.club_id, e.start_time DESC
      )
      SELECT
        c.pk as club_pk,
        c.name as club_name,
        a.id as activity_id,
        a.name as activity_name,
        COALESCE(cl.city_id, 0) as city_id,
        COALESCE(cl.city_name, 'Unknown') as city_name,
        COALESCE(cl.area_id, 0) as area_id,
        COALESCE(cl.area_name, 'Unknown') as area_name
      FROM club c
      JOIN activity a ON c.activity_id = a.id
      LEFT JOIN club_locations cl ON c.pk = cl.club_id
      WHERE c.status = 'ACTIVE'
        AND c.is_private = false
    `;

    const params: any[] = [];
    let paramIndex = 1;

    // Filter by activity_id
    if (activity_id) {
      query += ` AND a.id = $${paramIndex}`;
      params.push(parseInt(activity_id as string));
      paramIndex++;
    }

    // Filter by city_id
    if (city_id) {
      query += ` AND cl.city_id = $${paramIndex}`;
      params.push(parseInt(city_id as string));
      paramIndex++;
    }

    // Search by club name
    if (search) {
      query += ` AND LOWER(c.name) LIKE $${paramIndex}`;
      params.push(`%${(search as string).toLowerCase()}%`);
      paramIndex++;
    }

    query += ` ORDER BY a.name, cl.city_name, c.name`;

    const result = await queryProduction(query, params);

    res.json({
      success: true,
      clubs: result.rows
    });
  } catch (error) {
    logger.error('Failed to fetch clubs for picker:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch clubs',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/targets/clubs/:clubId/meetup-details - Get meetup details for hover tooltip
router.get('/clubs/:clubId/meetup-details', async (req, res) => {
  try {
    const clubId = parseInt(req.params.clubId);

    if (isNaN(clubId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid club ID'
      });
    }

    // Use the matching service - same logic as the main dashboard
    const matchResult = await matchClubMeetups(clubId);

    // Build a map of event_id -> matched target
    const eventToTarget = new Map<number, { id: number; name: string | null }>();

    // Get targets with display names for the response
    const targetsQuery = `
      SELECT
        cdt.id as target_id,
        cdt.name as target_name,
        dt.day_type as day_type_name
      FROM club_dimensional_targets cdt
      LEFT JOIN dim_day_types dt ON cdt.day_type_id = dt.id
      WHERE cdt.club_id = $1
      ORDER BY cdt.id
    `;
    const targetsResult = await queryLocal(targetsQuery, [clubId]);

    // Build display name map (matching hierarchy API logic)
    const targetDisplayNames = new Map<number, string>();
    targetsResult.rows.forEach((t: any, idx: number) => {
      let displayName = t.target_name || null;
      if (!displayName) {
        if (t.day_type_name) {
          displayName = t.day_type_name;
        } else {
          displayName = `Target ${idx + 1}`;
        }
      }
      targetDisplayNames.set(parseInt(t.target_id), displayName);
    });

    // Map matched meetups from matching service
    for (const targetResult of matchResult.targets) {
      const displayName = targetDisplayNames.get(targetResult.target_id) || targetResult.target_name;
      for (const meetup of targetResult.matched_meetups) {
        eventToTarget.set(meetup.event_id, {
          id: targetResult.target_id,
          name: displayName
        });
      }
    }

    // Fetch additional meetup details (capacity, price, bookings, waitlist)
    const meetupsQuery = `
      SELECT
        e.pk as event_id,
        e.name as event_name,
        e.start_time as event_date,
        e.max_people as capacity,
        e.ticket_price as price,
        COUNT(DISTINCT b.id) as total_bookings,
        COUNT(DISTINCT CASE WHEN b.booking_status = 'WAITLISTED' THEN b.id END) as waitlist_count,
        COALESCE(SUM(CASE WHEN p.state = 'COMPLETED' THEN p.amount / 100.0 ELSE 0 END), 0) as revenue
      FROM event e
      LEFT JOIN booking b ON b.event_id = e.pk
      LEFT JOIN transaction t ON t.entity_id = b.id AND t.entity_type = 'BOOKING'
      LEFT JOIN payment p ON p.pk = t.payment_id
      WHERE e.club_id = $1
        AND e.start_time >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '1 week'
        AND e.start_time < DATE_TRUNC('week', CURRENT_DATE)
        AND e.state = 'CREATED'
      GROUP BY e.pk, e.name, e.start_time, e.max_people, e.ticket_price
      ORDER BY e.start_time DESC
    `;

    const result = await queryProduction(meetupsQuery, [clubId]);

    // Build response with matched targets from the matching service
    const meetups = result.rows.map((row: any) => {
      const eventId = parseInt(row.event_id);
      const matchedTarget = eventToTarget.get(eventId) || null;

      return {
        event_id: row.event_id,
        event_name: row.event_name || 'Unnamed Event',
        event_date: row.event_date,
        capacity: parseInt(row.capacity) || 0,
        price: parseInt(row.price) || 0,
        total_bookings: parseInt(row.total_bookings) || 0,
        waitlist_count: parseInt(row.waitlist_count) || 0,
        revenue: parseFloat(row.revenue) || 0,
        matched_target: matchedTarget
      };
    });

    res.json({
      success: true,
      club_id: clubId,
      meetups,
      total_meetups: meetups.length,
      total_revenue: meetups.reduce((sum: number, m: any) => sum + m.revenue, 0),
      total_waitlist: meetups.reduce((sum: number, m: any) => sum + m.waitlist_count, 0)
    });
  } catch (error) {
    logger.error(`Failed to fetch meetup details for club ${req.params.clubId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch meetup details',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
