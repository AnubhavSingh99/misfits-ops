import { Router } from 'express';
import { Pool } from 'pg';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger';

const router = Router();
const execAsync = promisify(exec);

// Production Misfits database connection pool
let misfitsPool: Pool | null = null;

// SSH tunnel connection details (same as health.ts)
const SSH_CONFIG = {
  keyFile: '/Users/retalplaza/Downloads/DB claude key/claude-control-key',
  sshHost: '15.207.255.212',
  sshUser: 'claude-control',
  dbHost: 'misfits.cgncbvolnhe7.ap-south-1.rds.amazonaws.com',
  dbPort: '5432',
  localPort: '5433',
  dbName: 'misfits',
  dbUser: 'dev',
  dbPassword: 'postgres'
};

/**
 * Initialize SSH tunnel and database connection
 */
async function initializeMisfitsConnection(): Promise<Pool> {
  if (misfitsPool) {
    try {
      // Test existing connection
      const client = await misfitsPool.connect();
      await client.query('SELECT 1');
      client.release();
      return misfitsPool;
    } catch (error) {
      logger.info('Existing connection failed, recreating...');
      misfitsPool = null;
    }
  }

  try {
    // Kill existing SSH tunnels
    try {
      await execAsync(`pkill -f "${SSH_CONFIG.localPort}.*misfits"`);
    } catch (error) {
      // Ignore if no processes found
    }

    // Wait a moment for processes to die
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Establish SSH tunnel
    const sshCommand = `ssh -i "${SSH_CONFIG.keyFile}" -f -N -L ${SSH_CONFIG.localPort}:${SSH_CONFIG.dbHost}:${SSH_CONFIG.dbPort} ${SSH_CONFIG.sshUser}@${SSH_CONFIG.sshHost}`;

    logger.info('Establishing SSH tunnel for scaling data...');
    await execAsync(sshCommand);

    // Wait for tunnel to be established
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Create database connection pool
    misfitsPool = new Pool({
      host: 'localhost',
      port: parseInt(SSH_CONFIG.localPort),
      database: SSH_CONFIG.dbName,
      user: SSH_CONFIG.dbUser,
      password: SSH_CONFIG.dbPassword,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    // Test connection
    const testClient = await misfitsPool.connect();
    await testClient.query('SELECT 1');
    testClient.release();

    logger.info('Scaling database connection established successfully');
    return misfitsPool;

  } catch (error) {
    logger.error('Failed to initialize scaling database connection:', error);
    throw error;
  }
}

/**
 * Execute query against Misfits database with error handling
 */
async function queryMisfits(text: string, params?: any[]): Promise<any> {
  const pool = await initializeMisfitsConnection();
  const client = await pool.connect();

  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

// Get cities and areas for scaling planner dropdowns
router.get('/cities', async (req, res) => {
  try {
    logger.info('Fetching cities and areas for scaling planner...');

    const citiesQuery = `
      SELECT DISTINCT
        c.id,
        c.name as city_name,
        c.state
      FROM city c
      WHERE c.is_active = true
      ORDER BY c.name
    `;

    const result = await queryMisfits(citiesQuery);

    if (result.rows && result.rows.length > 0) {
      const cities = result.rows.map(row => ({
        id: row.id,
        name: row.city_name,
        state: row.state
      }));

      logger.info(`Successfully fetched ${cities.length} cities`);

      res.json({
        success: true,
        cities: cities,
        source: 'database',
        generated_at: new Date().toISOString()
      });

    } else {
      throw new Error('No cities data returned from database');
    }

  } catch (error) {
    logger.error('Cities data fetch failed:', error);

    res.status(500).json({
      success: false,
      error: 'Failed to fetch cities data from database',
      message: 'Database connection failed. Please ensure SSH tunnel is established.',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get areas for a specific city
router.get('/areas/:cityId', async (req, res) => {
  try {
    const cityId = parseInt(req.params.cityId);

    if (isNaN(cityId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid city ID provided'
      });
    }

    logger.info(`Fetching areas for city ID: ${cityId}`);

    const areasQuery = `
      SELECT
        a.id,
        a.name as area_name,
        a.postal_code,
        a.lat,
        a.lng,
        c.name as city_name
      FROM area a
      JOIN city c ON a.city_id = c.id
      WHERE a.city_id = $1
      ORDER BY a.name
    `;

    const result = await queryMisfits(areasQuery, [cityId]);

    if (result.rows && result.rows.length > 0) {
      const areas = result.rows.map(row => ({
        id: row.id,
        name: row.area_name,
        city_name: row.city_name,
        postal_code: row.postal_code,
        coordinates: {
          lat: row.lat,
          lng: row.lng
        }
      }));

      logger.info(`Successfully fetched ${areas.length} areas for city ${cityId}`);

      res.json({
        success: true,
        areas: areas,
        city_id: cityId,
        source: 'database',
        generated_at: new Date().toISOString()
      });

    } else {
      logger.info(`No areas found for city ID: ${cityId}`);
      res.json({
        success: true,
        areas: [],
        city_id: cityId,
        message: 'No areas found for this city',
        source: 'database',
        generated_at: new Date().toISOString()
      });
    }

  } catch (error) {
    logger.error(`Areas data fetch failed for city ${req.params.cityId}:`, error);

    res.status(500).json({
      success: false,
      error: 'Failed to fetch areas data from database',
      message: 'Database connection failed. Please ensure SSH tunnel is established.',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get all areas with city information (for direct area selection)
router.get('/areas', async (req, res) => {
  try {
    logger.info('Fetching all areas with city information...');

    const areasQuery = `
      SELECT
        a.id as area_id,
        a.name as area_name,
        a.postal_code,
        a.lat,
        a.lng,
        c.id as city_id,
        c.name as city_name,
        c.state
      FROM area a
      JOIN city c ON a.city_id = c.id
      WHERE c.is_active = true
      ORDER BY c.name, a.name
    `;

    const result = await queryMisfits(areasQuery);

    if (result.rows && result.rows.length > 0) {
      const areas = result.rows.map(row => ({
        id: row.area_id,
        name: row.area_name,
        postal_code: row.postal_code,
        coordinates: {
          lat: row.lat,
          lng: row.lng
        },
        city: {
          id: row.city_id,
          name: row.city_name,
          state: row.state
        },
        display_name: `${row.area_name}, ${row.city_name}`
      }));

      // Group areas by city for easier frontend consumption
      const areasByCity = areas.reduce((acc, area) => {
        const cityName = area.city.name;
        if (!acc[cityName]) {
          acc[cityName] = {
            city: area.city,
            areas: []
          };
        }
        acc[cityName].areas.push({
          id: area.id,
          name: area.name,
          postal_code: area.postal_code,
          coordinates: area.coordinates,
          display_name: area.display_name
        });
        return acc;
      }, {} as any);

      logger.info(`Successfully fetched ${areas.length} areas across ${Object.keys(areasByCity).length} cities`);

      res.json({
        success: true,
        areas: areas,
        areas_by_city: areasByCity,
        total_areas: areas.length,
        total_cities: Object.keys(areasByCity).length,
        source: 'database',
        generated_at: new Date().toISOString()
      });

    } else {
      throw new Error('No areas data returned from database');
    }

  } catch (error) {
    logger.error('All areas data fetch failed:', error);

    res.status(500).json({
      success: false,
      error: 'Failed to fetch areas data from database',
      message: 'Database connection failed. Please ensure SSH tunnel is established.',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get real clubs data for scaling planner
router.get('/clubs', async (req, res) => {
  try {
    logger.info('Fetching real clubs data for scaling planner...');

    // Query to get real club data with calculated metrics
    const clubsQuery = `
      SELECT
        c.id as club_id,
        c.name as club_name,
        a.name as activity,
        c.city,
        c.area,
        c.status,

        -- Current meetups: Count of events in last 7 days (last week)
        COUNT(DISTINCT CASE
          WHEN e.created_at >= CURRENT_DATE - INTERVAL '7 days'
          THEN e.pk
          ELSE NULL
        END) as current_meetups,

        -- Total events (all time)
        COUNT(DISTINCT e.pk) as total_events,

        -- Current revenue: Sum of completed payments in rupees (simplified for now)
        0 as current_revenue,

        -- Capacity utilization: Average booking fill rate (simplified)
        0 as capacity_utilization,

        -- Unique attendees (simplified)
        0 as unique_attendees,

        -- Average rating (simplified)
        0 as avg_rating,

        -- Last event date
        MAX(e.created_at) as last_event_date,

        -- Club creation date
        c.created_at as club_created_at

      FROM club c
      LEFT JOIN activity a ON c.activity_id = a.id
      LEFT JOIN event e ON c.pk = e.club_id
      WHERE c.status = 'ACTIVE'
        AND c.created_at >= CURRENT_DATE - INTERVAL '365 days' -- Only clubs from last year
      GROUP BY c.pk, c.id, c.name, a.name, c.city, c.area, c.status, c.created_at
      HAVING COUNT(DISTINCT e.pk) > 0 OR c.created_at >= CURRENT_DATE - INTERVAL '30 days'
      ORDER BY current_revenue DESC, total_events DESC
    `;

    const result = await queryMisfits(clubsQuery);

    if (result.rows && result.rows.length > 0) {
      // Process the results
      const clubs = result.rows.map(row => ({
        id: row.club_id,
        name: row.club_name,
        activity: row.activity || 'Unknown',
        city: row.city || 'Unknown',
        area: row.area || 'Unknown',
        current_meetups: parseInt(row.current_meetups || 0),
        total_events: parseInt(row.total_events || 0),
        current_revenue: Math.round(row.current_revenue || 0), // in rupees
        capacity_utilization: Math.round(row.capacity_utilization || 0),
        unique_attendees: parseInt(row.unique_attendees || 0),
        avg_rating: parseFloat((row.avg_rating || 0).toFixed(1)),
        last_event_date: row.last_event_date ? row.last_event_date.toISOString().split('T')[0] : null,
        club_created_at: row.club_created_at ? row.club_created_at.toISOString().split('T')[0] : null,

        // Determine health status based on capacity utilization and activity
        health_status: row.capacity_utilization >= 70 ? 'healthy' :
                      row.capacity_utilization >= 40 ? 'at_risk' : 'critical',

        // Determine scaling type based on metrics
        scaling_type: determineScalingType(row),

        // Scaling suggestions based on capacity and activity
        scaling_suggestion: generateScalingSuggestion(row),

        // Default targets (can be overridden by user)
        target_meetups: Math.max(parseInt(row.current_meetups || 0) + 2, 4),
        target_revenue: Math.max(Math.round(row.current_revenue || 0) + 5000, 10000),

        // Additional fields for scaling planner
        status: parseInt(row.total_events || 0) === 0 ? 'new' : 'monitoring',
        poc_name: 'Unassigned', // TODO: Add POC mapping
        wow_comment: 'Recently added from database',
        date_added: new Date().toISOString().split('T')[0],
        is_new_from_db: true
      }));

      // Calculate summary metrics
      const metrics = {
        total_clubs: clubs.length,
        new_clubs: clubs.filter(c => c.status === 'new').length,
        scaling_clubs: clubs.filter(c => c.status === 'scaling').length,
        total_current_meetups: clubs.reduce((sum, c) => sum + c.current_meetups, 0),
        total_current_revenue: clubs.reduce((sum, c) => sum + c.current_revenue, 0),
        healthy_clubs: clubs.filter(c => c.health_status === 'healthy').length,
        at_risk_clubs: clubs.filter(c => c.health_status === 'at_risk').length,
        critical_clubs: clubs.filter(c => c.health_status === 'critical').length
      };

      logger.info(`Successfully fetched ${clubs.length} real clubs for scaling planner`);

      res.json({
        success: true,
        clubs: clubs,
        metrics: metrics,
        source: 'database',
        generated_at: new Date().toISOString()
      });

    } else {
      throw new Error('No club data returned from database');
    }

  } catch (error) {
    logger.error('Scaling clubs data fetch failed:', error);

    res.status(500).json({
      success: false,
      error: 'Failed to fetch clubs data from database',
      message: 'Database connection failed. Please ensure SSH tunnel is established.',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Helper function to determine scaling type based on club metrics
function determineScalingType(clubData: any): string {
  const currentMeetups = parseInt(clubData.current_meetups || 0);
  const totalEvents = parseInt(clubData.total_events || 0);
  const revenue = parseFloat(clubData.current_revenue || 0);
  const capacity = parseFloat(clubData.capacity_utilization || 0);

  // High growth: High revenue and capacity
  if (revenue > 15000 && capacity > 70) {
    return 'high_growth';
  }

  // Scaling activity: Good events count and decent capacity
  if (totalEvents >= 10 && capacity >= 50) {
    return 'scaling_activity';
  }

  // Long tail: Low volume but stable
  if (totalEvents >= 5 && totalEvents < 10) {
    return 'long_tail';
  }

  // Default: Standard
  return 'standard';
}

// Helper function to generate scaling suggestions based on capacity and waitlists
function generateScalingSuggestion(clubData: any): string {
  const currentMeetups = parseInt(clubData.current_meetups || 0);
  const totalEvents = parseInt(clubData.total_events || 0);
  const capacity = parseFloat(clubData.capacity_utilization || 0);
  const revenue = parseFloat(clubData.current_revenue || 0);
  const avgRating = parseFloat(clubData.avg_rating || 0);

  // High capacity + good ratings = scale up suggestion
  if (capacity >= 90 && avgRating >= 4.0 && currentMeetups >= 2) {
    return 'High demand! Consider increasing frequency to 2x/week or adding parallel sessions. Strong capacity utilization with good ratings indicates scaling opportunity.';
  }

  // Very high capacity = immediate scaling
  if (capacity >= 100 && avgRating >= 3.5) {
    return 'At 100% capacity! Immediate scaling needed. Consider adding waitlist or additional session slots. Premium pricing opportunity.';
  }

  // Good capacity with decent activity
  if (capacity >= 70 && capacity < 90 && currentMeetups >= 1 && avgRating >= 3.5) {
    return 'Good utilization. Monitor for growth patterns. Consider testing increased frequency if demand continues.';
  }

  // Low activity but good rating
  if (capacity >= 60 && currentMeetups < 2 && avgRating >= 4.0) {
    return 'Quality engagement but low frequency. Focus on marketing and member retention to increase meetup frequency.';
  }

  // High revenue but low capacity
  if (revenue > 10000 && capacity < 50) {
    return 'Strong revenue with room for growth. Optimize event marketing and scheduling to improve capacity utilization.';
  }

  // New club with potential
  if (totalEvents < 5 && capacity >= 50) {
    return 'New club showing promise. Monitor closely for scaling patterns. Focus on consistent quality delivery.';
  }

  // Low performance
  if (capacity < 40 && avgRating < 3.5) {
    return 'Needs attention. Focus on improving event quality and member engagement before scaling.';
  }

  // Stable but not growing
  return 'Stable performance. Analyze member feedback and local market to identify growth opportunities.';
}

// Get all activities from database
router.get('/activities', async (req, res) => {
  try {
    logger.info('Fetching activities from database...');

    const activitiesQuery = `
      SELECT
        a.id,
        a.name,
        COUNT(c.pk) as club_count,
        SUM(CASE WHEN c.status = 'ACTIVE' THEN 1 ELSE 0 END) as active_clubs,
        SUM(CASE WHEN c.status = 'INACTIVE' THEN 1 ELSE 0 END) as inactive_clubs
      FROM activity a
      LEFT JOIN club c ON a.id = c.activity_id
      WHERE a.name IS NOT NULL
        AND a.name != ''
        AND a.name NOT ILIKE '%test%'
      GROUP BY a.id, a.name
      ORDER BY active_clubs DESC, club_count DESC
    `;

    const pool = await initializeMisfitsConnection();
    const result = await pool.query(activitiesQuery);

    const activities = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      clubCount: parseInt(row.club_count),
      activeClubs: parseInt(row.active_clubs),
      inactiveClubs: parseInt(row.inactive_clubs)
    }));

    logger.info(`Successfully fetched ${activities.length} activities`);

    res.json({
      success: true,
      activities,
      generated_at: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Activities fetch failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch activities from database',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get all cities and their areas from database
router.get('/cities', async (req, res) => {
  try {
    logger.info('Fetching cities and areas from database...');

    const citiesQuery = `
      SELECT
        ci.id as city_id,
        ci.name as city_name,
        COUNT(DISTINCT a.id) as area_count,
        COUNT(DISTINCT c.pk) as club_count,
        json_agg(DISTINCT jsonb_build_object('id', a.id, 'name', a.name)) as areas
      FROM city ci
      LEFT JOIN area a ON ci.id = a.city_id
      LEFT JOIN location l ON a.id = l.area_id
      LEFT JOIN event e ON l.id = e.location_id
      LEFT JOIN club c ON e.club_id = c.pk
      WHERE ci.name IS NOT NULL
        AND ci.name != ''
      GROUP BY ci.id, ci.name
      HAVING COUNT(DISTINCT a.id) > 0
      ORDER BY club_count DESC, ci.name
    `;

    const pool = await initializeMisfitsConnection();
    const result = await pool.query(citiesQuery);

    const cities = result.rows.map(row => ({
      id: row.city_id,
      name: row.city_name,
      areaCount: parseInt(row.area_count),
      clubCount: parseInt(row.club_count),
      areas: row.areas.filter(area => area.name && area.name.trim())
    }));

    logger.info(`Successfully fetched ${cities.length} cities`);

    res.json({
      success: true,
      cities,
      generated_at: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Cities fetch failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch cities from database',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get all clubs with their basic info for scaling planner
router.get('/clubs', async (req, res) => {
  try {
    logger.info('Fetching clubs from database...');

    const { activity, city, area, status } = req.query;

    let whereConditions = ["c.name NOT ILIKE '%test%'"];

    if (activity && activity !== 'all') {
      whereConditions.push(`a.name = '${activity}'`);
    }

    if (status && status !== 'all') {
      whereConditions.push(`c.status = '${status.toString().toUpperCase()}'`);
    }

    // City/area filtering through most recent event location
    let cityAreaJoin = '';
    if (city && city !== 'all') {
      cityAreaJoin = `
        AND EXISTS (
          SELECT 1 FROM event e2
          LEFT JOIN location l2 ON e2.location_id = l2.id
          LEFT JOIN area ar2 ON l2.area_id = ar2.id
          LEFT JOIN city ci2 ON ar2.city_id = ci2.id
          WHERE e2.club_id = c.pk AND ci2.name = '${city}'
        )
      `;
    }

    if (area && area !== 'all') {
      cityAreaJoin += `
        AND EXISTS (
          SELECT 1 FROM event e3
          LEFT JOIN location l3 ON e3.location_id = l3.id
          LEFT JOIN area ar3 ON l3.area_id = ar3.id
          WHERE e3.club_id = c.pk AND ar3.name = '${area}'
        )
      `;
    }

    const clubsQuery = `
      SELECT
        c.pk,
        c.id as club_uuid,
        c.name as club_name,
        c.status,
        c.created_at,
        a.name as activity_name,
        -- Get most recent city/area
        (
          SELECT ci.name
          FROM event e
          LEFT JOIN location l ON e.location_id = l.id
          LEFT JOIN area ar ON l.area_id = ar.id
          LEFT JOIN city ci ON ar.city_id = ci.id
          WHERE e.club_id = c.pk
          ORDER BY e.start_time DESC
          LIMIT 1
        ) as city_name,
        (
          SELECT ar.name
          FROM event e
          LEFT JOIN location l ON e.location_id = l.id
          LEFT JOIN area ar ON l.area_id = ar.id
          WHERE e.club_id = c.pk
          ORDER BY e.start_time DESC
          LIMIT 1
        ) as area_name,
        -- Basic metrics
        (
          SELECT COUNT(*)
          FROM event e
          WHERE e.club_id = c.pk
            AND e.created_at >= CURRENT_DATE - INTERVAL '30 days'
            AND e.state = 'CREATED'
        ) as recent_events,
        (
          SELECT COUNT(*)
          FROM event e
          WHERE e.club_id = c.pk AND e.state = 'CREATED'
        ) as total_events
      FROM club c
      LEFT JOIN activity a ON c.activity_id = a.id
      WHERE ${whereConditions.join(' AND ')}
        ${cityAreaJoin}
      ORDER BY
        CASE WHEN c.status = 'ACTIVE' THEN 1 ELSE 2 END,
        recent_events DESC,
        total_events DESC,
        c.name
    `;

    const pool = await initializeMisfitsConnection();
    const result = await pool.query(clubsQuery);

    const clubs = result.rows.map(row => ({
      id: row.pk,
      uuid: row.club_uuid,
      name: row.club_name,
      status: row.status,
      activity: row.activity_name || 'Unknown',
      city: row.city_name || 'Unknown',
      area: row.area_name || 'Unknown',
      recentEvents: parseInt(row.recent_events),
      totalEvents: parseInt(row.total_events),
      createdAt: row.created_at
    }));

    logger.info(`Successfully fetched ${clubs.length} clubs`);

    res.json({
      success: true,
      clubs,
      filters: {
        activity: activity || 'all',
        city: city || 'all',
        area: area || 'all',
        status: status || 'all'
      },
      generated_at: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Clubs fetch failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch clubs from database',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;