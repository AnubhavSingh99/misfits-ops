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
import {
  HEALTH_THRESHOLDS,
  type HealthStatus
} from '../services/healthEngine';

const router = Router();

// =====================================================
// HEALTH CALCULATION HELPERS
// =====================================================

/**
 * Calculate health score (0-100) for a club based on metrics
 * Uses weighted formula: capacity(30%) + repeat_rate(40%) + rating(30%)
 * For new clubs (<2 months): capacity(60%) + rating(40%)
 */
function calculateHealthScore(
  capacityPct: number,
  repeatRatePct: number,
  avgRating: number,
  isNewClub: boolean = false
): number {
  const weights = isNewClub
    ? { capacity: 0.6, repeat_rate: 0.0, rating: 0.4 }
    : { capacity: 0.3, repeat_rate: 0.4, rating: 0.3 };

  const score =
    (capacityPct / 100) * weights.capacity * 100 +
    (repeatRatePct / 100) * weights.repeat_rate * 100 +
    (avgRating / 5) * weights.rating * 100;

  return Math.round(Math.max(0, Math.min(100, score)));
}

/**
 * Get health status based on score thresholds
 */
function getHealthStatus(score: number, hasMeetups: boolean): 'green' | 'yellow' | 'red' | 'gray' {
  if (!hasMeetups) return 'gray';  // Dormant - no meetups this week
  if (score >= 70) return 'green';
  if (score >= 50) return 'yellow';
  return 'red';
}

/**
 * Get individual metric health status
 */
function getMetricHealth(value: number, thresholds: { green: number; yellow: number }): HealthStatus {
  if (value >= thresholds.green) return 'green';
  if (value >= thresholds.yellow) return 'yellow';
  return 'red';
}

/**
 * Calculate rolled-up health for parent nodes (weighted average by activity)
 * Weight = average meetups per week in last 4 weeks (more active clubs matter more)
 * Excludes launches from calculation
 */
function rollupHealth(children: Array<{
  health_score?: number;
  health_status?: 'green' | 'yellow' | 'red' | 'gray';
  health_distribution?: { green: number; yellow: number; red: number; gray: number };
  is_launch?: boolean;
  l4w_avg_meetups_per_week?: number;
  type?: string;
}>): {
  health_score: number;
  health_status: 'green' | 'yellow' | 'red' | 'gray';
  health_distribution: { green: number; yellow: number; red: number; gray: number };
} {
  // Filter out launches - they don't contribute to health
  const validChildren = children.filter(c => !c.is_launch);

  if (validChildren.length === 0) {
    return {
      health_score: 0,
      health_status: 'gray',
      health_distribution: { green: 0, yellow: 0, red: 0, gray: 0 }
    };
  }

  // Separate leaf nodes (clubs/launches with health_status) from roll-up nodes (with health_distribution)
  // Don't check type - just check what data they have
  const leafNodes = validChildren.filter(c => c.health_status !== undefined && !c.health_distribution);
  const rollupNodes = validChildren.filter(c => c.health_distribution !== undefined);

  // Calculate weighted average health score from leaf nodes only
  let totalWeightedScore = 0;
  let totalWeight = 0;

  for (const child of leafNodes) {
    const weight = Math.max(0.5, child.l4w_avg_meetups_per_week || 0.5);
    totalWeightedScore += (child.health_score || 0) * weight;
    totalWeight += weight;
  }

  const avgScore = totalWeight > 0 ? Math.round(totalWeightedScore / totalWeight) : 0;

  // Aggregate distribution:
  // 1. From leaf nodes (clubs): use their health_status directly
  // 2. From roll-up nodes: sum their health_distribution
  const distribution = { green: 0, yellow: 0, red: 0, gray: 0 };

  // Add from leaf nodes (clubs)
  for (const child of leafNodes) {
    const status = child.health_status || 'gray';
    distribution[status]++;
  }

  // Add from roll-up nodes (areas, cities, activities)
  for (const child of rollupNodes) {
    if (child.health_distribution) {
      distribution.green += child.health_distribution.green || 0;
      distribution.yellow += child.health_distribution.yellow || 0;
      distribution.red += child.health_distribution.red || 0;
      distribution.gray += child.health_distribution.gray || 0;
    }
  }

  // Determine overall status based on distribution
  const hasActiveClubs = distribution.green + distribution.yellow + distribution.red > 0;
  const overallStatus = hasActiveClubs ? getHealthStatus(avgScore, true) : 'gray';

  return {
    health_score: avgScore,
    health_status: overallStatus,
    health_distribution: distribution
  };
}

/**
 * Calculate health distribution from unique clubs only
 * This prevents multi-area clubs from being counted multiple times
 */
function getUniqueClubHealthDistribution(hierarchy: any[]): {
  green: number;
  yellow: number;
  red: number;
  gray: number;
} {
  // Recursively extract all club nodes from hierarchy
  function extractClubNodes(nodes: any[]): any[] {
    const clubs: any[] = [];
    for (const node of nodes) {
      if (node.type === 'club' && !node.is_launch) {
        clubs.push(node);
      }
      if (node.children && Array.isArray(node.children)) {
        clubs.push(...extractClubNodes(node.children));
      }
    }
    return clubs;
  }

  const allClubNodes = extractClubNodes(hierarchy);

  // Deduplicate by club_id, keeping first occurrence
  const uniqueClubs = new Map<number, any>();
  for (const club of allClubNodes) {
    if (club.club_id && !uniqueClubs.has(club.club_id)) {
      uniqueClubs.set(club.club_id, club);
    }
  }

  // Calculate distribution from unique clubs
  const distribution = { green: 0, yellow: 0, red: 0, gray: 0 };
  for (const club of uniqueClubs.values()) {
    const status = club.health_status || 'gray';
    if (status in distribution) {
      distribution[status as keyof typeof distribution]++;
    }
  }

  return distribution;
}

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

    // If activity_id not provided, fetch from production club table
    let resolvedActivityId = activity_id;
    let resolvedClubName = club_name;
    if (!resolvedActivityId || !resolvedClubName) {
      const clubResult = await queryProduction(
        `SELECT activity_id, name FROM club WHERE pk = $1`,
        [clubId]
      );
      if (clubResult.rows.length > 0) {
        if (!resolvedActivityId) resolvedActivityId = clubResult.rows[0].activity_id;
        if (!resolvedClubName) resolvedClubName = clubResult.rows[0].name;
      }
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

    // Always create a new target - POST creates, PUT updates
    // This allows multiple targets with the same dimensions (e.g., same day type)
    const initialProgress = {
      not_picked: target_meetups || 0,
      started: 0,
      stage_1: 0,
      stage_2: 0,
      stage_3: 0,
      stage_4: 0,
      realised: 0
    };

    const result = await queryLocal(`
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
      resolvedActivityId || null,
      resolvedClubName || null,
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

    // First, get the current target to check for target_meetups change
    const currentTargetResult = await queryLocal(`
      SELECT target_meetups, progress FROM club_dimensional_targets WHERE id = $1
    `, [targetId]);

    if (currentTargetResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Target not found'
      });
    }

    const currentTarget = currentTargetResult.rows[0];
    const oldTargetMeetups = currentTarget.target_meetups;
    const currentProgress = currentTarget.progress || {
      not_picked: oldTargetMeetups,
      started: 0,
      stage_1: 0,
      stage_2: 0,
      stage_3: 0,
      stage_4: 0,
      realised: 0
    };

    // Auto-calculate target_revenue if meetup_cost and meetup_capacity are provided
    let finalTargetRevenue = target_revenue;
    if (meetup_cost !== undefined && meetup_capacity !== undefined && target_meetups !== undefined) {
      finalTargetRevenue = calculateTargetRevenue(target_meetups, meetup_cost, meetup_capacity);
    }

    // Calculate new progress if target_meetups changed
    let newProgress = currentProgress;
    if (target_meetups !== undefined && target_meetups !== oldTargetMeetups) {
      const delta = target_meetups - oldTargetMeetups;

      if (delta > 0) {
        // Increased: Add delta to not_picked
        newProgress = {
          ...currentProgress,
          not_picked: (currentProgress.not_picked || 0) + delta
        };
        logger.info(`Target ${targetId}: Increased by ${delta}, adding to not_picked. New not_picked: ${newProgress.not_picked}`);
      } else if (delta < 0) {
        // Decreased: Remove from lowest stages first (not_picked → started → stage_1 → etc.)
        // Priority: keep higher stages, remove from lower stages first
        let toRemove = Math.abs(delta);
        newProgress = { ...currentProgress };

        const stageOrder: (keyof typeof newProgress)[] = [
          'not_picked', 'started', 'stage_1', 'stage_2', 'stage_3', 'stage_4', 'realised'
        ];

        for (const stage of stageOrder) {
          if (toRemove <= 0) break;
          const available = (newProgress[stage] as number) || 0;
          const removeFromStage = Math.min(available, toRemove);
          (newProgress[stage] as number) = available - removeFromStage;
          toRemove -= removeFromStage;
          if (removeFromStage > 0) {
            logger.info(`Target ${targetId}: Removed ${removeFromStage} from ${stage}`);
          }
        }
      }
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
        progress = $8,
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
      day_type_id || null,
      JSON.stringify(newProgress)
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

    // Always create a new target - POST creates, PUT updates
    // This allows multiple targets with the same dimensions (e.g., same day type)
    const insertQuery = `
      INSERT INTO launch_dimensional_targets (
        launch_id, activity_name,
        area_id, day_type_id, format_id,
        target_meetups, target_revenue
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
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

    // First, get the current target to check for target_meetups change
    const currentTargetResult = await queryLocal(`
      SELECT target_meetups, progress FROM launch_dimensional_targets WHERE id = $1
    `, [targetId]);

    if (currentTargetResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Target not found'
      });
    }

    const currentTarget = currentTargetResult.rows[0];
    const oldTargetMeetups = currentTarget.target_meetups;
    const currentProgress = currentTarget.progress || {
      not_picked: oldTargetMeetups,
      started: 0,
      stage_1: 0,
      stage_2: 0,
      stage_3: 0,
      stage_4: 0,
      realised: 0
    };

    // Auto-calculate target_revenue if meetup_cost and meetup_capacity are provided
    let finalTargetRevenue = target_revenue;
    if (meetup_cost !== undefined && meetup_capacity !== undefined && target_meetups !== undefined) {
      finalTargetRevenue = calculateTargetRevenue(target_meetups, meetup_cost, meetup_capacity);
    }

    // Calculate new progress if target_meetups changed
    let newProgress = currentProgress;
    if (target_meetups !== undefined && target_meetups !== oldTargetMeetups) {
      const delta = target_meetups - oldTargetMeetups;

      if (delta > 0) {
        // Increased: Add delta to not_picked
        newProgress = {
          ...currentProgress,
          not_picked: (currentProgress.not_picked || 0) + delta
        };
        logger.info(`Launch Target ${targetId}: Increased by ${delta}, adding to not_picked. New not_picked: ${newProgress.not_picked}`);
      } else if (delta < 0) {
        // Decreased: Remove from lowest stages first (not_picked → started → stage_1 → etc.)
        let toRemove = Math.abs(delta);
        newProgress = { ...currentProgress };

        const stageOrder: (keyof typeof newProgress)[] = [
          'not_picked', 'started', 'stage_1', 'stage_2', 'stage_3', 'stage_4', 'realised'
        ];

        for (const stage of stageOrder) {
          if (toRemove <= 0) break;
          const available = (newProgress[stage] as number) || 0;
          const removeFromStage = Math.min(available, toRemove);
          (newProgress[stage] as number) = available - removeFromStage;
          toRemove -= removeFromStage;
          if (removeFromStage > 0) {
            logger.info(`Launch Target ${targetId}: Removed ${removeFromStage} from ${stage}`);
          }
        }
      }
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
        progress = $8,
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
      day_type_id || null,
      JSON.stringify(newProgress)
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

// Helper: Sync progress with target_meetups
// If sum of all stages doesn't match target, adjust not_picked to compensate
function syncProgress(progress: any, targetMeetups: number): any {
  const p = progress || defaultProgress;
  const sum = (p.not_picked || 0) + (p.started || 0) +
    (p.stage_1 || 0) + (p.stage_2 || 0) + (p.stage_3 || 0) +
    (p.stage_4 || 0) + (p.realised || 0);

  if (sum !== targetMeetups) {
    const diff = targetMeetups - sum;
    return {
      ...defaultProgress,
      ...p,
      not_picked: Math.max(0, (p.not_picked || 0) + diff)
    };
  }

  return p;
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

// Helper: Hierarchy level type for dynamic ordering
type HierarchyLevel = 'activity' | 'city' | 'area';

// Helper: Get level value from club data
function getLevelValue(level: HierarchyLevel, club: any): { id: number; name: string } {
  switch (level) {
    case 'activity':
      return { id: parseInt(club.activity_id), name: club.activity_name };
    case 'city':
      return { id: parseInt(club.city_id) || 0, name: club.city_name || 'Unknown' };
    case 'area':
      return { id: parseInt(club.area_id) || 0, name: club.area_name || 'Unknown' };
  }
}

// Helper: Create a level node for dynamic hierarchy
function createLevelNode(level: HierarchyLevel, value: { id: number; name: string }, parentKey: string, allLevelValues: Record<HierarchyLevel, { id: number; name: string }>) {
  const nodeId = parentKey ? `${parentKey}-${level}:${value.id}` : `${level}:${value.id}`;
  return {
    type: level,
    id: nodeId,
    name: value.name,
    [`${level}_id`]: value.id,
    // Also store all level IDs for context (needed for + button context)
    activity_id: allLevelValues.activity.id,
    city_id: allLevelValues.city.id,
    area_id: allLevelValues.area.id,
    // Also store names for task summary matching
    activity_name: allLevelValues.activity.name,
    city_name: allLevelValues.city.name,
    area_name: allLevelValues.area.name,
    target_meetups: 0,
    target_revenue: 0,
    current_meetups: 0,
    current_revenue: 0,
    gap_meetups: 0,
    gap_revenue: 0,
    progress_summary: { ...defaultProgress },
    club_count: 0,
    launch_count: 0,
    last_4w_revenue_total: 0,
    revenue_status_list: [] as RevenueStatus[],
    childrenMap: new Map<string, any>(), // For intermediate levels
    children: [] as any[] // For final level before clubs
  };
}

// Interface for processed club data used by dynamic hierarchy builder
interface ProcessedClubData {
  club: any;
  clubNode: any;
  levelValues: Record<HierarchyLevel, { id: number; name: string }>;
  hasTargets: boolean;
  hasRevenueData: boolean;
  clubRevenueStatus: RevenueStatus;
  aggregatedProgress: any;
  last4wTotal: number;
}

// Interface for processed launch data
interface ProcessedLaunchData {
  launch: any;
  launchNode: any;
  levelValues: Record<HierarchyLevel, { id: number; name: string }>;
  progress: any;
  hasTarget: boolean;
}

// Helper: Build dynamic hierarchy from processed data
function buildDynamicHierarchy(
  processedClubs: ProcessedClubData[],
  processedLaunches: ProcessedLaunchData[],
  hierarchyLevels: HierarchyLevel[]
): Map<string, any> {
  const rootMap = new Map<string, any>();

  // Process clubs
  for (const data of processedClubs) {
    const { clubNode, levelValues, hasTargets, hasRevenueData, clubRevenueStatus, aggregatedProgress, last4wTotal } = data;

    // Traverse/create path through hierarchy based on order
    let currentMap = rootMap;
    let currentKey = '';

    for (let i = 0; i < hierarchyLevels.length; i++) {
      const level = hierarchyLevels[i];
      const levelValue = levelValues[level];
      const levelKey = `${level}:${levelValue.id}`;

      // Create node if doesn't exist
      if (!currentMap.has(levelKey)) {
        currentMap.set(levelKey, createLevelNode(level, levelValue, currentKey, levelValues));
      }

      const node = currentMap.get(levelKey);
      currentKey = currentKey ? `${currentKey}-${levelKey}` : levelKey;

      // Accumulate metrics at each level
      node.target_meetups += clubNode.target_meetups;
      node.target_revenue += clubNode.target_revenue;
      node.current_meetups += clubNode.current_meetups;
      node.current_revenue += clubNode.current_revenue;
      node.club_count++;
      node.last_4w_revenue_total += last4wTotal;
      if (hasRevenueData) {
        node.revenue_status_list.push(clubRevenueStatus);
      }

      if (i === hierarchyLevels.length - 1) {
        // Last level before clubs - add club as child
        // Update club ID to match the dynamic path
        clubNode.id = `${currentKey}-club:${clubNode.club_id}`;
        node.children.push(clubNode);
        // Roll up progress
        if (hasTargets) {
          node.progress_summary = sumProgress([node.progress_summary, aggregatedProgress]);
        }
      } else {
        // Intermediate level - continue traversal
        currentMap = node.childrenMap;
      }
    }
  }

  // Process launches
  for (const data of processedLaunches) {
    const { launchNode, levelValues, progress, hasTarget } = data;

    let currentMap = rootMap;
    let currentKey = '';

    for (let i = 0; i < hierarchyLevels.length; i++) {
      const level = hierarchyLevels[i];
      const levelValue = levelValues[level];
      const levelKey = `${level}:${levelValue.id}`;

      if (!currentMap.has(levelKey)) {
        currentMap.set(levelKey, createLevelNode(level, levelValue, currentKey, levelValues));
      }

      const node = currentMap.get(levelKey);
      currentKey = currentKey ? `${currentKey}-${levelKey}` : levelKey;

      // Accumulate metrics
      node.target_meetups += launchNode.target_meetups;
      node.target_revenue += launchNode.target_revenue;
      if (!node.launch_count) node.launch_count = 0;
      node.launch_count++;

      if (i === hierarchyLevels.length - 1) {
        // Last level - add launch as child
        launchNode.id = `${currentKey}-launch:${launchNode.launch_id}`;
        node.children.push(launchNode);
        // Roll up progress
        if (hasTarget) {
          node.progress_summary = sumProgress([node.progress_summary, progress]);
        }
      } else {
        currentMap = node.childrenMap;
      }
    }
  }

  return rootMap;
}

// Helper: Convert dynamic hierarchy map to array with calculated gaps/validations
function convertDynamicHierarchyToArray(
  rootMap: Map<string, any>,
  hierarchyLevels: HierarchyLevel[],
  depth: number = 0
): any[] {
  const result: any[] = [];

  for (const [, node] of rootMap) {
    // Recursively convert children from Map to Array
    if (depth < hierarchyLevels.length - 1 && node.childrenMap && node.childrenMap.size > 0) {
      node.children = convertDynamicHierarchyToArray(node.childrenMap, hierarchyLevels, depth + 1);
      // Roll up progress from children
      node.progress_summary = sumProgress(node.children.map((c: any) => c.progress_summary));
    }
    delete node.childrenMap; // Clean up

    // Calculate gaps
    node.gap_meetups = Math.max(0, node.target_meetups - node.current_meetups);
    node.gap_revenue = Math.max(0, node.target_revenue - node.current_revenue);
    node.last_4w_revenue_avg = node.last_4w_revenue_total / 4;

    // Validation
    const validation = validateProgress(node.target_meetups, node.current_meetups, node.progress_summary);
    node.validation_status = validation.status;
    node.validation_message = validation.message;

    // Roll up revenue status
    const revenueStatusList = node.revenue_status_list || [];
    node.revenue_status = revenueStatusList.length > 0
      ? rollupRevenueStatuses(revenueStatusList)
      : null;
    node.revenue_status_display = node.revenue_status
      ? getRevenueStatusDisplay(node.revenue_status)
      : null;
    delete node.revenue_status_list;

    // Add counts based on level type
    if (node.children && Array.isArray(node.children)) {
      const childTypes = new Set(node.children.map((c: any) => c.type));
      if (childTypes.has('activity')) {
        node.activity_count = node.children.filter((c: any) => c.type === 'activity').length;
      }
      if (childTypes.has('city')) {
        node.city_count = node.children.filter((c: any) => c.type === 'city').length;
      }
      if (childTypes.has('area')) {
        node.area_count = node.children.filter((c: any) => c.type === 'area').length;
      }
    }

    result.push(node);
  }

  return result;
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
    const { activity_id, city_id, area_id, include_launches, targets_only, use_auto_matching, hierarchy_order, week_start, week_end } = req.query;
    const autoMatchingEnabled = use_auto_matching === 'true';

    // Parse week bounds (defaults to last completed week if not provided)
    // week_start and week_end are ISO date strings (YYYY-MM-DD)
    const weekStartDate = week_start && typeof week_start === 'string'
      ? new Date(week_start)
      : null;
    const weekEndDate = week_end && typeof week_end === 'string'
      ? new Date(week_end)
      : null;

    // SQL date expressions - use provided dates or default to last completed week
    // Use IST timezone (Asia/Kolkata) for date calculations
    const weekStartSQL = weekStartDate
      ? `'${weekStartDate.toISOString().split('T')[0]} 00:00:00+05:30'::timestamptz`
      : `DATE_TRUNC('week', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata' - INTERVAL '7 days'`;
    const weekEndSQL = weekEndDate
      ? `'${weekEndDate.toISOString().split('T')[0]} 00:00:00+05:30'::timestamptz`
      : `DATE_TRUNC('week', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'`;

    logger.info(`V2 Hierarchy request with week: ${weekStartDate?.toISOString() || 'default'} to ${weekEndDate?.toISOString() || 'default'}`);

    // Parse hierarchy_order parameter (comma-separated list of levels)
    // Valid levels: activity, city, area
    // Default order: activity, city, area
    const validLevels: HierarchyLevel[] = ['activity', 'city', 'area'];
    const defaultOrder: HierarchyLevel[] = ['activity', 'city', 'area'];
    let hierarchyLevels: HierarchyLevel[] = defaultOrder;

    if (hierarchy_order && typeof hierarchy_order === 'string') {
      const requestedLevels = hierarchy_order.split(',')
        .map(l => l.trim().toLowerCase())
        .filter(l => validLevels.includes(l as HierarchyLevel)) as HierarchyLevel[];

      // Use requested order if at least one valid level provided
      if (requestedLevels.length > 0) {
        hierarchyLevels = requestedLevels;
      }
    }

    const useCustomHierarchy = hierarchyLevels.length !== 3 ||
      hierarchyLevels[0] !== 'activity' ||
      hierarchyLevels[1] !== 'city' ||
      hierarchyLevels[2] !== 'area';

    logger.info(`V2 Hierarchy request with order: ${hierarchyLevels.join(',')}, custom: ${useCustomHierarchy}`);

    // Store for auto-matching results (club_id -> ClubMatchResult)
    const autoMatchResults = new Map<number, ClubMatchResult>();

    // Get ALL clubs from production with area derived from event locations
    // MULTI-CITY: Clubs appear once per city where they have events
    // Meetups/revenue are split by city
    // 0-BOOKING FILTER: Only count events with at least 1 valid booking
    const clubsQuery = `
      WITH
      -- Pre-filter events that have at least one valid booking (not deregistered/initiated)
      events_with_bookings AS (
        SELECT DISTINCT b.event_id
        FROM booking b
        WHERE b.booking_status NOT IN ('DEREGISTERED', 'INITIATED')
      ),
      -- One row per (club, area) - clubs appear under EVERY area where they have events
      -- Only consider CREATED events (not cancelled)
      club_locations AS (
        SELECT DISTINCT ON (e.club_id, ar.id)
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
        ORDER BY e.club_id, ar.id, e.start_time DESC
      ),
      -- Metrics per (club, area) - count events with bookings in that area
      club_metrics AS (
        SELECT
          c.pk as club_id,
          c.id as club_uuid,
          c.name as club_name,
          a.id as activity_id,
          a.name as activity_name,
          ar.id as area_id,
          COUNT(DISTINCT CASE
            WHEN e.start_time >= ${weekStartSQL}
            AND e.start_time < ${weekEndSQL}
            AND e.state = 'CREATED'
            AND e.pk IN (SELECT event_id FROM events_with_bookings)
            THEN e.pk
          END) as current_meetups,
          COALESCE(SUM(
            CASE
              WHEN p.state = 'COMPLETED'
              AND e.start_time >= ${weekStartSQL}
              AND e.start_time < ${weekEndSQL}
              AND e.state = 'CREATED'
              THEN p.amount / 100.0
              ELSE 0
            END
          ), 0) as current_revenue
        FROM club c
        JOIN activity a ON c.activity_id = a.id
        LEFT JOIN event e ON c.pk = e.club_id
        LEFT JOIN location l ON e.location_id = l.id
        LEFT JOIN area ar ON l.area_id = ar.id
        LEFT JOIN city ci ON ar.city_id = ci.id
        LEFT JOIN booking b ON b.event_id = e.pk
        LEFT JOIN transaction t ON t.entity_id = b.id AND t.entity_type = 'BOOKING'
        LEFT JOIN payment p ON p.pk = t.payment_id
        WHERE c.status = 'ACTIVE'
          AND c.is_private = false
          AND a.name != 'Test'
          ${activity_id ? `AND a.id = ${parseInt(activity_id as string)}` : ''}
        GROUP BY c.pk, c.id, c.name, a.id, a.name, ar.id
      )
      SELECT
        cm.club_id,
        cm.club_uuid,
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
      -- Join on both club_id AND area_id to get per-area rows
      INNER JOIN club_locations cl ON cm.club_id = cl.club_id AND cm.area_id = cl.area_id
      ORDER BY cm.activity_name, cl.city_name, cl.area_name, cm.club_name
    `;

    const clubsResult = await queryProduction(clubsQuery);

    // Get last 4 weeks revenue and meetup count per club from production (event-based)
    // Use IST timezone (Asia/Kolkata) for date calculations
    const last4WeeksRevenueQuery = `
      SELECT
        c.pk as club_id,
        COALESCE(SUM(
          CASE WHEN p.state = 'COMPLETED' THEN p.amount / 100.0 ELSE 0 END
        ), 0) as total_revenue,
        COUNT(DISTINCT e.pk) as total_meetups,
        COUNT(DISTINCT DATE_TRUNC('week', e.start_time AT TIME ZONE 'Asia/Kolkata')) as weeks_with_data
      FROM club c
      LEFT JOIN event e ON c.pk = e.club_id
        AND e.start_time >= (CURRENT_DATE AT TIME ZONE 'Asia/Kolkata') - INTERVAL '4 weeks'
        AND e.start_time < (CURRENT_DATE AT TIME ZONE 'Asia/Kolkata')
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
        meetups: parseInt(r.total_meetups) || 0,
        weeks: parseInt(r.weeks_with_data) || 0
      }
    ]));

    // Get health metrics per club for the selected week
    // Metrics: capacity_percentage, repeat_rate_percentage, avg_rating
    const healthMetricsQuery = `
      WITH week_events AS (
        -- Events in the selected week
        SELECT
          e.club_id,
          e.pk as event_id,
          e.max_people as capacity,
          COUNT(DISTINCT CASE
            WHEN b.booking_status NOT IN ('DEREGISTERED', 'INITIATED', 'WAITLISTED')
            THEN b.id
          END) as bookings_count
        FROM event e
        LEFT JOIN booking b ON b.event_id = e.pk
        WHERE e.start_time >= ${weekStartSQL}
          AND e.start_time < ${weekEndSQL}
          AND e.state = 'CREATED'
        GROUP BY e.club_id, e.pk, e.max_people
      ),
      club_capacity AS (
        -- Capacity utilization per club
        SELECT
          club_id,
          COUNT(event_id) as meetup_count,
          CASE
            WHEN SUM(capacity) > 0
            THEN ROUND((SUM(bookings_count)::numeric / SUM(capacity)) * 100, 1)
            ELSE 0
          END as capacity_pct
        FROM week_events
        GROUP BY club_id
      ),
      -- Repeat rate: users who booked this week and also booked in last 4 weeks
      current_week_users AS (
        SELECT DISTINCT
          e.club_id,
          b.user_id
        FROM event e
        JOIN booking b ON b.event_id = e.pk
        WHERE e.start_time >= ${weekStartSQL}
          AND e.start_time < ${weekEndSQL}
          AND e.state = 'CREATED'
          AND b.booking_status NOT IN ('DEREGISTERED', 'INITIATED', 'WAITLISTED')
      ),
      previous_users AS (
        SELECT DISTINCT
          e.club_id,
          b.user_id
        FROM event e
        JOIN booking b ON b.event_id = e.pk
        WHERE e.start_time >= ${weekStartSQL} - INTERVAL '4 weeks'
          AND e.start_time < ${weekStartSQL}
          AND e.state = 'CREATED'
          AND b.booking_status NOT IN ('DEREGISTERED', 'INITIATED', 'WAITLISTED')
      ),
      club_repeat AS (
        SELECT
          cu.club_id,
          COUNT(DISTINCT cu.user_id) as total_users,
          COUNT(DISTINCT CASE WHEN pu.user_id IS NOT NULL THEN cu.user_id END) as repeat_users
        FROM current_week_users cu
        LEFT JOIN previous_users pu ON cu.club_id = pu.club_id AND cu.user_id = pu.user_id
        GROUP BY cu.club_id
      ),
      -- Average rating per club (from booking feedback in last 30 days)
      club_rating AS (
        SELECT
          e.club_id,
          AVG(CASE WHEN (b.feedback_details->>'rating')::numeric IS NOT NULL
                   THEN (b.feedback_details->>'rating')::numeric END)::numeric(3,2) as avg_rating,
          COUNT(CASE WHEN b.feedback_details->>'rating' IS NOT NULL THEN 1 END) as review_count
        FROM event e
        JOIN booking b ON b.event_id = e.pk
        WHERE e.start_time >= CURRENT_DATE - INTERVAL '30 days'
          AND e.state = 'CREATED'
          AND b.booking_status NOT IN ('DEREGISTERED', 'INITIATED', 'WAITLISTED')
        GROUP BY e.club_id
      ),
      -- Club created date for new club detection
      club_age AS (
        SELECT pk as club_id, created_at
        FROM club
        WHERE status = 'ACTIVE' AND is_private = false
      )
      SELECT
        c.pk as club_id,
        COALESCE(cc.capacity_pct, 0) as capacity_pct,
        COALESCE(cc.meetup_count, 0) as meetup_count,
        CASE
          WHEN COALESCE(cr.total_users, 0) > 0
          THEN ROUND((cr.repeat_users::numeric / cr.total_users) * 100, 1)
          ELSE 0
        END as repeat_rate_pct,
        COALESCE(crat.avg_rating, 0) as avg_rating,
        COALESCE(crat.review_count, 0) as review_count,
        ca.created_at,
        CASE
          WHEN ca.created_at > CURRENT_DATE - INTERVAL '2 months'
          THEN true
          ELSE false
        END as is_new_club
      FROM club c
      LEFT JOIN club_capacity cc ON c.pk = cc.club_id
      LEFT JOIN club_repeat cr ON c.pk = cr.club_id
      LEFT JOIN club_rating crat ON c.pk = crat.club_id
      LEFT JOIN club_age ca ON c.pk = ca.club_id
      WHERE c.status = 'ACTIVE' AND c.is_private = false
    `;
    const healthMetricsResult = await queryProduction(healthMetricsQuery);
    const healthMetricsMap = new Map(healthMetricsResult.rows.map((r: any) => [
      parseInt(r.club_id),
      {
        capacity_pct: parseFloat(r.capacity_pct) || 0,
        meetup_count: parseInt(r.meetup_count) || 0,
        repeat_rate_pct: parseFloat(r.repeat_rate_pct) || 0,
        avg_rating: parseFloat(r.avg_rating) || 0,
        review_count: parseInt(r.review_count) || 0,
        is_new_club: r.is_new_club === true
      }
    ]));

    // Get monthly revenue from Sep 2025 to Mar 2026
    // Use date-based series to avoid timezone issues with month intervals
    const monthlyRevenueQuery = `
      WITH month_series AS (
        SELECT
          (DATE '2025-09-01' + (n || ' months')::interval)::date as month_date
        FROM generate_series(0, 6) as n
      )
      SELECT
        ms.month_date,
        TO_CHAR(ms.month_date, 'Mon') as month_label,
        EXTRACT(MONTH FROM ms.month_date) as month_num,
        EXTRACT(YEAR FROM ms.month_date) as year,
        COALESCE(SUM(
          CASE WHEN p.state = 'COMPLETED' THEN p.amount / 100.0 ELSE 0 END
        ), 0) as total_revenue
      FROM month_series ms
      LEFT JOIN event e ON
        e.start_time >= (ms.month_date || ' 00:00:00+05:30')::timestamptz
        AND e.start_time < ((ms.month_date + INTERVAL '1 month')::date || ' 00:00:00+05:30')::timestamptz
        AND e.state = 'CREATED'
      LEFT JOIN club c ON e.club_id = c.pk AND c.is_private = false
      LEFT JOIN booking b ON b.event_id = e.pk
      LEFT JOIN transaction t ON t.entity_id = b.id AND t.entity_type = 'BOOKING'
      LEFT JOIN payment p ON p.pk = t.payment_id
      GROUP BY ms.month_date
      ORDER BY ms.month_date
    `;
    const monthlyRevenueResult = await queryProduction(monthlyRevenueQuery);
    const monthlyRevenue = monthlyRevenueResult.rows.map((row: any) => ({
      month: row.month_label,
      year: parseInt(row.year),
      revenue: parseFloat(row.total_revenue || 0)
    }));
    // Keep march_2026_revenue for backward compatibility
    const march2026Revenue = monthlyRevenue.find((m: any) => m.month === 'Mar' && m.year === 2026)?.revenue || 0;

    // Get dimensional targets from local DB (these overlay on clubs)
    // Now fetching ALL targets per club to support multiple targets
    // Include area_id to support expansion targets (targets in different areas than club's home area)
    // Include production_area_id to filter targets by the club's current area in multi-city scenarios
    const targetsQuery = `
      SELECT
        cdt.id as target_id,
        cdt.club_id,
        cdt.area_id as target_area_id,
        da.production_area_id as target_production_area_id,
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
      LEFT JOIN dim_areas da ON cdt.area_id = da.id
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

    // Get leader requirements per club for rollup
    // Note: deprioritised requirements are excluded from the leaders_required_total sum
    const leaderRequirementsQuery = `
      SELECT
        club_id,
        SUM(CASE WHEN status != 'deprioritised' THEN leaders_required ELSE 0 END) as leaders_required_total,
        COUNT(*) as total_requirements,
        COUNT(CASE WHEN status = 'not_picked' THEN 1 END) as not_picked,
        COUNT(CASE WHEN status = 'deprioritised' THEN 1 END) as deprioritised,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress,
        COUNT(CASE WHEN status = 'done' THEN 1 END) as done
      FROM leader_requirements
      WHERE club_id IS NOT NULL
      GROUP BY club_id
    `;
    const leaderReqResult = await queryLocal(leaderRequirementsQuery);
    const leaderRequirementsMap = new Map(leaderReqResult.rows.map((r: any) => [
      parseInt(r.club_id),
      {
        leaders_required_total: parseInt(r.leaders_required_total) || 0,
        total_requirements: parseInt(r.total_requirements) || 0,
        not_picked: parseInt(r.not_picked) || 0,
        deprioritised: parseInt(r.deprioritised) || 0,
        in_progress: parseInt(r.in_progress) || 0,
        done: parseInt(r.done) || 0
      }
    ]));

    // Get leader requirements per launch for rollup
    const launchLeaderRequirementsQuery = `
      SELECT
        launch_id,
        SUM(CASE WHEN status != 'deprioritised' THEN leaders_required ELSE 0 END) as leaders_required_total,
        COUNT(*) as total_requirements,
        COUNT(CASE WHEN status = 'not_picked' THEN 1 END) as not_picked,
        COUNT(CASE WHEN status = 'deprioritised' THEN 1 END) as deprioritised,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress,
        COUNT(CASE WHEN status = 'done' THEN 1 END) as done
      FROM leader_requirements
      WHERE launch_id IS NOT NULL
      GROUP BY launch_id
    `;
    const launchLeaderReqResult = await queryLocal(launchLeaderRequirementsQuery);
    const launchLeaderRequirementsMap = new Map(launchLeaderReqResult.rows.map((r: any) => [
      parseInt(r.launch_id),
      {
        leaders_required_total: parseInt(r.leaders_required_total) || 0,
        total_requirements: parseInt(r.total_requirements) || 0,
        not_picked: parseInt(r.not_picked) || 0,
        deprioritised: parseInt(r.deprioritised) || 0,
        in_progress: parseInt(r.in_progress) || 0,
        done: parseInt(r.done) || 0
      }
    ]));

    // Fetch planned launches if include_launches is true
    const includeLaunches = include_launches === 'true';
    let launchesData: any[] = [];
    let launchTargetsMap = new Map<number, any>();

    // Map to store matched launch info by club_id (UUID string)
    const matchedLaunchesMap = new Map<string, any>();

    if (includeLaunches) {
      // Fetch UNMATCHED launches from new_club_launches (actual_club_id IS NULL)
      // Matched launches are hidden from hierarchy - their targets move to the club
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
          ncl.actual_club_id,
          ncl.match_type,
          ncl.matched_at,
          ncl.matched_club_name,
          ncl.created_at
        FROM new_club_launches ncl
        WHERE ncl.launch_status IN ('planned', 'in_progress')
          AND ncl.actual_club_id IS NULL
        ORDER BY ncl.activity_name, ncl.planned_city, ncl.planned_area
      `;
      const launchesResult = await queryLocal(launchesQuery);
      launchesData = launchesResult.rows;

      // Also fetch MATCHED launches to show indicator on club rows
      const matchedLaunchesQuery = `
        SELECT
          ncl.id as launch_id,
          ncl.activity_name,
          ncl.planned_club_name,
          ncl.actual_club_id,
          ncl.match_type,
          ncl.matched_at,
          ncl.matched_club_name
        FROM new_club_launches ncl
        WHERE ncl.actual_club_id IS NOT NULL
      `;
      const matchedLaunchesResult = await queryLocal(matchedLaunchesQuery);
      for (const ml of matchedLaunchesResult.rows) {
        matchedLaunchesMap.set(ml.actual_club_id, {
          launch_id: ml.launch_id,
          original_name: ml.planned_club_name,
          matched_at: ml.matched_at,
          match_type: ml.match_type
        });
      }

      // Fetch launch targets from launch_dimensional_targets (including area_id for proper hierarchy placement)
      if (launchesData.length > 0) {
        const launchIds = launchesData.map(l => l.launch_id);
        const launchTargetsQuery = `
          SELECT
            ldt.id as target_id,
            ldt.launch_id,
            ldt.target_meetups,
            ldt.target_revenue,
            ldt.meetup_cost,
            ldt.meetup_capacity,
            ldt.area_id,
            COALESCE(ldt.progress, '${JSON.stringify(defaultProgress)}'::jsonb) as progress
          FROM launch_dimensional_targets ldt
          WHERE ldt.launch_id = ANY($1)
        `;
        const launchTargetsResult = await queryLocal(launchTargetsQuery, [launchIds]);
        launchTargetsMap = new Map(launchTargetsResult.rows.map((t: any) => [parseInt(t.launch_id), t]));
      }

      // AUTO-MATCH LAUNCHES TO CLUBS
      // For each unmatched launch, check if there's a matching club and auto-transition
      if (launchesData.length > 0) {
        const autoMatchedLaunches: number[] = [];

        for (const launch of launchesData) {
          // Skip if already matched or no target area
          const launchTarget = launchTargetsMap.get(launch.launch_id);
          if (!launchTarget?.area_id) continue;

          // Get the production area_id from dim_areas
          const areaMapping = await queryLocal(`
            SELECT production_area_id, city_id FROM dim_areas WHERE id = $1
          `, [launchTarget.area_id]);

          if (areaMapping.rows.length === 0) continue;
          const productionAreaId = areaMapping.rows[0].production_area_id;

          // Find matching clubs:
          // 1. Same activity
          // 2. Active status
          // 3. Has events in the launch's area
          // 4. First event in that area is AFTER launch was created
          const matchingClubsQuery = `
            WITH club_first_area_event AS (
              SELECT
                c.pk as club_id,
                c.id as club_uuid,
                c.name as club_name,
                MIN(e.start_time) as first_area_event
              FROM club c
              JOIN activity a ON c.activity_id = a.id
              JOIN event e ON e.club_id = c.pk
              JOIN location l ON e.location_id = l.id
              WHERE a.name = $1
                AND c.status = 'ACTIVE'
                AND l.area_id = $2
                AND e.state = 'CREATED'
              GROUP BY c.pk, c.id, c.name
            )
            SELECT
              club_id,
              club_uuid,
              club_name,
              first_area_event
            FROM club_first_area_event
            WHERE first_area_event > $3
            ORDER BY first_area_event ASC
          `;

          const matchingClubsResult = await queryProduction(matchingClubsQuery, [
            launch.activity_name,
            productionAreaId,
            launch.created_at
          ]);

          if (matchingClubsResult.rows.length === 0) continue;

          // If multiple matches, use name matching to find best match
          let matchedClub = matchingClubsResult.rows[0];
          if (matchingClubsResult.rows.length > 1) {
            // Simple name matching - find club with most word overlap
            const launchWords = new Set(
              launch.planned_club_name.toLowerCase()
                .replace(/[^a-z0-9\s]/g, '')
                .split(/\s+/)
                .filter((w: string) => w.length > 2)
            );

            let bestScore = 0;
            for (const club of matchingClubsResult.rows) {
              const clubWords = new Set(
                club.club_name.toLowerCase()
                  .replace(/[^a-z0-9\s]/g, '')
                  .split(/\s+/)
                  .filter((w: string) => w.length > 2)
              );
              const intersection = [...launchWords].filter(w => clubWords.has(w)).length;
              if (intersection > bestScore) {
                bestScore = intersection;
                matchedClub = club;
              }
            }
          }

          // Auto-transition the launch
          try {
            // Update launch record
            await queryLocal(`
              UPDATE new_club_launches
              SET
                launch_status = 'launched',
                actual_club_id = $1,
                match_type = 'auto',
                previous_status = $2,
                matched_at = CURRENT_TIMESTAMP,
                matched_club_name = $3,
                updated_at = CURRENT_TIMESTAMP
              WHERE id = $4
            `, [matchedClub.club_uuid, launch.launch_status, matchedClub.club_name, launch.launch_id]);

            // Transfer targets if exists
            if (launchTarget) {
              const activityResult = await queryProduction(`
                SELECT id FROM activity WHERE name = $1
              `, [launch.activity_name]);
              const activityId = activityResult.rows[0]?.id;

              if (activityId) {
                // Transfer launch targets to club targets (simple INSERT, no unique constraint)
                await queryLocal(`
                  INSERT INTO club_dimensional_targets (
                    club_id, activity_id, club_name, area_id, day_type_id, format_id,
                    target_meetups, target_revenue, progress, meetup_cost, meetup_capacity
                  )
                  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                `, [
                  matchedClub.club_id,
                  activityId,
                  matchedClub.club_name,
                  launchTarget.area_id,
                  launchTarget.day_type_id || null,
                  launchTarget.format_id || null,
                  launchTarget.target_meetups,
                  launchTarget.target_revenue,
                  launchTarget.progress,
                  launchTarget.meetup_cost || null,
                  launchTarget.meetup_capacity || null
                ]);
              }
            }

            // Add to matched launches map for display
            matchedLaunchesMap.set(matchedClub.club_uuid, {
              launch_id: launch.launch_id,
              original_name: launch.planned_club_name,
              matched_at: new Date().toISOString(),
              match_type: 'auto'
            });

            autoMatchedLaunches.push(launch.launch_id);
            logger.info(`Auto-matched launch ${launch.launch_id} (${launch.planned_club_name}) to club ${matchedClub.club_id} (${matchedClub.club_name})`);
          } catch (err) {
            logger.error(`Failed to auto-match launch ${launch.launch_id}:`, err);
          }
        }

        // Remove auto-matched launches from launchesData (they're now hidden)
        if (autoMatchedLaunches.length > 0) {
          launchesData = launchesData.filter(l => !autoMatchedLaunches.includes(l.launch_id));
          logger.info(`Auto-matched ${autoMatchedLaunches.length} launches, ${launchesData.length} remaining`);
        }
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
          batch.map(club => matchClubMeetups(
            club.club_id,
            club.club_name,
            weekStartDate || undefined,
            weekEndDate || undefined
          ))
        );
        for (const result of results) {
          autoMatchResults.set(result.club_id, result);
        }
      }
      logger.info(`Auto-matching completed for ${autoMatchResults.size} clubs`);
    }

    // Declare hierarchy variable for both code paths
    let hierarchy: any[];
    let launchCount = 0;

    // Use dynamic hierarchy builder when custom order is requested
    if (useCustomHierarchy) {
      logger.info('Using dynamic hierarchy builder');

      // Collect processed club data
      const processedClubs: ProcessedClubData[] = [];

      for (const club of clubsToProcess) {
        const activityId = parseInt(club.activity_id);
        const cityId = parseInt(club.city_id) || 0;
        const areaId = parseInt(club.area_id) || 0;
        const clubId = parseInt(club.club_id);

        // Filter targets to only include those matching this club node's area
        // Multi-city clubs appear under each city, but targets should only show
        // under the city/area where they're actually configured
        const allTargets = targetsMap.get(clubId) || [];
        const targets = allTargets.filter((t: any) => {
          const targetProdAreaId = parseInt(t.target_production_area_id);
          // Show target only if it matches this club node's area
          // (targets without area_id default to showing everywhere for backward compatibility)
          return !targetProdAreaId || targetProdAreaId === areaId;
        });
        const hasTargets = targets.length > 0;

        const targetMeetups = targets.reduce((sum: number, t: any) => sum + (parseInt(t.target_meetups) || 0), 0);
        const targetRevenue = targets.reduce((sum: number, t: any) => sum + (parseFloat(t.target_revenue) || 0), 0);

        const autoMatchResult = autoMatchResults.get(clubId);

        // MULTI-AREA FIX: Filter auto-match results by current area to avoid double-counting
        // Each area instance of a multi-area club should only include targets/revenue for that area
        const areaFilteredTargets = autoMatchResult?.targets.filter((t: any) => {
          const targetProdAreaId = t.production_area_id;
          // Include target if it matches this area, or if it has no area (legacy/default)
          return !targetProdAreaId || targetProdAreaId === areaId;
        }) || [];
        const areaUnattributed = autoMatchResult?.area_unattributed.find(
          (au: any) => au.area_id === areaId
        );
        const areaUnattributedRevenue = areaUnattributed?.total_revenue || 0;
        const areaUnattributedMeetups = areaUnattributed?.meetup_count || 0;

        let aggregatedProgress: any;
        // Only use auto-match results if there are actual targets configured for this area
        // This prevents legacy targets (without area_id) from showing in all areas
        if (hasTargets && areaFilteredTargets.length > 0) {
          aggregatedProgress = areaFilteredTargets.reduce((acc: any, t: any) => {
            return sumProgress([acc, t.new_progress]);
          }, { ...defaultProgress });
          aggregatedProgress.unattributed_meetups = (aggregatedProgress.unattributed_meetups || 0) + areaUnattributedMeetups;
        } else if (hasTargets) {
          // Has targets but no auto-match results - use stored progress
          aggregatedProgress = targets.reduce((acc: any, t: any) => {
            const tMeetups = parseInt(t.target_meetups) || 0;
            const p = syncProgress(t.progress, tMeetups);
            return sumProgress([acc, p]);
          }, { ...defaultProgress });
        } else {
          // No targets for this area - use empty progress
          aggregatedProgress = { ...defaultProgress };
        }

        const currentMeetups = parseInt(club.current_meetups) || 0;
        const currentRevenue = parseFloat(club.current_revenue) || 0;
        const gapMeetups = Math.max(0, targetMeetups - currentMeetups);
        const gapRevenue = Math.max(0, targetRevenue - currentRevenue);

        const clubLast4w = last4WeeksMap.get(clubId) || { total: 0, meetups: 0, weeks: 0 };
        const last4wTotal = clubLast4w.total;
        const last4wAvg = clubLast4w.weeks > 0 ? last4wTotal / 4 : 0;
        const l4wAvgMeetupsPerWeek = clubLast4w.meetups / 4; // Always divide by 4 for consistent weekly avg

        // Health metrics calculation for this club
        const healthMetrics = healthMetricsMap.get(clubId) || {
          capacity_pct: 0, meetup_count: 0, repeat_rate_pct: 0, avg_rating: 0, review_count: 0, is_new_club: false
        };
        const hasMeetups = healthMetrics.meetup_count > 0;
        const clubHealthScore = calculateHealthScore(
          healthMetrics.capacity_pct,
          healthMetrics.repeat_rate_pct,
          healthMetrics.avg_rating,
          healthMetrics.is_new_club
        );
        const clubHealthStatus = getHealthStatus(clubHealthScore, hasMeetups);

        let clubRevenueStatus: RevenueStatus;
        // Only use auto-match revenue status if there are actual targets configured for this area
        if (hasTargets && areaFilteredTargets.length > 0) {
          // Use area-filtered targets for revenue status
          const targetStatuses = areaFilteredTargets.map((t: any) => t.revenue_status);
          clubRevenueStatus = rollupRevenueStatuses(targetStatuses);
          clubRevenueStatus.unattributed += areaUnattributedRevenue;
        } else {
          clubRevenueStatus = calculateClubRevenueStatus(
            targets.map((t: any) => ({
              target_revenue: parseFloat(t.target_revenue) || 0,
              progress: syncProgress(t.progress, parseInt(t.target_meetups) || 0)
            })),
            currentRevenue
          );
        }
        const hasRevenueData = hasTargets || currentRevenue > 0;

        const validation = validateProgress(targetMeetups, currentMeetups, aggregatedProgress);
        const team = getTeamForClub(club.activity_name, club.city_name || 'Unknown');

        // Build target children
        const targetChildren = targets.map((t: any, idx: number) => {
          const tMeetups = parseInt(t.target_meetups) || 0;
          const tRevenue = parseFloat(t.target_revenue) || 0;
          const targetId = parseInt(t.target_id);
          const autoMatchedTarget = autoMatchResult?.targets.find((mt: any) => mt.target_id === targetId);
          // Use auto-matched progress if available, otherwise sync stored progress with target
          const tProgress = autoMatchedTarget?.new_progress || syncProgress(t.progress, tMeetups);
          const matchedMeetups = autoMatchedTarget?.matched_count || 0;
          const matchedRevenue = autoMatchedTarget?.matched_revenue || 0;
          const tRevenueStatus = autoMatchedTarget?.revenue_status || null;

          let targetName = t.target_name;
          if (!targetName) {
            const dimensionParts = [];
            if (t.day_type_name) dimensionParts.push(t.day_type_name);
            if (t.format_name) dimensionParts.push(t.format_name);
            targetName = dimensionParts.length > 0 ? dimensionParts.join(' / ') : `Target ${idx + 1}`;
          }

          return {
            type: 'target',
            id: `target:${targetId}`, // Will be updated with full path
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
            current_meetups: matchedMeetups,
            current_revenue: matchedRevenue,
            gap_meetups: Math.max(0, tMeetups - matchedMeetups),
            gap_revenue: Math.max(0, tRevenue - matchedRevenue),
            progress_summary: tProgress,
            validation_status: validateProgress(tMeetups, 0, tProgress).status,
            has_target: true,
            is_launch: false,
            team: team,
            revenue_status: tRevenueStatus,
            revenue_status_display: tRevenueStatus ? getRevenueStatusDisplay(tRevenueStatus) : null,
            activity_name: club.activity_name,
            city_name: club.city_name || 'Unknown',
            area_name: club.area_name || 'Unknown',
            club_name: club.club_name
          };
        });

        const primaryTarget = targets.length > 0 ? targets[0] : null;
        const dayTypeId = primaryTarget?.day_type_id ? parseInt(primaryTarget.day_type_id) : null;
        const dayTypeName = primaryTarget?.day_type_name || null;
        // Copy cost/capacity from primary target for single-target clubs
        const meetupCost = targets.length === 1 && primaryTarget?.meetup_cost ? parseFloat(primaryTarget.meetup_cost) : null;
        const meetupCapacity = targets.length === 1 && primaryTarget?.meetup_capacity ? parseInt(primaryTarget.meetup_capacity) : null;

        // Check if this club was matched from a launch target
        const clubUuid = club.club_uuid;
        const matchedLaunchInfo = clubUuid ? matchedLaunchesMap.get(clubUuid) : null;

        const clubNode = {
          type: 'club',
          id: `club:${clubId}`, // Will be updated with full path
          name: club.club_name,
          club_id: clubId,
          club_uuid: clubUuid,
          activity_id: activityId,
          area_id: areaId,
          city_id: cityId,
          target_id: targets.length === 1 ? parseInt(targets[0].target_id) : null,
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
          l4w_avg_meetups_per_week: l4wAvgMeetupsPerWeek,
          team: team,
          target_count: targets.length,
          day_type_id: dayTypeId,
          day_type_name: dayTypeName,
          meetup_cost: meetupCost,
          meetup_capacity: meetupCapacity,
          revenue_status: hasRevenueData ? clubRevenueStatus : null,
          revenue_status_display: hasRevenueData ? getRevenueStatusDisplay(clubRevenueStatus) : null,
          children: targetChildren.length >= 1 ? targetChildren : undefined,
          activity_name: club.activity_name,
          city_name: club.city_name || 'Unknown',
          area_name: club.area_name || 'Unknown',
          // Health metrics
          health_score: clubHealthScore,
          health_status: clubHealthStatus,
          capacity_pct: healthMetrics.capacity_pct,
          repeat_rate_pct: healthMetrics.repeat_rate_pct,
          avg_rating: healthMetrics.avg_rating,
          is_new_club: healthMetrics.is_new_club,
          // Individual metric health status
          capacity_health: getMetricHealth(healthMetrics.capacity_pct, HEALTH_THRESHOLDS.capacity_utilization),
          repeat_health: healthMetrics.is_new_club ? 'green' : getMetricHealth(healthMetrics.repeat_rate_pct, HEALTH_THRESHOLDS.repeat_rate),
          rating_health: getMetricHealth(healthMetrics.avg_rating, HEALTH_THRESHOLDS.avg_rating),
          // Leader requirements summary
          leaders_required_total: leaderRequirementsMap.get(clubId)?.leaders_required_total || 0,
          leader_requirements_summary: leaderRequirementsMap.get(clubId) || null,
          // Matched from launch indicator (if this club was transitioned from a launch target)
          matched_from_launch: matchedLaunchInfo || null
        };

        const levelValues: Record<HierarchyLevel, { id: number; name: string }> = {
          activity: { id: activityId, name: club.activity_name },
          city: { id: cityId, name: club.city_name || 'Unknown' },
          area: { id: areaId, name: club.area_name || 'Unknown' }
        };

        processedClubs.push({
          club,
          clubNode,
          levelValues,
          hasTargets,
          hasRevenueData,
          clubRevenueStatus,
          aggregatedProgress,
          last4wTotal
        });
      }

      // Collect processed launches
      const processedLaunches: ProcessedLaunchData[] = [];

      if (includeLaunches && launchesData.length > 0) {
        // Get activity mapping
        const activityMapQuery = `SELECT id, name FROM activity WHERE name != 'Test'`;
        const activityMapResult = await queryProduction(activityMapQuery);
        const activityNameToId = new Map(activityMapResult.rows.map((a: any) => [a.name, parseInt(a.id)]));

        // Get area info
        const areaInfoQuery = `
          SELECT ar.id, ar.name, ci.id as city_id, ci.name as city_name
          FROM area ar
          JOIN city ci ON ar.city_id = ci.id
        `;
        const areaInfoResult = await queryProduction(areaInfoQuery);
        const areaNameToInfo = new Map(areaInfoResult.rows.map((a: any) => [a.name.toLowerCase(), a]));
        const areaIdToInfo = new Map(areaInfoResult.rows.map((a: any) => [parseInt(a.id), a]));

        // Get dim_areas mapping
        const dimAreasMapQuery = `SELECT id as dim_area_id, production_area_id FROM dim_areas`;
        const dimAreasMapResult = await queryLocal(dimAreasMapQuery);
        const dimToProductionAreaMap = new Map(dimAreasMapResult.rows.map((a: any) => [parseInt(a.dim_area_id), parseInt(a.production_area_id)]));

        for (const launch of launchesData) {
          const activityId = activityNameToId.get(launch.activity_name);
          if (!activityId) continue;

          const launchTarget = launchTargetsMap.get(launch.launch_id);
          const dimAreaId = launchTarget?.area_id ? parseInt(launchTarget.area_id) : null;
          const targetAreaId = dimAreaId ? dimToProductionAreaMap.get(dimAreaId) : null;

          let areaInfo = targetAreaId ?
            areaIdToInfo.get(targetAreaId) :
            areaNameToInfo.get((launch.planned_area || '').toLowerCase());

          if (!areaInfo) {
            areaInfo = { id: 0, name: launch.planned_area || 'Unknown', city_id: 0, city_name: launch.planned_city || 'Unknown' };
          }

          const cityId = parseInt(areaInfo.city_id) || 0;
          const areaId = parseInt(areaInfo.id) || 0;

          const targetMeetups = launchTarget?.target_meetups || 0;
          const targetRevenue = launchTarget?.target_revenue || parseFloat(launch.target_revenue_rupees) || 0;
          const progress = launchTarget?.progress || defaultProgress;
          const validation = validateProgress(targetMeetups, 0, progress);
          const launchTeam = getTeamForClub(launch.activity_name, areaInfo.city_name || 'Unknown');

          // Get leader requirements for this launch
          const launchLeaderReq = launchLeaderRequirementsMap.get(launch.launch_id) || {
            leaders_required_total: 0,
            total_requirements: 0,
            not_picked: 0,
            deprioritised: 0,
            in_progress: 0,
            done: 0
          };

          const launchNode = {
            type: 'launch',
            id: `launch:${launch.launch_id}`, // Will be updated with full path
            name: launch.planned_club_name || `New ${launch.activity_name} Club`,
            launch_id: launch.launch_id,
            activity_id: activityId,
            activity_name: launch.activity_name,
            area_id: areaId,
            city_id: cityId,
            target_id: launchTarget?.target_id || null,
            target_meetups: targetMeetups,
            target_revenue: targetRevenue,
            meetup_cost: launchTarget?.meetup_cost ? parseFloat(launchTarget.meetup_cost) : null,
            meetup_capacity: launchTarget?.meetup_capacity ? parseInt(launchTarget.meetup_capacity) : null,
            current_meetups: 0,
            current_revenue: 0,
            gap_meetups: Math.max(0, targetMeetups),
            gap_revenue: Math.max(0, targetRevenue),
            progress_summary: progress,
            validation_status: validation.status,
            validation_message: validation.message,
            has_target: !!launchTarget || targetMeetups > 0,
            is_launch: true,
            launch_status: launch.launch_status,
            planned_launch_date: launch.planned_launch_date,
            milestones: launch.milestones,
            team: launchTeam,
            city_name: areaInfo.city_name || 'Unknown',
            area_name: areaInfo.name || 'Unknown',
            leaders_required_total: launchLeaderReq.leaders_required_total,
            leader_requirements_summary: {
              total_requirements: launchLeaderReq.total_requirements,
              not_picked: launchLeaderReq.not_picked,
              deprioritised: launchLeaderReq.deprioritised,
              in_progress: launchLeaderReq.in_progress,
              done: launchLeaderReq.done
            }
          };

          const levelValues: Record<HierarchyLevel, { id: number; name: string }> = {
            activity: { id: activityId, name: launch.activity_name },
            city: { id: cityId, name: areaInfo.city_name || 'Unknown' },
            area: { id: areaId, name: areaInfo.name || 'Unknown' }
          };

          processedLaunches.push({
            launch,
            launchNode,
            levelValues,
            progress,
            hasTarget: !!launchTarget || targetMeetups > 0
          });
          launchCount++;
        }
      }

      // Process expansion targets - clubs with targets in areas different from their home area
      // This needs to be done BEFORE building the hierarchy
      const allTargetDimAreaIds = new Set<number>();
      for (const club of clubsToProcess) {
        const clubId = parseInt(club.club_id);
        const targets = targetsMap.get(clubId) || [];
        for (const t of targets) {
          const targetDimAreaId = parseInt(t.target_area_id);
          if (targetDimAreaId) allTargetDimAreaIds.add(targetDimAreaId);
        }
      }

      if (allTargetDimAreaIds.size > 0) {
        // Map dim_area_ids to production_area_ids
        const dimAreasMapQuery = `SELECT id as dim_area_id, production_area_id FROM dim_areas WHERE id = ANY($1)`;
        const dimAreasMapResult = await queryLocal(dimAreasMapQuery, [[...allTargetDimAreaIds]]);
        const dimToProductionMap = new Map<number, number>(
          dimAreasMapResult.rows.map((a: any) => [parseInt(a.dim_area_id), parseInt(a.production_area_id)])
        );

        // Build map of club_id → all areas where club has events (regular nodes)
        // This prevents creating expansion nodes for areas where the club already appears
        const clubExistingAreas = new Map<number, Set<number>>();
        for (const club of clubsToProcess) {
          const clubId = parseInt(club.club_id);
          const areaId = parseInt(club.area_id) || 0;
          if (!clubExistingAreas.has(clubId)) {
            clubExistingAreas.set(clubId, new Set());
          }
          clubExistingAreas.get(clubId)!.add(areaId);
        }

        // Collect expansion targets - only for areas where club doesn't already have a regular node
        const expansionTargets: { club: any, target: any, expansionDimAreaId: number, expansionProdAreaId: number }[] = [];
        const processedExpansions = new Set<string>(); // Prevent duplicates from multi-city clubs

        for (const club of clubsToProcess) {
          const clubId = parseInt(club.club_id);
          const targets = targetsMap.get(clubId) || [];
          const existingAreas = clubExistingAreas.get(clubId) || new Set();

          for (const target of targets) {
            const targetDimAreaId = parseInt(target.target_area_id);
            if (!targetDimAreaId) continue;

            const targetProdAreaId = dimToProductionMap.get(targetDimAreaId);
            // Only create expansion if:
            // 1. Target has a valid production area
            // 2. Club doesn't already have a regular node in that area (prevents duplicates)
            if (targetProdAreaId && !existingAreas.has(targetProdAreaId)) {
              const expansionKey = `${clubId}-${targetDimAreaId}`;
              if (!processedExpansions.has(expansionKey)) {
                processedExpansions.add(expansionKey);
                expansionTargets.push({
                  club,
                  target,
                  expansionDimAreaId: targetDimAreaId,
                  expansionProdAreaId: targetProdAreaId
                });
              }
            }
          }
        }

        // Process expansion targets if any
        if (expansionTargets.length > 0) {
          const expansionProdAreaIds = [...new Set(expansionTargets.map(e => e.expansionProdAreaId))];

          // Fetch area info from production for expansion areas
          const areaInfoQuery = `
            SELECT ar.id, ar.name as area_name, ci.id as city_id, ci.name as city_name
            FROM area ar
            JOIN city ci ON ar.city_id = ci.id
            WHERE ar.id = ANY($1)
          `;
          const areaInfoResult = await queryProduction(areaInfoQuery, [expansionProdAreaIds]);
          const productionAreaInfo = new Map(areaInfoResult.rows.map((a: any) => [parseInt(a.id), a]));

          // Map dim_area_id -> area info
          const expansionAreaInfo = new Map<number, any>();
          for (const [dimAreaId, productionAreaId] of dimToProductionMap) {
            const areaInfo = productionAreaInfo.get(productionAreaId);
            if (areaInfo) expansionAreaInfo.set(dimAreaId, areaInfo);
          }

          // Group expansion targets by (club_id, expansion_dim_area_id)
          const expansionsByClubArea = new Map<string, { club: any, targets: any[], areaInfo: any }>();
          for (const { club, target, expansionDimAreaId } of expansionTargets) {
            const key = `${club.club_id}-${expansionDimAreaId}`;
            if (!expansionsByClubArea.has(key)) {
              expansionsByClubArea.set(key, {
                club,
                targets: [],
                areaInfo: expansionAreaInfo.get(expansionDimAreaId)
              });
            }
            expansionsByClubArea.get(key)!.targets.push(target);
          }

          // Create ProcessedClubData entries for each expansion
          for (const [, { club, targets, areaInfo }] of expansionsByClubArea) {
            if (!areaInfo) continue;

            const activityId = parseInt(club.activity_id);
            const cityId = parseInt(areaInfo.city_id);
            const areaId = parseInt(areaInfo.id);
            const clubId = parseInt(club.club_id);

            // Aggregate targets for this expansion
            const targetMeetups = targets.reduce((sum: number, t: any) => sum + (parseInt(t.target_meetups) || 0), 0);
            const targetRevenue = targets.reduce((sum: number, t: any) => sum + (parseFloat(t.target_revenue) || 0), 0);
            const currentMeetups = 0;
            const currentRevenue = 0;

            // Aggregate progress
            const aggregatedProgress = targets.reduce((acc: any, t: any) => {
              const tMeetups = parseInt(t.target_meetups) || 0;
              return sumProgress([acc, syncProgress(t.progress, tMeetups)]);
            }, { ...defaultProgress });

            const validation = validateProgress(targetMeetups, currentMeetups, aggregatedProgress);
            const team = getTeamForClub(club.activity_name, areaInfo.city_name);

            // Build target children for this expansion
            const targetChildren = targets.map((t: any) => {
              const tMeetups = parseInt(t.target_meetups) || 0;
              const tRevenue = parseFloat(t.target_revenue) || 0;
              const targetId = parseInt(t.target_id);
              const tProgress = syncProgress(t.progress, tMeetups);
              const tValidation = validateProgress(tMeetups, 0, tProgress);

              return {
                type: 'target',
                id: `target:${targetId}-expansion-${areaId}`,
                name: t.target_name || `Target ${targetId}`,
                target_id: targetId,
                club_id: clubId,
                target_meetups: tMeetups,
                target_revenue: tRevenue,
                current_meetups: 0,
                current_revenue: 0,
                gap_meetups: tMeetups,
                gap_revenue: tRevenue,
                progress_summary: tProgress,
                validation_status: tValidation.status,
                has_target: true,
                is_launch: false,
                is_expansion: true,
                team: team
              };
            });

            // Create expansion club node
            const expansionClubNode = {
              type: 'club',
              id: `club:${clubId}-expansion-${areaId}`,
              name: `${club.club_name} (Expansion)`,
              club_id: clubId,
              activity_id: activityId,
              area_id: areaId,
              city_id: cityId,
              target_id: targets.length === 1 ? parseInt(targets[0].target_id) : null,
              target_meetups: targetMeetups,
              target_revenue: targetRevenue,
              current_meetups: currentMeetups,
              current_revenue: currentRevenue,
              gap_meetups: Math.max(0, targetMeetups - currentMeetups),
              gap_revenue: Math.max(0, targetRevenue - currentRevenue),
              progress_summary: aggregatedProgress,
              validation_status: validation.status,
              validation_message: validation.message,
              has_target: true,
              is_launch: false,
              is_expansion: true,
              team: team,
              target_count: targets.length,
              children: targetChildren.length >= 1 ? targetChildren : undefined,
              activity_name: club.activity_name,
              city_name: areaInfo.city_name,
              area_name: areaInfo.area_name
            };

            const levelValues: Record<HierarchyLevel, { id: number; name: string }> = {
              activity: { id: activityId, name: club.activity_name },
              city: { id: cityId, name: areaInfo.city_name },
              area: { id: areaId, name: areaInfo.area_name }
            };

            processedClubs.push({
              club: { ...club, is_expansion: true },
              clubNode: expansionClubNode,
              levelValues,
              hasTargets: true,
              hasRevenueData: false,
              clubRevenueStatus: undefined as any,
              aggregatedProgress,
              last4wTotal: 0
            });
          }
        }
      }

      // Build and convert dynamic hierarchy
      const rootMap = buildDynamicHierarchy(processedClubs, processedLaunches, hierarchyLevels);
      hierarchy = convertDynamicHierarchyToArray(rootMap, hierarchyLevels);

      // Calculate overall summary
      const overallProgress = sumProgress(hierarchy.map(a => a.progress_summary));
      const totalTargetMeetups = hierarchy.reduce((sum, a) => sum + a.target_meetups, 0);
      const totalTargetRevenue = hierarchy.reduce((sum, a) => sum + a.target_revenue, 0);
      const totalCurrentMeetups = hierarchy.reduce((sum, a) => sum + a.current_meetups, 0);
      const totalCurrentRevenue = hierarchy.reduce((sum, a) => sum + a.current_revenue, 0);
      const totalLast4wRevenue = hierarchy.reduce((sum, a) => sum + (a.last_4w_revenue_total || 0), 0);

      return res.json({
        success: true,
        hierarchy,
        hierarchy_order: hierarchyLevels,
        summary: {
          total_activities: hierarchy.filter(n => n.type === 'activity').length || hierarchy.reduce((sum, n) => sum + (n.activity_count || 0), 0),
          total_cities: hierarchy.filter(n => n.type === 'city').length || hierarchy.reduce((sum, n) => sum + (n.city_count || 0), 0),
          total_areas: hierarchy.filter(n => n.type === 'area').length || hierarchy.reduce((sum, n) => sum + (n.area_count || 0), 0),
          total_clubs: clubsToProcess.length,
          total_launches: launchCount,
          total_target_meetups: totalTargetMeetups,
          total_target_revenue: totalTargetRevenue,
          total_current_meetups: totalCurrentMeetups,
          total_current_revenue: totalCurrentRevenue,
          overall_progress: overallProgress,
          overall_validation_status: validateProgress(totalTargetMeetups, totalCurrentMeetups, overallProgress).status,
          monthly_target_meetups: Math.round(totalTargetMeetups * 4.2),
          monthly_target_revenue: Math.round(totalTargetRevenue * 4.2),
          last_4w_revenue_total: totalLast4wRevenue,
          last_4w_revenue_avg: totalLast4wRevenue / 4,
          march_2026_revenue: march2026Revenue,
          monthly_revenue: monthlyRevenue
        }
      });
    }

    // === DEFAULT HIERARCHY: Activity → City → Area → Clubs ===
    // Build hierarchy: Activity → City → Area → Clubs
    const activityMap = new Map<number, any>();

    for (const club of clubsToProcess) {
      const activityId = parseInt(club.activity_id);
      const cityId = parseInt(club.city_id) || 0;
      const areaId = parseInt(club.area_id) || 0;
      const clubId = parseInt(club.club_id);

      // Filter targets to only include those matching this club node's area
      // Multi-city clubs appear under each city, but targets should only show
      // under the city/area where they're actually configured
      const allTargets = targetsMap.get(clubId) || [];
      const targets = allTargets.filter((t: any) => {
        const targetProdAreaId = parseInt(t.target_production_area_id);
        // Show target only if it matches this club node's area
        // (targets without area_id default to showing everywhere for backward compatibility)
        return !targetProdAreaId || targetProdAreaId === areaId;
      });
      const hasTargets = targets.length > 0;

      // Aggregate target totals across all targets for the club row
      const targetMeetups = targets.reduce((sum, t) => sum + (parseInt(t.target_meetups) || 0), 0);
      const targetRevenue = targets.reduce((sum, t) => sum + (parseFloat(t.target_revenue) || 0), 0);

      // Check for auto-matching results
      const autoMatchResult = autoMatchResults.get(clubId);

      // MULTI-AREA FIX: Filter auto-match results by current area to avoid double-counting
      // Each area instance of a multi-area club should only include targets/revenue for that area
      const areaFilteredTargets = autoMatchResult?.targets.filter((t: any) => {
        const targetProdAreaId = t.production_area_id;
        // Include target if it matches this area, or if it has no area (legacy/default)
        return !targetProdAreaId || targetProdAreaId === areaId;
      }) || [];
      const areaUnattributed = autoMatchResult?.area_unattributed.find(
        (au: any) => au.area_id === areaId
      );
      const areaUnattributedRevenue = areaUnattributed?.total_revenue || 0;
      const areaUnattributedMeetups = areaUnattributed?.meetup_count || 0;

      // Aggregate progress across all targets
      // Only use auto-match results if there are actual targets configured for this area
      // This prevents legacy targets (without area_id) from showing in all areas
      let aggregatedProgress: any;
      if (hasTargets && areaFilteredTargets.length > 0) {
        // Use auto-matched progress (filtered by area)
        aggregatedProgress = areaFilteredTargets.reduce((acc: any, t: any) => {
          return sumProgress([acc, t.new_progress]);
        }, { ...defaultProgress });
        // Add area-level unattributed meetups (meetups that didn't match any target in THIS area)
        aggregatedProgress.unattributed_meetups = (aggregatedProgress.unattributed_meetups || 0) + areaUnattributedMeetups;
      } else if (hasTargets) {
        // Has targets but no auto-match results - use stored progress
        aggregatedProgress = targets.reduce((acc, t) => {
          const tMeetups = parseInt(t.target_meetups) || 0;
          const p = syncProgress(t.progress, tMeetups);
          return sumProgress([acc, p]);
        }, { ...defaultProgress });
      } else {
        // No targets for this area - use empty progress
        aggregatedProgress = { ...defaultProgress };
      }

      const currentMeetups = parseInt(club.current_meetups) || 0;
      const currentRevenue = parseFloat(club.current_revenue) || 0;

      // Gap should not be negative
      const gapMeetups = Math.max(0, targetMeetups - currentMeetups);
      const gapRevenue = Math.max(0, targetRevenue - currentRevenue);

      // Get last 4 weeks revenue and meetups for this club
      const clubLast4w = last4WeeksMap.get(clubId) || { total: 0, meetups: 0, weeks: 0 };
      const last4wTotal = clubLast4w.total;
      const last4wAvg = clubLast4w.weeks > 0 ? last4wTotal / 4 : 0; // Always divide by 4 for consistent avg
      const l4wAvgMeetupsPerWeek = clubLast4w.meetups / 4; // Avg meetups per week

      // Health metrics calculation for this club
      const healthMetrics = healthMetricsMap.get(clubId) || {
        capacity_pct: 0, meetup_count: 0, repeat_rate_pct: 0, avg_rating: 0, review_count: 0, is_new_club: false
      };
      const hasMeetups = healthMetrics.meetup_count > 0;
      const clubHealthScore = calculateHealthScore(
        healthMetrics.capacity_pct,
        healthMetrics.repeat_rate_pct,
        healthMetrics.avg_rating,
        healthMetrics.is_new_club
      );
      const clubHealthStatus = getHealthStatus(clubHealthScore, hasMeetups);

      // Calculate revenue status for this club
      // Only use auto-match revenue status if there are actual targets configured for this area
      let clubRevenueStatus: RevenueStatus;
      if (hasTargets && areaFilteredTargets.length > 0) {
        // Rollup from auto-matched revenue statuses (filtered by area)
        const targetStatuses = areaFilteredTargets.map((t: any) => t.revenue_status);
        clubRevenueStatus = rollupRevenueStatuses(targetStatuses);
        // Add area-specific unattributed revenue
        clubRevenueStatus.unattributed += areaUnattributedRevenue;
      } else {
        // Use stored progress for revenue calculation
        clubRevenueStatus = calculateClubRevenueStatus(
          targets.map(t => ({
            target_revenue: parseFloat(t.target_revenue) || 0,
            progress: syncProgress(t.progress, parseInt(t.target_meetups) || 0)
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
          activity_name: club.activity_name, // For modal context
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
          leaders_required_total: 0,
          leader_requirements_summary: { total_requirements: 0, not_picked: 0, deprioritised: 0, in_progress: 0, done: 0 },
          children: new Map<number, any>(),
          // MULTI-CITY: Track unique club IDs to avoid double-counting in rollups
          unique_club_ids: new Set<number>(),
          rolled_up_leader_club_ids: new Set<number>()
        });
      }

      const activityNode = activityMap.get(activityId);
      activityNode.target_meetups += targetMeetups;
      activityNode.target_revenue += targetRevenue;
      activityNode.current_meetups += currentMeetups;
      activityNode.current_revenue += currentRevenue;
      // MULTI-CITY: Only count unique clubs at activity level
      if (!activityNode.unique_club_ids.has(clubId)) {
        activityNode.unique_club_ids.add(clubId);
        activityNode.club_count++;
      }
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
          city_name: club.city_name || 'Unknown', // For modal context
          activity_id: activityId, // For modal context
          activity_name: club.activity_name, // For modal context
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
          leaders_required_total: 0,
          leader_requirements_summary: { total_requirements: 0, not_picked: 0, deprioritised: 0, in_progress: 0, done: 0 },
          children: new Map<number, any>(),
          // MULTI-CITY: Track unique clubs for rollups (each club appears once per city)
          unique_club_ids: new Set<number>(),
          rolled_up_leader_club_ids: new Set<number>()
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
          area_name: club.area_name || 'Unknown', // For modal context
          city_id: cityId,
          city_name: club.city_name || 'Unknown', // For modal context
          activity_id: activityId, // For modal context
          activity_name: club.activity_name, // For modal context
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
          leaders_required_total: 0,
          leader_requirements_summary: { total_requirements: 0, not_picked: 0, deprioritised: 0, in_progress: 0, done: 0 },
          children: [],
          // MULTI-CITY: Track unique clubs for rollups
          unique_club_ids: new Set<number>(),
          rolled_up_leader_club_ids: new Set<number>()
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

        // Get auto-matched progress if available, otherwise sync stored progress with target
        const autoMatchedTarget = autoMatchResult?.targets.find(mt => mt.target_id === targetId);
        const tProgress = autoMatchedTarget?.new_progress || syncProgress(t.progress, tMeetups);
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

      // Check if this club was matched from a launch target
      const clubUuid = club.club_uuid;
      const matchedLaunchInfo = clubUuid ? matchedLaunchesMap.get(clubUuid) : null;

      const clubNode = {
        type: 'club',
        id: `activity:${activityId}-city:${cityId}-area:${areaId}-club:${clubId}`,
        name: club.club_name,
        club_id: clubId,
        club_uuid: clubUuid,
        activity_id: activityId,
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
        l4w_avg_meetups_per_week: l4wAvgMeetupsPerWeek,
        team: team,
        target_count: targets.length, // Number of targets for this club
        day_type_id: dayTypeId,
        day_type_name: dayTypeName,
        revenue_status: hasRevenueData ? clubRevenueStatus : null,
        revenue_status_display: hasRevenueData ? getRevenueStatusDisplay(clubRevenueStatus) : null,
        children: targetChildren.length >= 1 ? targetChildren : undefined, // Show children even when 1 target
        // Health metrics
        health_score: clubHealthScore,
        health_status: clubHealthStatus,
        capacity_pct: healthMetrics.capacity_pct,
        repeat_rate_pct: healthMetrics.repeat_rate_pct,
        avg_rating: healthMetrics.avg_rating,
        is_new_club: healthMetrics.is_new_club,
        // Individual metric health status
        capacity_health: getMetricHealth(healthMetrics.capacity_pct, HEALTH_THRESHOLDS.capacity_utilization),
        repeat_health: healthMetrics.is_new_club ? 'green' : getMetricHealth(healthMetrics.repeat_rate_pct, HEALTH_THRESHOLDS.repeat_rate),
        rating_health: getMetricHealth(healthMetrics.avg_rating, HEALTH_THRESHOLDS.avg_rating),
        // Leader requirements summary
        leaders_required_total: leaderRequirementsMap.get(clubId)?.leaders_required_total || 0,
        leader_requirements_summary: leaderRequirementsMap.get(clubId) || null,
        // Matched from launch indicator (if this club was transitioned from a launch target)
        matched_from_launch: matchedLaunchInfo || null
      };

      areaNode.children.push(clubNode);

      // Roll up progress only if club has targets
      if (hasTargets) {
        areaNode.progress_summary = sumProgress([areaNode.progress_summary, aggregatedProgress]);
      }

      // Roll up leader requirements to area, city, activity
      // MULTI-CITY: Leader requirements are tied to club, not city. When a club appears in
      // multiple cities, we should show its requirements under each city instance, but only
      // count them once at the activity level to avoid double-counting in totals.
      const clubLeaderReq = leaderRequirementsMap.get(clubId);
      if (clubLeaderReq) {
        // Area rollup - each club appears once per area (determined by most recent event in city)
        areaNode.leaders_required_total += clubLeaderReq.leaders_required_total || 0;
        areaNode.leader_requirements_summary.total_requirements += clubLeaderReq.total_requirements || 0;
        areaNode.leader_requirements_summary.not_picked += clubLeaderReq.not_picked || 0;
        areaNode.leader_requirements_summary.deprioritised += clubLeaderReq.deprioritised || 0;
        areaNode.leader_requirements_summary.in_progress += clubLeaderReq.in_progress || 0;
        areaNode.leader_requirements_summary.done += clubLeaderReq.done || 0;

        // City rollup - each club appears once per city
        cityNode.leaders_required_total += clubLeaderReq.leaders_required_total || 0;
        cityNode.leader_requirements_summary.total_requirements += clubLeaderReq.total_requirements || 0;
        cityNode.leader_requirements_summary.not_picked += clubLeaderReq.not_picked || 0;
        cityNode.leader_requirements_summary.deprioritised += clubLeaderReq.deprioritised || 0;
        cityNode.leader_requirements_summary.in_progress += clubLeaderReq.in_progress || 0;
        cityNode.leader_requirements_summary.done += clubLeaderReq.done || 0;

        // Activity rollup - MULTI-CITY: Only count unique clubs to avoid double-counting
        if (!activityNode.rolled_up_leader_club_ids.has(clubId)) {
          activityNode.rolled_up_leader_club_ids.add(clubId);
          activityNode.leaders_required_total += clubLeaderReq.leaders_required_total || 0;
          activityNode.leader_requirements_summary.total_requirements += clubLeaderReq.total_requirements || 0;
          activityNode.leader_requirements_summary.not_picked += clubLeaderReq.not_picked || 0;
          activityNode.leader_requirements_summary.deprioritised += clubLeaderReq.deprioritised || 0;
          activityNode.leader_requirements_summary.in_progress += clubLeaderReq.in_progress || 0;
          activityNode.leader_requirements_summary.done += clubLeaderReq.done || 0;
        }
      }
    }

    // Process expansion targets - clubs with targets in areas different from their home area
    // First, get all unique dim_area_ids from targets and resolve them to production_area_ids
    const allTargetDimAreaIds = new Set<number>();
    for (const club of clubsToProcess) {
      const clubId = parseInt(club.club_id);
      const targets = targetsMap.get(clubId) || [];
      for (const target of targets) {
        if (target.target_area_id) {
          allTargetDimAreaIds.add(parseInt(target.target_area_id));
        }
      }
    }

    // Resolve all dim_areas.id to production_area_id upfront
    let dimToProductionMap = new Map<number, number>();
    if (allTargetDimAreaIds.size > 0) {
      const dimAreasQuery = `
        SELECT id as dim_area_id, production_area_id
        FROM dim_areas
        WHERE id = ANY($1)
      `;
      const dimAreasResult = await queryLocal(dimAreasQuery, [[...allTargetDimAreaIds]]);
      dimToProductionMap = new Map(dimAreasResult.rows.map((a: any) => [parseInt(a.dim_area_id), parseInt(a.production_area_id)]));
    }

    // Build map of club_id → all areas where club has events (regular nodes)
    // This prevents creating expansion nodes for areas where the club already appears
    const clubExistingAreasDefault = new Map<number, Set<number>>();
    for (const club of clubsToProcess) {
      const clubId = parseInt(club.club_id);
      const areaId = parseInt(club.area_id) || 0;
      if (!clubExistingAreasDefault.has(clubId)) {
        clubExistingAreasDefault.set(clubId, new Set());
      }
      clubExistingAreasDefault.get(clubId)!.add(areaId);
    }

    // Now collect expansion targets by comparing PRODUCTION area IDs
    // Only create expansion for areas where club doesn't already have a regular node
    const expansionTargets: { club: any, target: any, expansionDimAreaId: number, expansionProdAreaId: number }[] = [];
    const processedExpansionsDefault = new Set<string>(); // Prevent duplicates from multi-city clubs

    for (const club of clubsToProcess) {
      const clubId = parseInt(club.club_id);
      const targets = targetsMap.get(clubId) || [];
      const existingAreas = clubExistingAreasDefault.get(clubId) || new Set();

      for (const target of targets) {
        const targetDimAreaId = target.target_area_id ? parseInt(target.target_area_id) : null;
        if (!targetDimAreaId) continue;

        // Resolve dim_areas.id to production_area_id for proper comparison
        const targetProdAreaId = dimToProductionMap.get(targetDimAreaId);

        // Only create expansion if:
        // 1. Target has a valid production area
        // 2. Club doesn't already have a regular node in that area (prevents duplicates)
        if (targetProdAreaId && !existingAreas.has(targetProdAreaId)) {
          const expansionKey = `${clubId}-${targetDimAreaId}`;
          if (!processedExpansionsDefault.has(expansionKey)) {
            processedExpansionsDefault.add(expansionKey);
            expansionTargets.push({
              club,
              target,
              expansionDimAreaId: targetDimAreaId,
              expansionProdAreaId: targetProdAreaId
            });
          }
        }
      }
    }

    // Process expansion targets if any
    if (expansionTargets.length > 0) {
      // Get unique expansion production area IDs for querying production DB
      const expansionProdAreaIds = [...new Set(expansionTargets.map(e => e.expansionProdAreaId))];

      // Fetch area info from production for expansion areas using production_area_id
      const areaInfoQuery = `
        SELECT ar.id, ar.name as area_name, ci.id as city_id, ci.name as city_name
        FROM area ar
        JOIN city ci ON ar.city_id = ci.id
        WHERE ar.id = ANY($1)
      `;
      const areaInfoResult = await queryProduction(areaInfoQuery, [expansionProdAreaIds]);
      // Map by production area ID
      const productionAreaInfo = new Map(areaInfoResult.rows.map((a: any) => [parseInt(a.id), a]));
      // Create map: dim_area_id -> area info (for backwards compatibility with rest of code)
      const expansionAreaInfo = new Map<number, any>();
      for (const [dimAreaId, productionAreaId] of dimToProductionMap) {
        const areaInfo = productionAreaInfo.get(productionAreaId);
        if (areaInfo) {
          expansionAreaInfo.set(dimAreaId, areaInfo);
        }
      }

      // Group expansion targets by (club_id, expansion_dim_area_id)
      const expansionsByClubArea = new Map<string, { club: any, targets: any[], areaInfo: any }>();
      for (const { club, target, expansionDimAreaId } of expansionTargets) {
        const key = `${club.club_id}-${expansionDimAreaId}`;
        if (!expansionsByClubArea.has(key)) {
          expansionsByClubArea.set(key, {
            club,
            targets: [],
            areaInfo: expansionAreaInfo.get(expansionDimAreaId)
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
          const tMeetups = parseInt(t.target_meetups) || 0;
          const p = syncProgress(t.progress, tMeetups);
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
            children: new Map<number, any>(),
            // MULTI-CITY: Track unique club IDs to avoid double-counting in rollups
            unique_club_ids: new Set<number>(),
            rolled_up_leader_club_ids: new Set<number>()
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
            city_name: areaInfo.city_name, // For modal context
            activity_id: activityId, // For modal context
            activity_name: club.activity_name, // For modal context
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
            children: new Map<number, any>(),
            // MULTI-CITY: Track unique clubs for rollups
            unique_club_ids: new Set<number>(),
            rolled_up_leader_club_ids: new Set<number>()
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
            area_name: areaInfo.area_name, // For modal context
            city_id: cityId,
            city_name: areaInfo.city_name, // For modal context
            activity_id: activityId, // For modal context
            activity_name: club.activity_name, // For modal context
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
            children: [],
            // MULTI-CITY: Track unique clubs for rollups
            unique_club_ids: new Set<number>(),
            rolled_up_leader_club_ids: new Set<number>()
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
          const tProgress = syncProgress(t.progress, tMeetups);

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
            id: `activity:${activityId}-city:${cityId}-area:${areaId}-club:${clubId}-expansion-target:${targetId}`,
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
          children: targetChildren.length >= 1 ? targetChildren : undefined // Show children even when 1 target
        };

        areaNode.children.push(expansionClubNode);
        areaNode.club_count = (areaNode.club_count || 0) + 1;
        areaNode.progress_summary = sumProgress([areaNode.progress_summary, aggregatedProgress]);

        cityNode.club_count = (cityNode.club_count || 0) + 1;
        activityNode.club_count = (activityNode.club_count || 0) + 1;
      }
    }

    // Process launches and add to hierarchy
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
      // Also create map by production area ID for quick lookup
      const areaIdToInfo = new Map(areaInfoResult.rows.map((a: any) => [parseInt(a.id), a]));

      // Get dim_areas mapping for resolving dim_area_id to production_area_id
      const dimAreasMapQuery = `SELECT id as dim_area_id, production_area_id FROM dim_areas`;
      const dimAreasMapResult = await queryLocal(dimAreasMapQuery);
      const dimToProductionAreaMap = new Map(dimAreasMapResult.rows.map((a: any) => [parseInt(a.dim_area_id), parseInt(a.production_area_id)]));

      for (const launch of launchesData) {
        const activityId = activityNameToId.get(launch.activity_name);
        if (!activityId) continue; // Skip if activity not found

        // Get launch target (may have area_id which is dim_areas.id)
        const launchTarget = launchTargetsMap.get(launch.launch_id);
        const dimAreaId = launchTarget?.area_id ? parseInt(launchTarget.area_id) : null;
        // Resolve dim_areas.id to production_area_id
        const targetAreaId = dimAreaId ? dimToProductionAreaMap.get(dimAreaId) : null;

        // Get area info - try by production area_id from target first, then by area name
        // This ensures launches are placed in the correct city/area hierarchy
        let areaInfo = targetAreaId ?
          areaIdToInfo.get(targetAreaId) :
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
            children: new Map<number, any>(),
            // MULTI-CITY: Track unique club IDs to avoid double-counting in rollups
            unique_club_ids: new Set<number>(),
            rolled_up_leader_club_ids: new Set<number>()
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
            city_name: areaInfo.city_name || 'Unknown', // For modal context
            activity_id: activityId, // For modal context
            activity_name: launch.activity_name, // For modal context
            target_meetups: 0,
            target_revenue: 0,
            current_meetups: 0,
            current_revenue: 0,
            gap_meetups: 0,
            gap_revenue: 0,
            progress_summary: { ...defaultProgress },
            club_count: 0,
            launch_count: 0,
            children: new Map<number, any>(),
            // MULTI-CITY: Track unique clubs for rollups
            unique_club_ids: new Set<number>(),
            rolled_up_leader_club_ids: new Set<number>()
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
            area_name: areaInfo.name || 'Unknown', // For modal context
            city_id: cityId,
            city_name: areaInfo.city_name || 'Unknown', // For modal context
            activity_id: activityId, // For modal context
            activity_name: launch.activity_name, // For modal context
            target_meetups: 0,
            target_revenue: 0,
            current_meetups: 0,
            current_revenue: 0,
            gap_meetups: 0,
            gap_revenue: 0,
            progress_summary: { ...defaultProgress },
            club_count: 0,
            launch_count: 0,
            children: [],
            // MULTI-CITY: Track unique clubs for rollups
            unique_club_ids: new Set<number>(),
            rolled_up_leader_club_ids: new Set<number>()
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

        // Get leader requirements for this launch
        const launchLeaderReq = launchLeaderRequirementsMap.get(launch.launch_id) || {
          leaders_required_total: 0,
          total_requirements: 0,
          not_picked: 0,
          deprioritised: 0,
          in_progress: 0,
          done: 0
        };

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
          meetup_cost: launchTarget?.meetup_cost ? parseFloat(launchTarget.meetup_cost) : null,
          meetup_capacity: launchTarget?.meetup_capacity ? parseInt(launchTarget.meetup_capacity) : null,
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
          team: launchTeam,
          leaders_required_total: launchLeaderReq.leaders_required_total,
          leader_requirements_summary: {
            total_requirements: launchLeaderReq.total_requirements,
            not_picked: launchLeaderReq.not_picked,
            deprioritised: launchLeaderReq.deprioritised,
            in_progress: launchLeaderReq.in_progress,
            done: launchLeaderReq.done
          }
        };

        areaNode.children.push(launchNode);
        launchCount++;

        // Roll up progress
        if (launchTarget || targetMeetups > 0) {
          areaNode.progress_summary = sumProgress([areaNode.progress_summary, progress]);
        }

        // Roll up leader requirements from launches to area, city, activity
        if (launchLeaderReq.leaders_required_total > 0) {
          // Ensure leader_requirements_summary exists on nodes
          if (!areaNode.leader_requirements_summary) {
            areaNode.leader_requirements_summary = { total_requirements: 0, not_picked: 0, deprioritised: 0, in_progress: 0, done: 0 };
          }
          if (!cityNode.leader_requirements_summary) {
            cityNode.leader_requirements_summary = { total_requirements: 0, not_picked: 0, deprioritised: 0, in_progress: 0, done: 0 };
          }
          if (!activityNode.leader_requirements_summary) {
            activityNode.leader_requirements_summary = { total_requirements: 0, not_picked: 0, deprioritised: 0, in_progress: 0, done: 0 };
          }

          // Area rollup
          if (!areaNode.leaders_required_total) areaNode.leaders_required_total = 0;
          areaNode.leaders_required_total += launchLeaderReq.leaders_required_total || 0;
          areaNode.leader_requirements_summary.total_requirements += launchLeaderReq.total_requirements || 0;
          areaNode.leader_requirements_summary.not_picked += launchLeaderReq.not_picked || 0;
          areaNode.leader_requirements_summary.deprioritised += launchLeaderReq.deprioritised || 0;
          areaNode.leader_requirements_summary.in_progress += launchLeaderReq.in_progress || 0;
          areaNode.leader_requirements_summary.done += launchLeaderReq.done || 0;

          // City rollup
          if (!cityNode.leaders_required_total) cityNode.leaders_required_total = 0;
          cityNode.leaders_required_total += launchLeaderReq.leaders_required_total || 0;
          cityNode.leader_requirements_summary.total_requirements += launchLeaderReq.total_requirements || 0;
          cityNode.leader_requirements_summary.not_picked += launchLeaderReq.not_picked || 0;
          cityNode.leader_requirements_summary.deprioritised += launchLeaderReq.deprioritised || 0;
          cityNode.leader_requirements_summary.in_progress += launchLeaderReq.in_progress || 0;
          cityNode.leader_requirements_summary.done += launchLeaderReq.done || 0;

          // Activity rollup
          if (!activityNode.leaders_required_total) activityNode.leaders_required_total = 0;
          activityNode.leaders_required_total += launchLeaderReq.leaders_required_total || 0;
          activityNode.leader_requirements_summary.total_requirements += launchLeaderReq.total_requirements || 0;
          activityNode.leader_requirements_summary.not_picked += launchLeaderReq.not_picked || 0;
          activityNode.leader_requirements_summary.deprioritised += launchLeaderReq.deprioritised || 0;
          activityNode.leader_requirements_summary.in_progress += launchLeaderReq.in_progress || 0;
          activityNode.leader_requirements_summary.done += launchLeaderReq.done || 0;
        }
      }
    }

    // Convert maps to arrays and calculate gaps/validations
    hierarchy = [];

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
          // MULTI-CITY: Clean up tracking Sets (not needed in response)
          delete areaNode.unique_club_ids;
          delete areaNode.rolled_up_leader_club_ids;

          // Roll up health for area (excludes launches)
          const areaHealthRollup = rollupHealth(areaNode.children || []);
          areaNode.health_score = areaHealthRollup.health_score;
          areaNode.health_status = areaHealthRollup.health_status;
          areaNode.health_distribution = areaHealthRollup.health_distribution;

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
        // MULTI-CITY: Clean up tracking Sets (not needed in response)
        delete cityNode.unique_club_ids;
        delete cityNode.rolled_up_leader_club_ids;

        // Roll up health for city (from areas)
        const cityHealthRollup = rollupHealth(areaNodes);
        cityNode.health_score = cityHealthRollup.health_score;
        cityNode.health_status = cityHealthRollup.health_status;
        cityNode.health_distribution = cityHealthRollup.health_distribution;

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
      // MULTI-CITY: Clean up tracking Sets (not needed in response)
      delete activityNode.unique_club_ids;
      delete activityNode.rolled_up_leader_club_ids;

      // Roll up health for activity (from cities)
      const activityHealthRollup = rollupHealth(cityNodes);
      activityNode.health_score = activityHealthRollup.health_score;
      activityNode.health_status = activityHealthRollup.health_status;
      activityNode.health_distribution = activityHealthRollup.health_distribution;

      hierarchy.push(activityNode);
    }

    // Calculate overall summary
    const overallProgress = sumProgress(hierarchy.map(a => a.progress_summary));
    const totalTargetMeetups = hierarchy.reduce((sum, a) => sum + a.target_meetups, 0);
    const totalTargetRevenue = hierarchy.reduce((sum, a) => sum + a.target_revenue, 0);
    const totalCurrentMeetups = hierarchy.reduce((sum, a) => sum + a.current_meetups, 0);
    const totalCurrentRevenue = hierarchy.reduce((sum, a) => sum + a.current_revenue, 0);
    const totalLast4wRevenue = hierarchy.reduce((sum, a) => sum + (a.last_4w_revenue_total || 0), 0);

    // Calculate overall health distribution (from all activities)
    const overallHealthRollup = rollupHealth(hierarchy);

    res.json({
      success: true,
      hierarchy,
      hierarchy_order: hierarchyLevels,
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
        march_2026_revenue: march2026Revenue,
        // Monthly revenue breakdown (Sep 2025 - Mar 2026)
        monthly_revenue: monthlyRevenue,
        // Health summary
        overall_health_score: overallHealthRollup.health_score,
        overall_health_status: overallHealthRollup.health_status,
        // Use unique club count to avoid double-counting multi-area clubs
        health_distribution: getUniqueClubHealthDistribution(hierarchy)
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
    const { club_id, club_uuid, club_name, transfer_targets, match_type = 'manual' } = req.body;

    if (!club_id) {
      return res.status(400).json({
        success: false,
        error: 'club_id is required'
      });
    }

    // Validate match_type
    if (!['auto', 'manual'].includes(match_type)) {
      return res.status(400).json({
        success: false,
        error: 'match_type must be "auto" or "manual"'
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

    // Check if already transitioned
    if (launch.actual_club_id) {
      return res.status(400).json({
        success: false,
        error: 'Launch is already transitioned to a club'
      });
    }

    // Get launch dimensional targets
    const launchTargetResult = await queryLocal(`
      SELECT * FROM launch_dimensional_targets WHERE launch_id = $1
    `, [launchId]);

    // Store previous status for revert capability
    const previousStatus = launch.launch_status;

    // Update launch status and link to club with new tracking fields
    await queryLocal(`
      UPDATE new_club_launches
      SET
        launch_status = 'launched',
        actual_club_id = $1,
        match_type = $2,
        previous_status = $3,
        matched_at = CURRENT_TIMESTAMP,
        matched_club_name = $4,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
    `, [club_uuid || club_id, match_type, previousStatus, club_name || null, launchId]);

    // Transfer targets if requested
    if (transfer_targets && launchTargetResult.rows.length > 0) {
      const launchTarget = launchTargetResult.rows[0];

      // Get activity_id from activity_name
      const activityResult = await queryProduction(`
        SELECT id FROM activity WHERE name = $1
      `, [launch.activity_name]);

      const activityId = activityResult.rows[0]?.id;

      // Get area_id from the club's actual events (where the club operates)
      // This ensures the target appears under the club, not as a separate expansion
      // IMPORTANT: club_dimensional_targets.area_id uses dim_areas.id, NOT production area ID
      let targetDimAreaId = null;

      // Get production area where the club has events
      const clubAreaResult = await queryProduction(`
        SELECT ar.id as production_area_id, ar.name
        FROM event e
        JOIN location l ON e.location_id = l.id
        JOIN area ar ON l.area_id = ar.id
        WHERE e.club_id = $1
        GROUP BY ar.id, ar.name
        ORDER BY COUNT(*) DESC
        LIMIT 1
      `, [club_id]);

      let productionAreaId = null;
      let areaName = null;

      if (clubAreaResult.rows.length > 0) {
        productionAreaId = clubAreaResult.rows[0].production_area_id;
        areaName = clubAreaResult.rows[0].name;
        logger.info(`Club has events in production area ${productionAreaId} (${areaName})`);
      } else {
        // New club with no events yet - use launch's planned area
        const areaLookupResult = await queryProduction(`
          SELECT id, name FROM area WHERE name = $1
        `, [launch.planned_area]);

        if (areaLookupResult.rows.length > 0) {
          productionAreaId = areaLookupResult.rows[0].id;
          areaName = areaLookupResult.rows[0].name;
          logger.info(`New club - using launch's planned area ${productionAreaId} (${areaName})`);
        }
      }

      // Look up the dim_areas.id for this production area
      if (productionAreaId) {
        const dimAreaResult = await queryLocal(`
          SELECT id FROM dim_areas WHERE production_area_id = $1 LIMIT 1
        `, [productionAreaId]);

        if (dimAreaResult.rows.length > 0) {
          targetDimAreaId = dimAreaResult.rows[0].id;
          logger.info(`Mapped production_area_id ${productionAreaId} to dim_area_id ${targetDimAreaId}`);
        } else {
          logger.warn(`No dim_areas entry found for production_area_id ${productionAreaId}`);
        }
      }

      if (!targetDimAreaId) {
        logger.warn(`Could not determine dim_area_id for club ${club_id}, skipping target transfer`);
      } else {
        // Create club dimensional target with all fields including meetup_cost/capacity
        await queryLocal(`
          INSERT INTO club_dimensional_targets (
            club_id, activity_id, area_id, day_type_id, format_id,
            target_meetups, target_revenue, progress, meetup_cost, meetup_capacity
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
          club_id,
          activityId,
          targetDimAreaId,
          launchTarget.day_type_id,
          launchTarget.format_id,
          launchTarget.target_meetups,
          launchTarget.target_revenue,
          launchTarget.progress,
          launchTarget.meetup_cost,
          launchTarget.meetup_capacity
        ]);
      }
    }

    logger.info(`Transitioned launch ${launchId} to club ${club_id} (${match_type})`);

    res.json({
      success: true,
      message: 'Launch transitioned to club successfully',
      club_id,
      club_name,
      launch_id: launchId,
      match_type
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

// POST /api/targets/v2/launches/:launchId/revert - Revert a launch transition
router.post('/v2/launches/:launchId/revert', async (req, res) => {
  try {
    const launchId = parseInt(req.params.launchId);
    const { delete_club_targets = false } = req.body;

    // Get current launch info
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

    if (!launch.actual_club_id) {
      return res.status(400).json({
        success: false,
        error: 'Launch is not transitioned to any club'
      });
    }

    const { actual_club_id, previous_status, matched_at, matched_club_name } = launch;

    // Optionally delete club targets that were copied from launch
    if (delete_club_targets && matched_at) {
      // Get launch dimensional targets to identify which club targets to delete
      const launchTargetResult = await queryLocal(`
        SELECT * FROM launch_dimensional_targets WHERE launch_id = $1
      `, [launchId]);

      if (launchTargetResult.rows.length > 0) {
        const launchTarget = launchTargetResult.rows[0];

        // Look up club pk from UUID (actual_club_id stores UUID, but club_dimensional_targets uses integer pk)
        let clubPk = launchTarget.club_id;
        if (!clubPk && actual_club_id) {
          const clubPkResult = await queryProduction(`
            SELECT pk FROM club WHERE id = $1
          `, [actual_club_id]);
          if (clubPkResult.rows.length > 0) {
            clubPk = clubPkResult.rows[0].pk;
          }
        }

        if (clubPk) {
          // Delete club targets that match the launch's area/day_type/format
          // These were likely created during the transition
          await queryLocal(`
            DELETE FROM club_dimensional_targets
            WHERE club_id = $1
              AND COALESCE(area_id, -1) = COALESCE($2, -1)
              AND COALESCE(day_type_id, -1) = COALESCE($3, -1)
              AND COALESCE(format_id, -1) = COALESCE($4, -1)
              AND created_at >= $5
          `, [
            clubPk,
            launchTarget.area_id,
            launchTarget.day_type_id,
            launchTarget.format_id,
            matched_at
          ]);

          logger.info(`Deleted club targets for launch ${launchId} revert (club_pk: ${clubPk})`);
        }
      }
    }

    // Revert launch status - makes launch visible again in hierarchy
    await queryLocal(`
      UPDATE new_club_launches
      SET
        launch_status = COALESCE($1, 'planned'),
        actual_club_id = NULL,
        match_type = NULL,
        previous_status = NULL,
        matched_at = NULL,
        matched_club_name = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [previous_status, launchId]);

    logger.info(`Reverted launch ${launchId} transition from club ${actual_club_id} (${matched_club_name})`);

    res.json({
      success: true,
      message: 'Launch transition reverted successfully',
      launch_id: launchId,
      previous_club_id: actual_club_id,
      previous_club_name: matched_club_name,
      targets_deleted: delete_club_targets
    });
  } catch (error) {
    logger.error(`Failed to revert launch ${req.params.launchId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to revert launch transition',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/targets/v2/launches/:launchId/matching-clubs - Get clubs for manual match modal
router.get('/v2/launches/:launchId/matching-clubs', async (req, res) => {
  try {
    const launchId = parseInt(req.params.launchId);
    const { city_id, area_id, search } = req.query;

    // Get launch info
    const launchResult = await queryLocal(`
      SELECT
        ncl.*,
        ldt.area_id as target_area_id
      FROM new_club_launches ncl
      LEFT JOIN launch_dimensional_targets ldt ON ncl.id = ldt.launch_id
      WHERE ncl.id = $1
    `, [launchId]);

    if (launchResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Launch not found'
      });
    }

    const launch = launchResult.rows[0];

    // Get the dim_areas mapping for the launch's area
    let launchAreaProductionId: number | null = null;
    let launchCityId: number | null = null;

    if (launch.target_area_id) {
      const areaMapping = await queryLocal(`
        SELECT production_area_id, city_id FROM dim_areas WHERE id = $1
      `, [launch.target_area_id]);

      if (areaMapping.rows.length > 0) {
        launchAreaProductionId = areaMapping.rows[0].production_area_id;
        launchCityId = areaMapping.rows[0].city_id;
      }
    }

    // Use provided city_id or fall back to launch's city
    // Note: city_id from frontend is production city ID, need to map to dim_cities
    const productionCityId = city_id ? parseInt(city_id as string) : null;

    if (!productionCityId && !launchCityId) {
      return res.status(400).json({
        success: false,
        error: 'city_id is required'
      });
    }

    // Map production city ID to dim_cities ID
    let dimCityId: number | null = launchCityId;
    if (productionCityId) {
      const dimCityResult = await queryLocal(`
        SELECT id FROM dim_cities WHERE production_city_id = $1
      `, [productionCityId]);
      if (dimCityResult.rows.length > 0) {
        dimCityId = dimCityResult.rows[0].id;
      }
    }

    // Get areas in the selected city for mapping
    const cityAreas = await queryLocal(`
      SELECT id, production_area_id, area_name as name FROM dim_areas WHERE city_id = $1
    `, [dimCityId]);

    const cityAreaProductionIds = cityAreas.rows.map((a: any) => a.production_area_id).filter(Boolean);

    if (cityAreaProductionIds.length === 0) {
      return res.json({
        success: true,
        clubs: [],
        launch: {
          id: launch.id,
          activity_name: launch.activity_name,
          planned_club_name: launch.planned_club_name,
          planned_city: launch.planned_city,
          planned_area: launch.planned_area
        }
      });
    }

    // Build query to find matching clubs
    // Clubs must be: same activity, active, have events in the selected city
    let clubQuery = `
      SELECT DISTINCT
        c.pk as club_id,
        c.id as club_uuid,
        c.name as club_name,
        c.status,
        a.name as activity_name,
        (
          SELECT ar2.name FROM event e2
          JOIN location l2 ON e2.location_id = l2.id
          JOIN area ar2 ON l2.area_id = ar2.id
          WHERE e2.club_id = c.pk
          ORDER BY e2.start_time DESC LIMIT 1
        ) as area_name,
        (
          SELECT ci2.name FROM event e2
          JOIN location l2 ON e2.location_id = l2.id
          JOIN area ar2 ON l2.area_id = ar2.id
          JOIN city ci2 ON ar2.city_id = ci2.id
          WHERE e2.club_id = c.pk
          ORDER BY e2.start_time DESC LIMIT 1
        ) as city_name,
        (
          SELECT COUNT(DISTINCT e.pk)
          FROM event e
          WHERE e.club_id = c.pk
            AND e.start_time > NOW() - INTERVAL '30 days'
        ) as event_count
      FROM club c
      JOIN activity a ON c.activity_id = a.id
      WHERE a.name = $1
        AND c.status = 'ACTIVE'
        AND EXISTS (
          SELECT 1 FROM event e
          JOIN location l ON e.location_id = l.id
          WHERE e.club_id = c.pk
            AND l.area_id = ANY($2)
            AND e.state = 'CREATED'
        )
    `;

    const params: any[] = [launch.activity_name, cityAreaProductionIds];

    // Filter by specific area if provided
    if (area_id) {
      const areaResult = await queryLocal(`
        SELECT production_area_id FROM dim_areas WHERE id = $1
      `, [parseInt(area_id as string)]);

      if (areaResult.rows.length > 0) {
        clubQuery += ` AND EXISTS (
          SELECT 1 FROM event e
          JOIN location l ON e.location_id = l.id
          WHERE e.club_id = c.pk
            AND l.area_id = $${params.length + 1}
        )`;
        params.push(areaResult.rows[0].production_area_id);
      }
    }

    // Search by name if provided
    if (search) {
      clubQuery += ` AND c.name ILIKE $${params.length + 1}`;
      params.push(`%${search}%`);
    }

    clubQuery += ` ORDER BY c.name ASC LIMIT 50`;

    const clubsResult = await queryProduction(clubQuery, params);

    // Get the launch's original city name for comparison
    let launchCityName = launch.planned_city;
    if (launchCityId) {
      const launchCityResult = await queryLocal(`
        SELECT city_name FROM dim_cities WHERE id = $1
      `, [launchCityId]);
      if (launchCityResult.rows.length > 0) {
        launchCityName = launchCityResult.rows[0].city_name;
      }
    }

    // Enrich with same_area and same_city flags
    const clubs = clubsResult.rows.map((club: any) => {
      // Check if club has events in the launch's specific area
      const isSameArea = launchAreaProductionId
        ? cityAreas.rows.some((a: any) =>
            a.production_area_id === launchAreaProductionId &&
            club.area_name === a.name
          )
        : false;

      // Check if club's city matches launch's original city
      const isSameCity = club.city_name?.toLowerCase() === launchCityName?.toLowerCase();

      return {
        club_id: club.club_id,
        club_uuid: club.club_uuid,
        club_name: club.club_name,
        city_name: club.city_name || launch.planned_city,
        area_name: club.area_name || 'Unknown',
        is_same_area: isSameArea,
        is_same_city: isSameCity,
        event_count: parseInt(club.event_count) || 0,
        health_status: 'gray' as const // Could be enhanced to calculate actual health
      };
    });

    res.json({
      success: true,
      clubs,
      launch: {
        id: launch.id,
        activity_name: launch.activity_name,
        planned_club_name: launch.planned_club_name,
        planned_city: launch.planned_city,
        planned_area: launch.planned_area
      }
    });
  } catch (error) {
    logger.error(`Failed to get matching clubs for launch ${req.params.launchId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get matching clubs',
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
    const { week_start, week_end } = req.query;

    if (isNaN(clubId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid club ID'
      });
    }

    // Parse week bounds (defaults to last completed week if not provided)
    const weekStartDate = week_start && typeof week_start === 'string'
      ? new Date(week_start)
      : undefined;
    const weekEndDate = week_end && typeof week_end === 'string'
      ? new Date(week_end)
      : undefined;

    // SQL date expressions for the query
    // Use IST timezone (Asia/Kolkata) for date calculations
    const weekStartSQL = weekStartDate
      ? `'${weekStartDate.toISOString().split('T')[0]} 00:00:00+05:30'::timestamptz`
      : `DATE_TRUNC('week', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata' - INTERVAL '7 days'`;
    const weekEndSQL = weekEndDate
      ? `'${weekEndDate.toISOString().split('T')[0]} 00:00:00+05:30'::timestamptz`
      : `DATE_TRUNC('week', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'`;

    // Get meetups and targets using the matching service helpers
    const { getClubMeetups, getClubTargets, DAY_TYPE_TO_DOW } = await import('../services/meetupMatchingService');
    const [allMeetups, allTargets] = await Promise.all([
      getClubMeetups(clubId, weekStartDate, weekEndDate),
      getClubTargets(clubId)
    ]);

    // Build a map of event_id -> matched target
    const eventToTarget = new Map<number, { id: number; name: string | null }>();

    // Build display names for targets
    const targetDisplayNames = new Map<number, string>();
    allTargets.forEach((t, idx) => {
      let displayName = t.target_name || null;
      if (!displayName) {
        if (t.day_type_name) {
          displayName = t.day_type_name;
        } else {
          displayName = `Target ${idx + 1}`;
        }
      }
      targetDisplayNames.set(t.target_id, displayName);
    });

    // For each meetup, find ALL targets it could match (pass area + day filters)
    // Track day type match and name match for prioritization
    const meetupCandidates = new Map<number, { targetId: number; dayTypeMatched: boolean; nameMatched: boolean }[]>();
    for (const meetup of allMeetups) {
      const candidates: { targetId: number; dayTypeMatched: boolean; nameMatched: boolean }[] = [];
      for (const target of allTargets) {
        // HARD FILTER 1: Area
        if (target.production_area_id !== null) {
          if (meetup.area_id !== target.production_area_id) {
            continue; // Area doesn't match, skip this target
          }
        }
        // HARD FILTER 2: Day Type (if target has specific day type)
        let dayTypeMatched = false;
        if (target.day_type_id !== null && target.day_type_dows) {
          if (!target.day_type_dows.includes(meetup.dow)) {
            continue; // Day type doesn't match, skip this target
          }
          dayTypeMatched = true; // Target has specific day type and meetup matches it
        }
        // Check name match (soft filter for prioritization)
        let nameMatched = false;
        if (target.target_name && target.target_name.trim() !== '') {
          const pattern = target.target_name.toLowerCase().trim();
          const eventName = meetup.event_name.toLowerCase();
          nameMatched = eventName.includes(pattern);
        }
        // This meetup CAN match this target
        candidates.push({ targetId: target.target_id, dayTypeMatched, nameMatched });
      }
      meetupCandidates.set(meetup.event_id, candidates);
    }

    // Track assigned meetups and target fill counts
    const assignedMeetups = new Set<number>();
    const targetFillCount = new Map<number, number>();
    for (const target of allTargets) {
      targetFillCount.set(target.target_id, 0);
    }

    // Sort targets by target_meetups ascending (smallest first for tie-breaking)
    const sortedTargets = [...allTargets].sort((a, b) => a.target_meetups - b.target_meetups);

    // PHASE 1: Assign meetups with SPECIFIC DAY TYPE MATCH first (highest priority)
    // e.g., if target has "Weekday" and meetup is on Tuesday, that's a day type match
    for (const target of sortedTargets) {
      const limit = target.target_meetups;
      let filled = targetFillCount.get(target.target_id) || 0;

      for (const meetup of allMeetups) {
        if (filled >= limit) break;
        if (assignedMeetups.has(meetup.event_id)) continue;

        const candidates = meetupCandidates.get(meetup.event_id) || [];
        const match = candidates.find(c => c.targetId === target.target_id && c.dayTypeMatched);
        if (match) {
          eventToTarget.set(meetup.event_id, {
            id: target.target_id,
            name: targetDisplayNames.get(target.target_id) || null
          });
          assignedMeetups.add(meetup.event_id);
          filled++;
        }
      }
      targetFillCount.set(target.target_id, filled);
    }

    // PHASE 2: Assign meetups with NAME MATCH (second priority)
    for (const target of sortedTargets) {
      const limit = target.target_meetups;
      let filled = targetFillCount.get(target.target_id) || 0;

      for (const meetup of allMeetups) {
        if (filled >= limit) break;
        if (assignedMeetups.has(meetup.event_id)) continue;

        const candidates = meetupCandidates.get(meetup.event_id) || [];
        const match = candidates.find(c => c.targetId === target.target_id && c.nameMatched);
        if (match) {
          eventToTarget.set(meetup.event_id, {
            id: target.target_id,
            name: targetDisplayNames.get(target.target_id) || null
          });
          assignedMeetups.add(meetup.event_id);
          filled++;
        }
      }
      targetFillCount.set(target.target_id, filled);
    }

    // PHASE 3: Assign remaining meetups (smallest first, no specific match required)
    for (const target of sortedTargets) {
      const limit = target.target_meetups;
      let filled = targetFillCount.get(target.target_id) || 0;

      for (const meetup of allMeetups) {
        if (filled >= limit) break;
        if (assignedMeetups.has(meetup.event_id)) continue;

        const candidates = meetupCandidates.get(meetup.event_id) || [];
        const match = candidates.find(c => c.targetId === target.target_id);
        if (match) {
          eventToTarget.set(meetup.event_id, {
            id: target.target_id,
            name: targetDisplayNames.get(target.target_id) || null
          });
          assignedMeetups.add(meetup.event_id);
          filled++;
        }
      }
      targetFillCount.set(target.target_id, filled);
    }

    // Remaining unassigned meetups stay unattributed (eventToTarget won't have them)

    // Fetch additional meetup details (capacity, price, bookings, waitlist, no-shows, pending payments, area, venue)
    const meetupsQuery = `
      SELECT
        e.pk as event_id,
        e.name as event_name,
        e.description as event_description,
        e.start_time as event_date,
        e.max_people as capacity,
        e.ticket_price as price,
        e.payment_type,
        e.pricing_type,
        ar.name as area_name,
        l.name as venue_name,
        COUNT(DISTINCT CASE WHEN b.booking_status NOT IN ('DEREGISTERED', 'INITIATED') THEN b.id END) as total_bookings,
        COUNT(DISTINCT CASE WHEN b.booking_status = 'WAITLISTED' THEN b.id END) as waitlist_count,
        COUNT(DISTINCT CASE WHEN b.booking_status = 'OPEN_FOR_REPLACEMENT' THEN b.id END) as open_for_replacement_count,
        COUNT(DISTINCT CASE WHEN b.booking_status = 'NOT_ATTENDED' THEN b.id END) as no_show_count,
        COALESCE(SUM(CASE WHEN p.state = 'COMPLETED' THEN p.amount / 100.0 ELSE 0 END), 0) as revenue,
        COALESCE(SUM(CASE WHEN p.state = 'PENDING' OR p.state IS NULL THEN
          CASE WHEN b.booking_status IN ('REGISTERED', 'ATTENDED') THEN e.ticket_price / 100.0 ELSE 0 END
        ELSE 0 END), 0) as pending_payment
      FROM event e
      JOIN location l ON e.location_id = l.id
      JOIN area ar ON l.area_id = ar.id
      LEFT JOIN booking b ON b.event_id = e.pk AND b.booking_status NOT IN ('DEREGISTERED', 'INITIATED')
      LEFT JOIN transaction t ON t.entity_id = b.id AND t.entity_type = 'BOOKING'
      LEFT JOIN payment p ON p.pk = t.payment_id
      WHERE e.club_id = $1
        AND e.start_time >= ${weekStartSQL}
        AND e.start_time < ${weekEndSQL}
        AND e.state = 'CREATED'
      GROUP BY e.pk, e.name, e.description, e.start_time, e.max_people, e.ticket_price, e.payment_type, e.pricing_type, ar.name, l.name
      ORDER BY e.start_time DESC
    `;

    const result = await queryProduction(meetupsQuery, [clubId]);

    // Build response with matched targets from the matching service
    // 0-BOOKING FILTER: Events with 0 bookings are shown but marked as not counted
    const meetups = result.rows.map((row: any) => {
      const eventId = parseInt(row.event_id);
      const matchedTarget = eventToTarget.get(eventId) || null;
      const totalBookings = parseInt(row.total_bookings) || 0;

      return {
        event_id: row.event_id,
        event_name: row.event_name || 'Unnamed Event',
        event_description: row.event_description || null,
        event_date: row.event_date,
        area_name: row.area_name || null,
        venue_name: row.venue_name || null,
        capacity: parseInt(row.capacity) || 0,
        price: parseInt(row.price) || 0,
        payment_type: row.payment_type || null,
        pricing_type: row.pricing_type || null,
        total_bookings: totalBookings,
        waitlist_count: parseInt(row.waitlist_count) || 0,
        open_for_replacement_count: parseInt(row.open_for_replacement_count) || 0,
        no_show_count: parseInt(row.no_show_count) || 0,
        revenue: parseFloat(row.revenue) || 0,
        pending_payment: parseFloat(row.pending_payment) || 0,
        matched_target: matchedTarget,
        // Flag to indicate if this meetup is counted in current column (has valid bookings)
        counted_in_current: totalBookings > 0
      };
    });

    // Fetch health metrics for current week and previous week (for WoW comparison)
    const prevWeekStartSQL = weekStartDate
      ? `'${new Date(weekStartDate.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}'::date`
      : `DATE_TRUNC('week', CURRENT_DATE)::date - 14`;
    const prevWeekEndSQL = weekStartDate
      ? `'${weekStartDate.toISOString().split('T')[0]}'::date`
      : `DATE_TRUNC('week', CURRENT_DATE)::date - 7`;

    const healthMetricsQuery = `
      WITH current_week_events AS (
        SELECT
          e.pk as event_id,
          e.max_people as capacity,
          COUNT(DISTINCT CASE WHEN b.booking_status NOT IN ('DEREGISTERED', 'INITIATED', 'WAITLISTED') THEN b.id END) as bookings
        FROM event e
        LEFT JOIN booking b ON b.event_id = e.pk
        WHERE e.club_id = $1
          AND e.start_time >= ${weekStartSQL}
          AND e.start_time < ${weekEndSQL}
          AND e.state = 'CREATED'
        GROUP BY e.pk, e.max_people
      ),
      prev_week_events AS (
        SELECT
          e.pk as event_id,
          e.max_people as capacity,
          COUNT(DISTINCT CASE WHEN b.booking_status NOT IN ('DEREGISTERED', 'INITIATED', 'WAITLISTED') THEN b.id END) as bookings
        FROM event e
        LEFT JOIN booking b ON b.event_id = e.pk
        WHERE e.club_id = $1
          AND e.start_time >= ${prevWeekStartSQL}
          AND e.start_time < ${prevWeekEndSQL}
          AND e.state = 'CREATED'
        GROUP BY e.pk, e.max_people
      ),
      current_capacity AS (
        SELECT
          CASE WHEN SUM(capacity) > 0 THEN ROUND((SUM(bookings)::numeric / SUM(capacity)) * 100, 1) ELSE 0 END as capacity_pct,
          COUNT(*) as meetup_count
        FROM current_week_events
      ),
      prev_capacity AS (
        SELECT
          CASE WHEN SUM(capacity) > 0 THEN ROUND((SUM(bookings)::numeric / SUM(capacity)) * 100, 1) ELSE 0 END as capacity_pct,
          COUNT(*) as meetup_count
        FROM prev_week_events
      ),
      -- Repeat rate for current week
      current_users AS (
        SELECT DISTINCT b.user_id
        FROM event e
        JOIN booking b ON b.event_id = e.pk
        WHERE e.club_id = $1
          AND e.start_time >= ${weekStartSQL}
          AND e.start_time < ${weekEndSQL}
          AND e.state = 'CREATED'
          AND b.booking_status NOT IN ('DEREGISTERED', 'INITIATED', 'WAITLISTED')
      ),
      prior_4w_users AS (
        SELECT DISTINCT b.user_id
        FROM event e
        JOIN booking b ON b.event_id = e.pk
        WHERE e.club_id = $1
          AND e.start_time >= ${weekStartSQL} - INTERVAL '4 weeks'
          AND e.start_time < ${weekStartSQL}
          AND e.state = 'CREATED'
          AND b.booking_status NOT IN ('DEREGISTERED', 'INITIATED', 'WAITLISTED')
      ),
      current_repeat AS (
        SELECT
          COUNT(DISTINCT cu.user_id) as total_users,
          COUNT(DISTINCT CASE WHEN pu.user_id IS NOT NULL THEN cu.user_id END) as repeat_users
        FROM current_users cu
        LEFT JOIN prior_4w_users pu ON cu.user_id = pu.user_id
      ),
      -- Repeat rate for previous week
      prev_week_users AS (
        SELECT DISTINCT b.user_id
        FROM event e
        JOIN booking b ON b.event_id = e.pk
        WHERE e.club_id = $1
          AND e.start_time >= ${prevWeekStartSQL}
          AND e.start_time < ${prevWeekEndSQL}
          AND e.state = 'CREATED'
          AND b.booking_status NOT IN ('DEREGISTERED', 'INITIATED', 'WAITLISTED')
      ),
      prior_4w_for_prev AS (
        SELECT DISTINCT b.user_id
        FROM event e
        JOIN booking b ON b.event_id = e.pk
        WHERE e.club_id = $1
          AND e.start_time >= ${prevWeekStartSQL} - INTERVAL '4 weeks'
          AND e.start_time < ${prevWeekStartSQL}
          AND e.state = 'CREATED'
          AND b.booking_status NOT IN ('DEREGISTERED', 'INITIATED', 'WAITLISTED')
      ),
      prev_repeat AS (
        SELECT
          COUNT(DISTINCT pwu.user_id) as total_users,
          COUNT(DISTINCT CASE WHEN p4p.user_id IS NOT NULL THEN pwu.user_id END) as repeat_users
        FROM prev_week_users pwu
        LEFT JOIN prior_4w_for_prev p4p ON pwu.user_id = p4p.user_id
      ),
      -- Rating from last 30 days
      current_rating AS (
        SELECT
          AVG(CASE WHEN (b.feedback_details->>'rating')::numeric IS NOT NULL
                   THEN (b.feedback_details->>'rating')::numeric END)::numeric(3,2) as avg_rating,
          COUNT(CASE WHEN b.feedback_details->>'rating' IS NOT NULL THEN 1 END) as review_count
        FROM event e
        JOIN booking b ON b.event_id = e.pk
        WHERE e.club_id = $1
          AND e.start_time >= ${weekEndSQL} - INTERVAL '30 days'
          AND e.start_time < ${weekEndSQL}
          AND e.state = 'CREATED'
          AND b.booking_status NOT IN ('DEREGISTERED', 'INITIATED', 'WAITLISTED')
      ),
      prev_rating AS (
        SELECT
          AVG(CASE WHEN (b.feedback_details->>'rating')::numeric IS NOT NULL
                   THEN (b.feedback_details->>'rating')::numeric END)::numeric(3,2) as avg_rating,
          COUNT(CASE WHEN b.feedback_details->>'rating' IS NOT NULL THEN 1 END) as review_count
        FROM event e
        JOIN booking b ON b.event_id = e.pk
        WHERE e.club_id = $1
          AND e.start_time >= ${prevWeekEndSQL} - INTERVAL '30 days'
          AND e.start_time < ${prevWeekEndSQL}
          AND e.state = 'CREATED'
          AND b.booking_status NOT IN ('DEREGISTERED', 'INITIATED', 'WAITLISTED')
      ),
      club_info AS (
        SELECT created_at FROM club WHERE pk = $1
      )
      SELECT
        COALESCE(cc.capacity_pct, 0) as capacity_pct,
        COALESCE(cc.meetup_count, 0) as meetup_count,
        COALESCE(pc.capacity_pct, 0) as prev_capacity_pct,
        CASE WHEN COALESCE(cr.total_users, 0) > 0
             THEN ROUND((cr.repeat_users::numeric / cr.total_users) * 100, 1)
             ELSE 0 END as repeat_rate_pct,
        CASE WHEN COALESCE(pr.total_users, 0) > 0
             THEN ROUND((pr.repeat_users::numeric / pr.total_users) * 100, 1)
             ELSE 0 END as prev_repeat_rate_pct,
        COALESCE(crat.avg_rating, 0) as avg_rating,
        COALESCE(prat.avg_rating, 0) as prev_avg_rating,
        ci.created_at,
        CASE WHEN ci.created_at > CURRENT_DATE - INTERVAL '2 months' THEN true ELSE false END as is_new_club
      FROM current_capacity cc
      CROSS JOIN prev_capacity pc
      CROSS JOIN current_repeat cr
      CROSS JOIN prev_repeat pr
      CROSS JOIN current_rating crat
      CROSS JOIN prev_rating prat
      CROSS JOIN club_info ci
    `;

    const healthResult = await queryProduction(healthMetricsQuery, [clubId]);
    const healthRow = healthResult.rows[0] || {};

    const capacityPct = parseFloat(healthRow.capacity_pct) || 0;
    const prevCapacityPct = parseFloat(healthRow.prev_capacity_pct) || 0;
    const repeatRatePct = parseFloat(healthRow.repeat_rate_pct) || 0;
    const prevRepeatRatePct = parseFloat(healthRow.prev_repeat_rate_pct) || 0;
    const avgRating = parseFloat(healthRow.avg_rating) || 0;
    const prevAvgRating = parseFloat(healthRow.prev_avg_rating) || 0;
    const isNewClub = healthRow.is_new_club === true;
    const hasMeetups = parseInt(healthRow.meetup_count) > 0;

    // Calculate health score and status
    const healthScore = calculateHealthScore(capacityPct, repeatRatePct, avgRating, isNewClub);
    const healthStatus = getHealthStatus(healthScore, hasMeetups);

    // Calculate individual metric health
    const capacityHealth = getMetricHealth(capacityPct, HEALTH_THRESHOLDS.capacity_utilization);
    const repeatHealth = isNewClub ? 'green' : getMetricHealth(repeatRatePct, HEALTH_THRESHOLDS.repeat_rate);
    const ratingHealth = getMetricHealth(avgRating, HEALTH_THRESHOLDS.avg_rating);

    // Fetch previous week totals for WoW comparison
    const prevWeekTotalsQuery = `
      SELECT
        COUNT(DISTINCT e.pk) as meetup_count,
        COUNT(DISTINCT CASE WHEN b.booking_status NOT IN ('DEREGISTERED', 'INITIATED') THEN b.id END) as booking_count,
        COUNT(DISTINCT CASE WHEN b.booking_status = 'WAITLISTED' THEN b.id END) as waitlist_count,
        COUNT(DISTINCT CASE WHEN b.booking_status = 'NOT_ATTENDED' THEN b.id END) as no_show_count,
        COALESCE(SUM(CASE WHEN p.state = 'COMPLETED' THEN p.amount / 100.0 ELSE 0 END), 0) as revenue,
        COALESCE(SUM(CASE WHEN p.state = 'PENDING' OR p.state IS NULL THEN
          CASE WHEN b.booking_status IN ('REGISTERED', 'ATTENDED') THEN e.ticket_price / 100.0 ELSE 0 END
        ELSE 0 END), 0) as pending_payment
      FROM event e
      LEFT JOIN booking b ON b.event_id = e.pk AND b.booking_status NOT IN ('DEREGISTERED', 'INITIATED')
      LEFT JOIN transaction t ON t.entity_id = b.id AND t.entity_type = 'BOOKING'
      LEFT JOIN payment p ON p.pk = t.payment_id
      WHERE e.club_id = $1
        AND e.start_time >= ${prevWeekStartSQL}
        AND e.start_time < ${prevWeekEndSQL}
        AND e.state = 'CREATED'
    `;

    const prevWeekTotalsResult = await queryProduction(prevWeekTotalsQuery, [clubId]);
    const prevWeekTotals = prevWeekTotalsResult.rows[0] || {};

    // Fetch last 4 weeks pending payments (from 4 weeks before selected week end)
    const l4wPendingQuery = `
      SELECT
        COALESCE(SUM(CASE WHEN p.state = 'PENDING' OR p.state IS NULL THEN
          CASE WHEN b.booking_status IN ('REGISTERED', 'ATTENDED') THEN e.ticket_price / 100.0 ELSE 0 END
        ELSE 0 END), 0) as pending_payment
      FROM event e
      LEFT JOIN booking b ON b.event_id = e.pk AND b.booking_status NOT IN ('DEREGISTERED', 'INITIATED')
      LEFT JOIN transaction t ON t.entity_id = b.id AND t.entity_type = 'BOOKING'
      LEFT JOIN payment p ON p.pk = t.payment_id
      WHERE e.club_id = $1
        AND e.start_time >= ${weekEndSQL} - INTERVAL '4 weeks'
        AND e.start_time < ${weekEndSQL}
        AND e.state = 'CREATED'
    `;
    const l4wPendingResult = await queryProduction(l4wPendingQuery, [clubId]);
    const l4wPendingPayments = parseFloat(l4wPendingResult.rows[0]?.pending_payment) || 0;

    // Calculate current week totals
    const currentTotals = {
      meetups: meetups.length,
      bookings: meetups.reduce((sum: number, m: any) => sum + m.total_bookings, 0),
      no_shows: meetups.reduce((sum: number, m: any) => sum + m.no_show_count, 0),
      revenue: meetups.reduce((sum: number, m: any) => sum + m.revenue, 0),
      pending: meetups.reduce((sum: number, m: any) => sum + m.pending_payment, 0),
      waitlist: meetups.reduce((sum: number, m: any) => sum + m.waitlist_count, 0)
    };

    const prevTotals = {
      meetups: parseInt(prevWeekTotals.meetup_count) || 0,
      bookings: parseInt(prevWeekTotals.booking_count) || 0,
      waitlist: parseInt(prevWeekTotals.waitlist_count) || 0,
      no_shows: parseInt(prevWeekTotals.no_show_count) || 0,
      revenue: parseFloat(prevWeekTotals.revenue) || 0,
      pending: parseFloat(prevWeekTotals.pending_payment) || 0
    };

    // Calculate no-show percentage
    const currentNoShowPct = currentTotals.bookings > 0
      ? Math.round((currentTotals.no_shows / currentTotals.bookings) * 1000) / 10
      : 0;
    const prevNoShowPct = prevTotals.bookings > 0
      ? Math.round((prevTotals.no_shows / prevTotals.bookings) * 1000) / 10
      : 0;

    res.json({
      success: true,
      club_id: clubId,
      meetups,
      // Summary metrics with WoW comparison
      summary: {
        current: {
          meetups: currentTotals.meetups,
          bookings: currentTotals.bookings,
          waitlist: currentTotals.waitlist,
          no_show_pct: currentNoShowPct,
          revenue: currentTotals.revenue,
          pending: currentTotals.pending,
          rating: avgRating
        },
        previous: {
          meetups: prevTotals.meetups,
          bookings: prevTotals.bookings,
          waitlist: prevTotals.waitlist,
          no_show_pct: prevNoShowPct,
          revenue: prevTotals.revenue,
          pending: prevTotals.pending,
          rating: prevAvgRating
        },
        change: {
          meetups: currentTotals.meetups - prevTotals.meetups,
          bookings: currentTotals.bookings - prevTotals.bookings,
          waitlist: currentTotals.waitlist - prevTotals.waitlist,
          no_show_pct: Math.round((currentNoShowPct - prevNoShowPct) * 10) / 10,
          revenue: currentTotals.revenue - prevTotals.revenue,
          pending: currentTotals.pending - prevTotals.pending,
          rating: Math.round((avgRating - prevAvgRating) * 100) / 100
        }
      },
      // Last 4 weeks pending payments (for collection focus)
      l4w_pending_payments: l4wPendingPayments,
      // Legacy fields for backwards compatibility
      total_meetups: meetups.length,
      total_revenue: currentTotals.revenue,
      total_waitlist: currentTotals.waitlist,
      // Health metrics for tooltip
      health: {
        score: healthScore,
        status: healthStatus,
        is_new_club: isNewClub,
        capacity: {
          current: capacityPct,
          previous: prevCapacityPct,
          change: Math.round((capacityPct - prevCapacityPct) * 10) / 10,
          status: capacityHealth
        },
        repeat_rate: {
          current: repeatRatePct,
          previous: prevRepeatRatePct,
          change: Math.round((repeatRatePct - prevRepeatRatePct) * 10) / 10,
          status: repeatHealth
        },
        rating: {
          current: avgRating,
          previous: prevAvgRating,
          change: Math.round((avgRating - prevAvgRating) * 100) / 100,
          status: ratingHealth
        }
      }
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
