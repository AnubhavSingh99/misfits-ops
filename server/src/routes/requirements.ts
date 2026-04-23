import { Router, Request, Response } from 'express';
import { queryLocal, queryProduction } from '../services/database';
import { getTeamForClub } from '../../../shared/teamConfig';
import { sendLeaderRequirementClosureNotification } from '../services/slackService';
import {
  LeaderRequirement,
  VenueRequirement,
  CreateRequirementRequest,
  UpdateRequirementRequest,
  RequirementStatus
} from '../../../shared/types';

const router = Router();

function shouldUseRequirementsApiFallback(): boolean {
  if (process.env.ENABLE_REQUIREMENTS_API_FALLBACK === 'true') return true;
  return process.env.NODE_ENV !== 'production';
}

async function fetchRequirementsFallback(req: Request): Promise<any | null> {
  if (!shouldUseRequirementsApiFallback()) return null;
  const base = (process.env.LEADER_REQUIREMENTS_FALLBACK_URL || 'https://operations.misfits.net.in').trim().replace(/\/+$/, '');
  if (!base) return null;

  const targetUrl = `${base}${req.originalUrl}`;
  try {
    const response = await fetch(targetUrl);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

// =====================================================
// LEADER REQUIREMENTS CRUD
// =====================================================

// GET /api/requirements/leaders - List leader requirements with filters
router.get('/leaders', async (req: Request, res: Response) => {
  try {
    const {
      activity_id,
      city_id,
      area_id,
      club_id,
      launch_id,
      team,
      status,
      search
    } = req.query;

    let query = `
      SELECT lr.*,
        (SELECT COUNT(*) FROM requirement_comments rc
         WHERE rc.requirement_type = 'leader' AND rc.requirement_id = lr.id) as comments_count
      FROM leader_requirements lr
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (activity_id) {
      query += ` AND lr.activity_id = $${paramIndex++}`;
      params.push(activity_id);
    }
    if (city_id) {
      query += ` AND lr.city_id = $${paramIndex++}`;
      params.push(city_id);
    }
    if (area_id) {
      query += ` AND lr.area_id = $${paramIndex++}`;
      params.push(area_id);
    }
    if (club_id) {
      query += ` AND lr.club_id = $${paramIndex++}`;
      params.push(club_id);
    }
    if (launch_id) {
      query += ` AND lr.launch_id = $${paramIndex++}`;
      params.push(launch_id);
    }
    if (team) {
      query += ` AND lr.team = $${paramIndex++}`;
      params.push(team);
    }
    if (status) {
      query += ` AND lr.status = $${paramIndex++}`;
      params.push(status);
    }
    if (search) {
      query += ` AND (lr.name ILIKE $${paramIndex} OR lr.description ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY lr.created_at DESC`;

    const result = await queryLocal(query, params);

    // Fetch linked tasks for all requirements
    let linkedTasksMap: Record<number, any[]> = {};
    if (result.rows.length > 0) {
      const reqIds = result.rows.map((r: any) => r.id);
      const linkedTasksQuery = `
        SELECT stlr.leader_requirement_id, st.id, st.title, st.status, st.assigned_to_name
        FROM scaling_task_leader_requirements stlr
        JOIN scaling_tasks st ON stlr.task_id = st.id
        WHERE stlr.leader_requirement_id = ANY($1)
        ORDER BY st.created_at DESC
      `;
      const linkedTasksResult = await queryLocal(linkedTasksQuery, [reqIds]);
      for (const row of linkedTasksResult.rows) {
        if (!linkedTasksMap[row.leader_requirement_id]) {
          linkedTasksMap[row.leader_requirement_id] = [];
        }
        linkedTasksMap[row.leader_requirement_id].push({
          id: row.id,
          title: row.title,
          status: row.status,
          assigned_to_name: row.assigned_to_name
        });
      }
    }

    const requirements = result.rows.map((r: any) => ({
      ...r,
      type: 'leader' as const,
      linked_tasks: linkedTasksMap[r.id] || []
    }));

    if (requirements.length === 0) {
      const fallback = await fetchRequirementsFallback(req);
      if (fallback?.success && Array.isArray(fallback.requirements)) {
        return res.json(fallback);
      }
    }

    res.json({
      success: true,
      requirements,
      total: requirements.length
    });
  } catch (error) {
    console.error('Error fetching leader requirements:', error);
    const fallback = await fetchRequirementsFallback(req);
    if (fallback?.success) {
      return res.json(fallback);
    }
    res.status(500).json({ success: false, error: 'Failed to fetch leader requirements' });
  }
});

// GET /api/requirements/leaders/search - Search leader requirements
router.get('/leaders/search', async (req: Request, res: Response) => {
  try {
    const { q, club_id, activity_id, city_id, area_id, limit = 10 } = req.query;

    let query = `
      SELECT * FROM leader_requirements
      WHERE status != 'done'
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (q) {
      query += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
      params.push(`%${q}%`);
      paramIndex++;
    }
    if (club_id) {
      query += ` AND club_id = $${paramIndex++}`;
      params.push(club_id);
    }
    if (activity_id) {
      query += ` AND activity_id = $${paramIndex++}`;
      params.push(activity_id);
    }
    if (city_id) {
      query += ` AND city_id = $${paramIndex++}`;
      params.push(city_id);
    }
    if (area_id) {
      query += ` AND area_id = $${paramIndex++}`;
      params.push(area_id);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await queryLocal(query, params);
    const requirements = result.rows.map((r: any) => ({
      ...r,
      type: 'leader' as const
    }));

    res.json({ success: true, requirements });
  } catch (error) {
    console.error('Error searching leader requirements:', error);
    res.status(500).json({ success: false, error: 'Search failed' });
  }
});

// GET /api/requirements/leaders/hierarchy - Get hierarchy for dashboard
router.get('/leaders/hierarchy', async (req: Request, res: Response) => {
  try {
    const { team, status, activity_ids, city_ids, area_ids, club_ids, teams } = req.query;

    let whereClause = '1=1';
    const params: any[] = [];
    let paramIndex = 1;

    // Support multi-value filters (comma-separated strings)
    // For each filter, we look up by name to handle cases where same name has different IDs
    if (activity_ids) {
      const ids = String(activity_ids).split(',').map(Number).filter(n => !isNaN(n));
      if (ids.length > 0) {
        // Filter by name (case-insensitive) to catch all variations of the same activity
        whereClause += ` AND LOWER(activity_name) IN (
          SELECT LOWER(activity_name) FROM leader_requirements WHERE activity_id = ANY($${paramIndex++})
        )`;
        params.push(ids);
      }
    }
    if (city_ids) {
      const ids = String(city_ids).split(',').map(Number).filter(n => !isNaN(n));
      if (ids.length > 0) {
        whereClause += ` AND LOWER(city_name) IN (
          SELECT LOWER(city_name) FROM leader_requirements WHERE city_id = ANY($${paramIndex++})
        )`;
        params.push(ids);
      }
    }
    if (area_ids) {
      const ids = String(area_ids).split(',').map(Number).filter(n => !isNaN(n));
      if (ids.length > 0) {
        whereClause += ` AND LOWER(area_name) IN (
          SELECT LOWER(area_name) FROM leader_requirements WHERE area_id = ANY($${paramIndex++})
        )`;
        params.push(ids);
      }
    }
    if (club_ids) {
      const ids = String(club_ids).split(',').map(Number).filter(n => !isNaN(n));
      if (ids.length > 0) {
        whereClause += ` AND LOWER(club_name) IN (
          SELECT LOWER(club_name) FROM leader_requirements WHERE club_id = ANY($${paramIndex++})
        )`;
        params.push(ids);
      }
    }
    // Support multiple teams (comma-separated or single value)
    if (teams) {
      const teamList = String(teams).split(',').filter(t => t.trim());
      if (teamList.length > 0) {
        whereClause += ` AND team = ANY($${paramIndex++})`;
        params.push(teamList);
      }
    } else if (team) {
      whereClause += ` AND team = $${paramIndex++}`;
      params.push(team);
    }
    if (status) {
      whereClause += ` AND status = $${paramIndex++}`;
      params.push(status);
    }

    // Get hierarchy order from query params (comma-separated, e.g., "activity,city,area" or "city,activity")
    const hierarchyOrder = req.query.hierarchy_order
      ? String(req.query.hierarchy_order).split(',').filter(l => ['activity', 'city', 'area'].includes(l))
      : ['activity', 'city', 'area'];

    // Get all requirements with the filters
    const query = `
      SELECT lr.*,
        (SELECT COUNT(*) FROM requirement_comments rc
         WHERE rc.requirement_type = 'leader' AND rc.requirement_id = lr.id) as comments_count
      FROM leader_requirements lr
      WHERE ${whereClause.replace(/activity_name/g, 'lr.activity_name').replace(/city_name/g, 'lr.city_name').replace(/area_name/g, 'lr.area_name').replace(/club_name/g, 'lr.club_name').replace(/activity_id/g, 'lr.activity_id').replace(/city_id/g, 'lr.city_id').replace(/area_id/g, 'lr.area_id').replace(/club_id/g, 'lr.club_id').replace(/team/g, 'lr.team').replace(/status/g, 'lr.status')}
      ORDER BY lr.activity_name, lr.city_name, lr.area_name, lr.name
    `;

    const result = await queryLocal(query, params);
    const requirements = result.rows;

    // Helper to get level info from requirement
    const getLevelInfo = (req: any, level: string) => {
      switch (level) {
        case 'activity':
          return {
            name: req.activity_name || 'Unknown Activity',
            id_field: 'activity_id',
            id_value: req.activity_id
          };
        case 'city':
          return {
            name: req.city_name || 'Unknown City',
            id_field: 'city_id',
            id_value: req.city_id
          };
        case 'area':
          return {
            name: req.area_name || 'Unknown Area',
            id_field: 'area_id',
            id_value: req.area_id
          };
        default:
          return { name: 'Unknown', id_field: '', id_value: null };
      }
    };

    // Build dynamic hierarchy based on hierarchyOrder
    const hierarchyMap = new Map<string, any>();

    for (const reqData of requirements) {
      // Build the path through the hierarchy based on hierarchyOrder
      let currentKey = '';
      let currentMap = hierarchyMap;
      let parentNode: any = null;

      for (let i = 0; i < hierarchyOrder.length; i++) {
        const level = hierarchyOrder[i];
        const levelInfo = getLevelInfo(reqData, level);
        const levelKey = currentKey + `${level}:${levelInfo.name.toLowerCase().trim()}|`;

        if (!currentMap.has(levelKey)) {
          const isLastLevel = i === hierarchyOrder.length - 1;
          const node: any = {
            type: level,
            id: levelKey,
            name: levelInfo.name,
            activity_id: reqData.activity_id,
            city_id: reqData.city_id,
            area_id: reqData.area_id,
            count: 0,
            leaders_required_total: 0,  // Sum of leaders_required
            status_counts: { not_picked: 0, deprioritised: 0, in_progress: 0, done: 0 },
            growth_effort_count: 0,
            platform_effort_count: 0,
            existing_leader_effort_count: 0
          };

          if (isLastLevel) {
            node.requirements = [];
          } else {
            node.children = new Map();
          }

          currentMap.set(levelKey, node);
        }

        const node = currentMap.get(levelKey);

        // Update counts at each level
        node.count++;
        node.leaders_required_total += reqData.leaders_required || 1;  // Sum leaders_required
        node.status_counts[reqData.status as RequirementStatus]++;
        if (reqData.growth_team_effort) node.growth_effort_count++;
        if (reqData.platform_team_effort) node.platform_effort_count++;
        if (reqData.existing_leader_effort) node.existing_leader_effort_count++;

        // If this is the last level, add the requirement
        if (i === hierarchyOrder.length - 1) {
          node.requirements.push({ ...reqData, type: 'leader' });
        } else {
          currentKey = levelKey;
          currentMap = node.children;
        }
      }
    }

    // Convert Maps to arrays for JSON response
    const convertMapToArray = (node: any): any => {
      if (node.children instanceof Map) {
        node.children = Array.from(node.children.values()).map(convertMapToArray);
      }
      return node;
    };

    const hierarchy = Array.from(hierarchyMap.values()).map(convertMapToArray);

    // Calculate summary
    const summary = {
      total: requirements.length,
      leaders_required_total: requirements.reduce((sum: number, r: any) => sum + (r.leaders_required || 1), 0),
      not_picked: requirements.filter((r: any) => r.status === 'not_picked').length,
      deprioritised: requirements.filter((r: any) => r.status === 'deprioritised').length,
      in_progress: requirements.filter((r: any) => r.status === 'in_progress').length,
      done: requirements.filter((r: any) => r.status === 'done').length
    };

    if (requirements.length === 0) {
      const fallback = await fetchRequirementsFallback(req);
      if (fallback?.success && (Array.isArray(fallback.hierarchy) || fallback.summary)) {
        return res.json(fallback);
      }
    }

    res.json({ success: true, hierarchy, summary });
  } catch (error) {
    console.error('Error fetching leader requirements hierarchy:', error);
    const fallback = await fetchRequirementsFallback(req);
    if (fallback?.success) {
      return res.json(fallback);
    }
    res.status(500).json({ success: false, error: 'Failed to fetch hierarchy' });
  }
});

// GET /api/requirements/leaders/filter-options - Get distinct filter options
// NOTE: This route MUST be before /:id to avoid matching
router.get('/leaders/filter-options', async (req: Request, res: Response) => {
  try {
    // Use DISTINCT ON to get unique names (picking first id for each name)
    const [activities, cities, areas, clubs] = await Promise.all([
      queryLocal(`
        SELECT DISTINCT ON (LOWER(activity_name)) activity_id as id, activity_name as name
        FROM leader_requirements
        WHERE activity_id IS NOT NULL AND activity_name IS NOT NULL
        ORDER BY LOWER(activity_name), activity_id
      `),
      queryLocal(`
        SELECT DISTINCT ON (LOWER(city_name)) city_id as id, city_name as name
        FROM leader_requirements
        WHERE city_id IS NOT NULL AND city_name IS NOT NULL
        ORDER BY LOWER(city_name), city_id
      `),
      queryLocal(`
        SELECT DISTINCT ON (LOWER(area_name)) area_id as id, area_name as name
        FROM leader_requirements
        WHERE area_id IS NOT NULL AND area_name IS NOT NULL
        ORDER BY LOWER(area_name), area_id
      `),
      queryLocal(`
        SELECT DISTINCT ON (LOWER(club_name)) club_id as id, club_name as name
        FROM leader_requirements
        WHERE club_id IS NOT NULL AND club_name IS NOT NULL
        ORDER BY LOWER(club_name), club_id
      `)
    ]);

    const options = {
      activities: activities.rows,
      cities: cities.rows,
      areas: areas.rows,
      clubs: clubs.rows
    };

    const isLocalEmpty = options.activities.length === 0
      && options.cities.length === 0
      && options.areas.length === 0
      && options.clubs.length === 0;

    if (isLocalEmpty) {
      const fallback = await fetchRequirementsFallback(req);
      if (fallback?.success && fallback.options) {
        return res.json(fallback);
      }
    }

    res.json({
      success: true,
      options
    });
  } catch (error) {
    console.error('Error fetching leader filter options:', error);
    const fallback = await fetchRequirementsFallback(req);
    if (fallback?.success) {
      return res.json(fallback);
    }
    res.status(500).json({ success: false, error: 'Failed to fetch filter options' });
  }
});

// GET /api/requirements/leaders/:id - Get single leader requirement
router.get('/leaders/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await queryLocal(
      'SELECT * FROM leader_requirements WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Requirement not found' });
    }

    res.json({
      success: true,
      requirement: { ...result.rows[0], type: 'leader' }
    });
  } catch (error) {
    console.error('Error fetching leader requirement:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch requirement' });
  }
});

// POST /api/requirements/leaders - Create leader requirement
router.post('/leaders', async (req: Request, res: Response) => {
  try {
    const data: CreateRequirementRequest = req.body;

    // Validate club_id or launch_id is required
    if (!data.club_id && !data.launch_id) {
      return res.status(400).json({
        success: false,
        error: 'Either club_id or launch_id is required. Every requirement must be linked to a club or launch.'
      });
    }

    // Auto-calculate team if not provided
    let team = data.team;
    if (!team && data.activity_name && data.city_name) {
      team = getTeamForClub(data.activity_name, data.city_name);
    }

    const result = await queryLocal(
      `INSERT INTO leader_requirements (
        name, description,
        activity_id, activity_name,
        city_id, city_name,
        area_id, area_name,
        club_id, club_name, launch_id,
        growth_team_effort, platform_team_effort,
        existing_leader_effort, leaders_required,
        comments, team, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *`,
      [
        data.name,
        data.description || null,
        data.activity_id || null,
        data.activity_name || null,
        data.city_id || null,
        data.city_name || null,
        data.area_id || null,
        data.area_name || null,
        data.club_id || null,  // Only store actual club_id
        data.club_name || null,
        data.launch_id || null,  // Store launch_id in dedicated column
        data.growth_team_effort || false,
        data.platform_team_effort || false,
        data.existing_leader_effort || false,
        data.leaders_required || 1,
        data.comments || null,
        team || null,
        'system' // TODO: Get from auth
      ]
    );

    res.status(201).json({
      success: true,
      requirement: { ...result.rows[0], type: 'leader' }
    });
  } catch (error) {
    console.error('Error creating leader requirement:', error);
    res.status(500).json({ success: false, error: 'Failed to create requirement' });
  }
});

// PUT /api/requirements/leaders/:id - Update leader requirement
router.put('/leaders/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data: UpdateRequirementRequest = req.body;

    // Build dynamic update query
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      params.push(data.name);
    }
    if (data.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      params.push(data.description);
    }
    if (data.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      params.push(data.status);
      // Auto-set completed_at when status changes to 'done', clear it otherwise
      if (data.status === 'done') {
        updates.push(`completed_at = CURRENT_TIMESTAMP`);
      } else {
        updates.push(`completed_at = NULL`);
      }
    }
    if (data.growth_team_effort !== undefined) {
      updates.push(`growth_team_effort = $${paramIndex++}`);
      params.push(data.growth_team_effort);
    }
    if (data.platform_team_effort !== undefined) {
      updates.push(`platform_team_effort = $${paramIndex++}`);
      params.push(data.platform_team_effort);
    }
    if (data.existing_leader_effort !== undefined) {
      updates.push(`existing_leader_effort = $${paramIndex++}`);
      params.push(data.existing_leader_effort);
    }
    if (data.leaders_required !== undefined) {
      updates.push(`leaders_required = $${paramIndex++}`);
      params.push(data.leaders_required);
    }
    if (data.comments !== undefined) {
      updates.push(`comments = $${paramIndex++}`);
      params.push(data.comments);
    }
    if ((data as any).closed_by !== undefined) {
      updates.push(`closed_by = $${paramIndex++}`);
      params.push((data as any).closed_by);
    }

    // Always update timestamp
    updates.push(`updated_at = CURRENT_TIMESTAMP`);

    if (updates.length === 1) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    params.push(id);
    const result = await queryLocal(
      `UPDATE leader_requirements SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Requirement not found' });
    }

    const updatedRequirement = result.rows[0];

    // Send Slack notification if closed_by was just set
    if ((data as any).closed_by && ((data as any).closed_by === 'growth_team' || (data as any).closed_by === 'platform_team')) {
      // Fire and forget - don't wait for Slack response
      sendLeaderRequirementClosureNotification(
        {
          id: updatedRequirement.id,
          name: updatedRequirement.name,
          activity_name: updatedRequirement.activity_name,
          city_name: updatedRequirement.city_name,
          area_name: updatedRequirement.area_name,
          team: updatedRequirement.team
        },
        (data as any).closed_by
      ).catch(err => console.error('Slack notification failed:', err));
    }

    res.json({
      success: true,
      requirement: { ...updatedRequirement, type: 'leader' }
    });
  } catch (error) {
    console.error('Error updating leader requirement:', error);
    res.status(500).json({ success: false, error: 'Failed to update requirement' });
  }
});

// DELETE /api/requirements/leaders/:id - Delete leader requirement
router.delete('/leaders/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await queryLocal(
      'DELETE FROM leader_requirements WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Requirement not found' });
    }

    res.json({ success: true, deleted_id: id });
  } catch (error) {
    console.error('Error deleting leader requirement:', error);
    res.status(500).json({ success: false, error: 'Failed to delete requirement' });
  }
});

// =====================================================
// VENUE REQUIREMENTS CRUD (Same pattern as leaders)
// =====================================================

// GET /api/requirements/venues/day-types - Get available day types for venue requirements
router.get('/venues/day-types', async (req: Request, res: Response) => {
  try {
    const result = await queryLocal(`
      SELECT id, day_type, display_order
      FROM dim_day_types
      WHERE is_active = true
      ORDER BY display_order
    `);

    res.json({
      success: true,
      day_types: result.rows.map((row: any) => ({
        id: row.id,
        name: row.day_type,
        display_order: row.display_order
      }))
    });
  } catch (error) {
    console.error('Error fetching day types:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch day types' });
  }
});

// GET /api/requirements/venues/supply-demand - Supply vs demand analysis
router.get('/venues/supply-demand', async (req: Request, res: Response) => {
  try {
    // 1. DEMAND: New club launches (planned/in_progress)
    const launchesResult = await queryLocal(`
      SELECT
        activity_name,
        COALESCE(planned_city, '') as city_name,
        COALESCE(planned_area, '') as area_name,
        COUNT(*) as count
      FROM new_club_launches
      WHERE launch_status IN ('planned', 'in_progress', 'not_picked')
      GROUP BY activity_name, city_name, area_name
    `);

    // 2. DEMAND: Existing clubs with 0 meetups from production DB
    const zeroMeetupResult = await queryProduction(`
      SELECT
        a.name as activity_name,
        ci.name as city_name,
        ar.name as area_name,
        COUNT(DISTINCT c.pk) as count
      FROM club c
      JOIN activity a ON c.activity_id = a.id
      LEFT JOIN event e ON c.pk = e.club_id
      LEFT JOIN (
        SELECT DISTINCT ON (e2.club_id)
          e2.club_id,
          l.area_id
        FROM event e2
        JOIN location l ON e2.location_id = l.id
        WHERE l.area_id IS NOT NULL
        ORDER BY e2.club_id, e2.start_time DESC
      ) latest_loc ON c.pk = latest_loc.club_id
      LEFT JOIN area ar ON latest_loc.area_id = ar.id
      LEFT JOIN city ci ON ar.city_id = ci.id
      WHERE c.status = 'ACTIVE'
        AND c.is_private = false
        AND a.name != 'Test'
      GROUP BY a.name, ci.name, ar.name
      HAVING COUNT(DISTINCT e.pk) = 0
    `);

    // 3. SUPPLY: Venue requirements grouped by status
    const supplyResult = await queryLocal(`
      SELECT
        COALESCE(activity_name, '') as activity_name,
        COALESCE(city_name, '') as city_name,
        COALESCE(area_name, '') as area_name,
        COUNT(*) FILTER (WHERE status = 'done') as done_count,
        COUNT(*) FILTER (WHERE status IN ('not_picked', 'picked', 'venue_aligned', 'leader_approval')) as in_progress_count
      FROM venue_requirements
      WHERE status != 'deprioritised'
      GROUP BY activity_name, city_name, area_name
    `);

    // Build combined map: key = activity|city|area
    const map = new Map<string, {
      activity: string;
      city: string;
      area: string;
      demand_launches: number;
      demand_zero_meetups: number;
      supply_done: number;
      supply_in_progress: number;
    }>();

    const getKey = (activity: string, city: string, area: string) =>
      `${activity || ''}|${city || ''}|${area || ''}`;

    const getOrCreate = (activity: string, city: string, area: string) => {
      const key = getKey(activity, city, area);
      if (!map.has(key)) {
        map.set(key, {
          activity: activity || 'Unknown',
          city: city || 'Unknown',
          area: area || 'Unknown',
          demand_launches: 0,
          demand_zero_meetups: 0,
          supply_done: 0,
          supply_in_progress: 0,
        });
      }
      return map.get(key)!;
    };

    // Add launch demand
    for (const row of launchesResult.rows) {
      const entry = getOrCreate(row.activity_name, row.city_name, row.area_name);
      entry.demand_launches += parseInt(row.count);
    }

    // Add zero meetup demand
    for (const row of zeroMeetupResult.rows) {
      const entry = getOrCreate(row.activity_name, row.city_name, row.area_name);
      entry.demand_zero_meetups += parseInt(row.count);
    }

    // Add supply
    for (const row of supplyResult.rows) {
      const entry = getOrCreate(row.activity_name, row.city_name, row.area_name);
      entry.supply_done += parseInt(row.done_count);
      entry.supply_in_progress += parseInt(row.in_progress_count);
    }

    // Build hierarchy: activity → city → area
    const activities = new Map<string, {
      name: string;
      demand: number;
      supply_done: number;
      supply_in_progress: number;
      gap: number;
      cities: Map<string, {
        name: string;
        demand: number;
        supply_done: number;
        supply_in_progress: number;
        gap: number;
        areas: Array<{
          name: string;
          demand: number;
          demand_launches: number;
          demand_zero_meetups: number;
          supply_done: number;
          supply_in_progress: number;
          gap: number;
        }>;
      }>;
    }>();

    for (const entry of map.values()) {
      const totalDemand = entry.demand_launches + entry.demand_zero_meetups;
      const gap = Math.max(0, totalDemand - entry.supply_done);

      if (!activities.has(entry.activity)) {
        activities.set(entry.activity, {
          name: entry.activity,
          demand: 0, supply_done: 0, supply_in_progress: 0, gap: 0,
          cities: new Map(),
        });
      }
      const actGroup = activities.get(entry.activity)!;
      actGroup.demand += totalDemand;
      actGroup.supply_done += entry.supply_done;
      actGroup.supply_in_progress += entry.supply_in_progress;
      actGroup.gap += gap;

      if (!actGroup.cities.has(entry.city)) {
        actGroup.cities.set(entry.city, {
          name: entry.city,
          demand: 0, supply_done: 0, supply_in_progress: 0, gap: 0,
          areas: [],
        });
      }
      const cityGroup = actGroup.cities.get(entry.city)!;
      cityGroup.demand += totalDemand;
      cityGroup.supply_done += entry.supply_done;
      cityGroup.supply_in_progress += entry.supply_in_progress;
      cityGroup.gap += gap;

      cityGroup.areas.push({
        name: entry.area,
        demand: totalDemand,
        demand_launches: entry.demand_launches,
        demand_zero_meetups: entry.demand_zero_meetups,
        supply_done: entry.supply_done,
        supply_in_progress: entry.supply_in_progress,
        gap,
      });
    }

    // Convert maps to arrays sorted by gap desc
    const hierarchy = Array.from(activities.values())
      .map(act => ({
        ...act,
        cities: Array.from(act.cities.values())
          .map(city => ({
            ...city,
            areas: city.areas.sort((a, b) => b.gap - a.gap),
          }))
          .sort((a, b) => b.gap - a.gap),
      }))
      .sort((a, b) => b.gap - a.gap);

    // Totals
    const totalDemand = hierarchy.reduce((s, a) => s + a.demand, 0);
    const totalDone = hierarchy.reduce((s, a) => s + a.supply_done, 0);
    const totalInProgress = hierarchy.reduce((s, a) => s + a.supply_in_progress, 0);
    const totalGap = hierarchy.reduce((s, a) => s + a.gap, 0);

    res.json({
      success: true,
      summary: { total_demand: totalDemand, supply_done: totalDone, supply_in_progress: totalInProgress, gap: totalGap },
      hierarchy,
    });
  } catch (error) {
    console.error('Error fetching supply-demand:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch supply-demand data' });
  }
});

// GET /api/requirements/venues - List venue requirements with filters
router.get('/venues', async (req: Request, res: Response) => {
  try {
    const {
      activity_id,
      city_id,
      area_id,
      club_id,
      team,
      status,
      search
    } = req.query;

    let query = `
      SELECT vr.*,
        dt.day_type as day_type_name,
        (SELECT COUNT(*) FROM requirement_comments rc
         WHERE rc.requirement_type = 'venue' AND rc.requirement_id = vr.id) as comments_count
      FROM venue_requirements vr
      LEFT JOIN dim_day_types dt ON vr.day_type_id = dt.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (activity_id) {
      query += ` AND vr.activity_id = $${paramIndex++}`;
      params.push(activity_id);
    }
    if (city_id) {
      query += ` AND vr.city_id = $${paramIndex++}`;
      params.push(city_id);
    }
    if (area_id) {
      query += ` AND vr.area_id = $${paramIndex++}`;
      params.push(area_id);
    }
    if (club_id) {
      query += ` AND vr.club_id = $${paramIndex++}`;
      params.push(club_id);
    }
    if (team) {
      query += ` AND vr.team = $${paramIndex++}`;
      params.push(team);
    }
    if (status) {
      query += ` AND vr.status = $${paramIndex++}`;
      params.push(status);
    }
    // Venue platform team filter (BAU/Supply)
    const venue_platform_team = req.query.venue_platform_team;
    if (venue_platform_team) {
      query += ` AND COALESCE(vr.venue_platform_team, 'bau') = $${paramIndex++}`;
      params.push(venue_platform_team);
    }
    if (search) {
      query += ` AND (vr.name ILIKE $${paramIndex} OR vr.description ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY vr.created_at DESC`;

    const result = await queryLocal(query, params);
    const requirements = result.rows.map((r: any) => ({
      ...r,
      type: 'venue' as const
    }));

    res.json({
      success: true,
      requirements,
      total: requirements.length
    });
  } catch (error) {
    console.error('Error fetching venue requirements:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch venue requirements' });
  }
});

// GET /api/requirements/venues/search - Search venue requirements
router.get('/venues/search', async (req: Request, res: Response) => {
  try {
    const { q, club_id, activity_id, city_id, area_id, limit = 10 } = req.query;

    let query = `
      SELECT * FROM venue_requirements
      WHERE status != 'done'
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (q) {
      query += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
      params.push(`%${q}%`);
      paramIndex++;
    }
    if (club_id) {
      query += ` AND club_id = $${paramIndex++}`;
      params.push(club_id);
    }
    if (activity_id) {
      query += ` AND activity_id = $${paramIndex++}`;
      params.push(activity_id);
    }
    if (city_id) {
      query += ` AND city_id = $${paramIndex++}`;
      params.push(city_id);
    }
    if (area_id) {
      query += ` AND area_id = $${paramIndex++}`;
      params.push(area_id);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await queryLocal(query, params);
    const requirements = result.rows.map((r: any) => ({
      ...r,
      type: 'venue' as const
    }));

    res.json({ success: true, requirements });
  } catch (error) {
    console.error('Error searching venue requirements:', error);
    res.status(500).json({ success: false, error: 'Search failed' });
  }
});

// Helper function to calculate priority level based on age and SLA
function calculatePriorityLevel(status: string, ageDays: number, slaDays: number): string {
  // Done and Deprioritised have their own buckets
  if (status === 'done') return 'done';
  if (status === 'deprioritised') return 'deprioritised';

  // Active statuses: calculate based on age
  if (ageDays > slaDays) return 'critical';      // Breached SLA
  if (ageDays >= slaDays - 1) return 'high';     // Approaching SLA (within 1 day)
  return 'normal';                                // Within SLA
}

// Priority order for sorting (lower number = higher priority)
const PRIORITY_ORDER: Record<string, number> = {
  'critical': 1,
  'high': 2,
  'normal': 3,
  'done': 4,
  'deprioritised': 5
};

// Priority display config
const PRIORITY_CONFIG: Record<string, { label: string; icon: string }> = {
  'critical': { label: 'Critical', icon: '🔴' },
  'high': { label: 'High', icon: '🟠' },
  'normal': { label: 'Normal', icon: '🟢' },
  'done': { label: 'Done', icon: '✅' },
  'deprioritised': { label: 'Deprioritised', icon: '⏸️' }
};

// GET /api/requirements/venues/hierarchy - Get hierarchy for dashboard
router.get('/venues/hierarchy', async (req: Request, res: Response) => {
  try {
    const { team, status, activity_ids, city_ids, area_ids, club_ids, teams, venue_platform_team: vpt_filter } = req.query;

    let whereClause = '1=1';
    const params: any[] = [];
    let paramIndex = 1;

    // Support multi-value filters (comma-separated strings)
    if (activity_ids) {
      const ids = String(activity_ids).split(',').map(Number).filter(n => !isNaN(n));
      if (ids.length > 0) {
        whereClause += ` AND activity_id = ANY($${paramIndex++})`;
        params.push(ids);
      }
    }
    if (city_ids) {
      const ids = String(city_ids).split(',').map(Number).filter(n => !isNaN(n));
      if (ids.length > 0) {
        whereClause += ` AND city_id = ANY($${paramIndex++})`;
        params.push(ids);
      }
    }
    if (area_ids) {
      const ids = String(area_ids).split(',').map(Number).filter(n => !isNaN(n));
      if (ids.length > 0) {
        whereClause += ` AND area_id = ANY($${paramIndex++})`;
        params.push(ids);
      }
    }
    if (club_ids) {
      const ids = String(club_ids).split(',').map(Number).filter(n => !isNaN(n));
      if (ids.length > 0) {
        whereClause += ` AND LOWER(club_name) IN (
          SELECT LOWER(club_name) FROM venue_requirements WHERE club_id = ANY($${paramIndex++})
        )`;
        params.push(ids);
      }
    }
    // Support multiple teams (comma-separated or single value)
    if (teams) {
      const teamList = String(teams).split(',').filter(t => t.trim());
      if (teamList.length > 0) {
        whereClause += ` AND team = ANY($${paramIndex++})`;
        params.push(teamList);
      }
    } else if (team) {
      whereClause += ` AND team = $${paramIndex++}`;
      params.push(team);
    }
    if (status) {
      whereClause += ` AND status = $${paramIndex++}`;
      params.push(status);
    }
    // Get hierarchy order from query params (comma-separated, e.g., "activity,city,area" or "city,activity")
    // Now supports "priority" as a hierarchy level
    const validLevels = ['activity', 'city', 'area', 'priority'];
    const hierarchyOrder = req.query.hierarchy_order
      ? String(req.query.hierarchy_order).split(',').filter(l => validLevels.includes(l))
      : ['activity', 'city', 'area'];

    const query = `
      SELECT vr.*,
        dt.day_type as day_type_name,
        (SELECT COUNT(*) FROM requirement_comments rc
         WHERE rc.requirement_type = 'venue' AND rc.requirement_id = vr.id) as comments_count,
        EXTRACT(DAY FROM (CURRENT_TIMESTAMP - vr.created_at))::integer as age_days
      FROM venue_requirements vr
      LEFT JOIN dim_day_types dt ON vr.day_type_id = dt.id
      WHERE ${whereClause.replace(/activity_id/g, 'vr.activity_id').replace(/city_id/g, 'vr.city_id').replace(/area_id/g, 'vr.area_id').replace(/club_name/g, 'vr.club_name').replace(/club_id/g, 'vr.club_id').replace(/\bteam\b/g, 'vr.team').replace(/\bstatus\b/g, 'vr.status')}
      ${vpt_filter ? `AND COALESCE(vr.venue_platform_team, 'bau') = $${paramIndex}` : ''}
      ORDER BY vr.activity_name, vr.city_name, vr.area_name, vr.name
    `;
    if (vpt_filter) {
      params.push(vpt_filter);
      paramIndex++;
    }

    const result = await queryLocal(query, params);

    // Add priority_level to each requirement (using fixed 4-day SLA)
    const DEFAULT_SLA_DAYS = 4;
    const requirements = result.rows.map((req: any) => ({
      ...req,
      priority_level: calculatePriorityLevel(req.status, req.age_days || 0, DEFAULT_SLA_DAYS)
    }));

    // Helper to get level info from requirement
    const getLevelInfo = (reqData: any, level: string) => {
      switch (level) {
        case 'activity':
          return {
            name: reqData.activity_name || 'Unknown Activity',
            id_field: 'activity_id',
            id_value: reqData.activity_id,
            sort_order: reqData.activity_name || 'zzz'
          };
        case 'city':
          return {
            name: reqData.city_name || 'Unknown City',
            id_field: 'city_id',
            id_value: reqData.city_id,
            sort_order: reqData.city_name || 'zzz'
          };
        case 'area':
          return {
            name: reqData.area_name || 'Unknown Area',
            id_field: 'area_id',
            id_value: reqData.area_id,
            sort_order: reqData.area_name || 'zzz'
          };
        case 'priority':
          const priorityLevel = reqData.priority_level || 'normal';
          const priorityConfig = PRIORITY_CONFIG[priorityLevel] || PRIORITY_CONFIG.normal;
          return {
            name: priorityConfig.label,
            id_field: 'priority_level',
            id_value: priorityLevel,
            sort_order: PRIORITY_ORDER[priorityLevel] || 3,
            icon: priorityConfig.icon
          };
        default:
          return { name: 'Unknown', id_field: '', id_value: null, sort_order: 999 };
      }
    };

    // Build dynamic hierarchy based on hierarchyOrder
    const hierarchyMap = new Map<string, any>();

    for (const reqData of requirements) {
      let currentKey = '';
      let currentMap = hierarchyMap;

      for (let i = 0; i < hierarchyOrder.length; i++) {
        const level = hierarchyOrder[i];
        const levelInfo = getLevelInfo(reqData, level);
        const levelKey = currentKey + `${level}:${levelInfo.name.toLowerCase().trim()}|`;

        if (!currentMap.has(levelKey)) {
          const isLastLevel = i === hierarchyOrder.length - 1;
          const node: any = {
            type: level,
            id: levelKey,
            name: levelInfo.name,
            activity_id: reqData.activity_id,
            city_id: reqData.city_id,
            area_id: reqData.area_id,
            count: 0,
            // Include all venue requirement statuses
            status_counts: {
              not_picked: 0,
              picked: 0,
              venue_aligned: 0,
              leader_approval: 0,
              done: 0,
              deprioritised: 0
            },
            growth_effort_count: 0,
            platform_effort_count: 0,
            // Venue platform team counts (BAU/Supply)
            bau_count: 0,
            supply_count: 0,
            // Priority tracking for this node
            max_priority_order: 999,  // Will track highest priority (lowest number)
            max_priority_level: 'normal',
            priority_icon: '🟢',
            sort_order: levelInfo.sort_order
          };

          // For priority level nodes, set their own priority info
          if (level === 'priority') {
            node.priority_level = levelInfo.id_value;
            node.priority_icon = levelInfo.icon;
          }

          if (isLastLevel) {
            node.requirements = [];
          } else {
            node.children = new Map();
          }

          currentMap.set(levelKey, node);
        }

        const node = currentMap.get(levelKey);

        node.count++;
        // Increment status count (handle all venue statuses)
        const status = reqData.status as string;
        if (node.status_counts[status] !== undefined) {
          node.status_counts[status]++;
        }
        if (reqData.growth_team_effort) node.growth_effort_count++;
        if (reqData.platform_team_effort) node.platform_effort_count++;
        // Track BAU/Supply counts
        const vpt = reqData.venue_platform_team || 'bau';
        if (vpt === 'supply') node.supply_count++;
        else node.bau_count++;

        // Track the highest priority (lowest order number) requirement in this node
        const reqPriorityOrder = PRIORITY_ORDER[reqData.priority_level] || 3;
        if (reqPriorityOrder < node.max_priority_order) {
          node.max_priority_order = reqPriorityOrder;
          node.max_priority_level = reqData.priority_level;
          node.priority_icon = PRIORITY_CONFIG[reqData.priority_level]?.icon || '🟢';
        }

        if (i === hierarchyOrder.length - 1) {
          node.requirements.push({ ...reqData, type: 'venue' });
        } else {
          currentKey = levelKey;
          currentMap = node.children;
        }
      }
    }

    // Sort function for hierarchy nodes
    const sortNodes = (nodes: any[]): any[] => {
      return nodes.sort((a, b) => {
        // First sort by priority (if tracking priority)
        if (a.max_priority_order !== b.max_priority_order) {
          return a.max_priority_order - b.max_priority_order;
        }
        // Then by sort_order (alphabetical for non-priority levels)
        if (typeof a.sort_order === 'number' && typeof b.sort_order === 'number') {
          return a.sort_order - b.sort_order;
        }
        if (typeof a.sort_order === 'string' && typeof b.sort_order === 'string') {
          return a.sort_order.localeCompare(b.sort_order);
        }
        return 0;
      });
    };

    // Sort requirements within nodes by age (oldest first)
    const sortRequirements = (reqs: any[]): any[] => {
      return reqs.sort((a, b) => (b.age_days || 0) - (a.age_days || 0));
    };

    const convertMapToArray = (node: any): any => {
      if (node.children instanceof Map) {
        node.children = sortNodes(Array.from(node.children.values()).map(convertMapToArray));
      }
      if (node.requirements) {
        node.requirements = sortRequirements(node.requirements);
      }
      return node;
    };

    const hierarchy = sortNodes(Array.from(hierarchyMap.values()).map(convertMapToArray));

    // Calculate TAT statistics for completed venues
    const completedRequirements = requirements.filter((r: any) =>
      r.status === 'done' && r.created_at && r.completed_at
    );

    let tatStats = {
      average_tat: 0,
      total_completed: completedRequirements.length,
      within_sla_percent: 0,
      day_distribution: [] as { day: number; count: number; percent: number }[]
    };

    if (completedRequirements.length > 0) {
      // Calculate TAT for each completed requirement
      const tatValues = completedRequirements.map((r: any) => {
        const created = new Date(r.created_at);
        const completed = new Date(r.completed_at);
        const diffMs = completed.getTime() - created.getTime();
        return Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24))); // At least 1 day
      });

      // Average TAT
      tatStats.average_tat = Math.round((tatValues.reduce((a, b) => a + b, 0) / tatValues.length) * 10) / 10;

      // Within SLA count (using fixed 4-day SLA)
      const withinSla = tatValues.filter(tat => tat <= DEFAULT_SLA_DAYS).length;
      tatStats.within_sla_percent = Math.round((withinSla / tatValues.length) * 100);

      // Day-wise distribution (group by day buckets)
      const maxDay = Math.max(...tatValues, DEFAULT_SLA_DAYS + 1);
      const dayBuckets: Record<number, number> = {};

      tatValues.forEach(tat => {
        const bucket = tat > DEFAULT_SLA_DAYS ? DEFAULT_SLA_DAYS + 1 : tat; // Group all > SLA into one bucket
        dayBuckets[bucket] = (dayBuckets[bucket] || 0) + 1;
      });

      // Create distribution array
      for (let day = 1; day <= DEFAULT_SLA_DAYS + 1; day++) {
        const count = dayBuckets[day] || 0;
        tatStats.day_distribution.push({
          day: day > DEFAULT_SLA_DAYS ? -1 : day, // -1 indicates "> SLA days" bucket
          count,
          percent: Math.round((count / tatValues.length) * 100)
        });
      }
    }

    const summary = {
      total: requirements.length,
      not_picked: requirements.filter((r: any) => r.status === 'not_picked').length,
      picked: requirements.filter((r: any) => r.status === 'picked').length,
      venue_aligned: requirements.filter((r: any) => r.status === 'venue_aligned').length,
      leader_approval: requirements.filter((r: any) => r.status === 'leader_approval').length,
      done: requirements.filter((r: any) => r.status === 'done').length,
      deprioritised: requirements.filter((r: any) => r.status === 'deprioritised').length,
      // Venue platform team counts
      bau_count: requirements.filter((r: any) => (r.venue_platform_team || 'bau') === 'bau').length,
      supply_count: requirements.filter((r: any) => r.venue_platform_team === 'supply').length,
      // TAT statistics
      tat_stats: tatStats
    };

    res.json({ success: true, hierarchy, summary });
  } catch (error) {
    console.error('Error fetching venue requirements hierarchy:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch hierarchy' });
  }
});

// GET /api/requirements/venues/filter-options - Get distinct filter options
// NOTE: This route MUST be before /:id to avoid matching
router.get('/venues/filter-options', async (req: Request, res: Response) => {
  try {
    // Use DISTINCT ON to get unique names (picking first id for each name)
    const [activities, cities, areas, clubs] = await Promise.all([
      queryLocal(`
        SELECT DISTINCT ON (LOWER(activity_name)) activity_id as id, activity_name as name
        FROM venue_requirements
        WHERE activity_id IS NOT NULL AND activity_name IS NOT NULL
        ORDER BY LOWER(activity_name), activity_id
      `),
      queryLocal(`
        SELECT DISTINCT ON (LOWER(city_name)) city_id as id, city_name as name
        FROM venue_requirements
        WHERE city_id IS NOT NULL AND city_name IS NOT NULL
        ORDER BY LOWER(city_name), city_id
      `),
      queryLocal(`
        SELECT DISTINCT ON (LOWER(area_name)) area_id as id, area_name as name, city_id
        FROM venue_requirements
        WHERE area_id IS NOT NULL AND area_name IS NOT NULL
        ORDER BY LOWER(area_name), area_id
      `),
      queryLocal(`
        SELECT DISTINCT ON (LOWER(club_name)) club_id as id, club_name as name
        FROM venue_requirements
        WHERE club_id IS NOT NULL AND club_name IS NOT NULL
        ORDER BY LOWER(club_name), club_id
      `)
    ]);

    res.json({
      success: true,
      options: {
        activities: activities.rows,
        cities: cities.rows,
        areas: areas.rows,
        clubs: clubs.rows
      }
    });
  } catch (error) {
    console.error('Error fetching venue filter options:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch filter options' });
  }
});

// GET /api/requirements/venues/areas-by-city/:cityId - Get areas for a specific city
// NOTE: This route MUST be before /:id to avoid matching
router.get('/venues/areas-by-city/:cityId', async (req: Request, res: Response) => {
  try {
    const { cityId } = req.params;
    const result = await queryLocal(`
      SELECT DISTINCT area_id as id, area_name as name
      FROM venue_requirements
      WHERE city_id = $1 AND area_id IS NOT NULL AND area_name IS NOT NULL
      ORDER BY area_name
    `, [cityId]);

    res.json({
      success: true,
      options: result.rows
    });
  } catch (error) {
    console.error('Error fetching areas by city:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch areas' });
  }
});

// GET /api/requirements/venues/:id - Get single venue requirement
router.get('/venues/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await queryLocal(
      `SELECT vr.*, dt.day_type as day_type_name
       FROM venue_requirements vr
       LEFT JOIN dim_day_types dt ON vr.day_type_id = dt.id
       WHERE vr.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Requirement not found' });
    }

    res.json({
      success: true,
      requirement: { ...result.rows[0], type: 'venue' }
    });
  } catch (error) {
    console.error('Error fetching venue requirement:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch requirement' });
  }
});

// POST /api/requirements/venues - Create venue requirement
router.post('/venues', async (req: Request, res: Response) => {
  try {
    const data: CreateRequirementRequest = req.body;

    // Validate required scheduling fields for NEW requirements
    if (!data.day_type_id) {
      return res.status(400).json({
        success: false,
        error: 'day_type_id is required for new venue requirements'
      });
    }
    if (!data.time_of_day || data.time_of_day.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'time_of_day is required for new venue requirements (select at least one time slot)'
      });
    }

    // Validate time_of_day values
    const validTimeSlots = ['early_morning', 'morning', 'afternoon', 'evening', 'night', 'all_nighter'];
    const invalidSlots = (data.time_of_day || []).filter(slot => !validTimeSlots.includes(slot));
    if (invalidSlots.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Invalid time_of_day values: ${invalidSlots.join(', ')}. Valid options: ${validTimeSlots.join(', ')}`
      });
    }

    let team = data.team;
    if (!team && data.activity_name && data.city_name) {
      team = getTeamForClub(data.activity_name, data.city_name);
    }

    const result = await queryLocal(
      `INSERT INTO venue_requirements (
        name, description,
        activity_id, activity_name,
        city_id, city_name,
        area_id, area_name,
        club_id, club_name,
        growth_team_effort, platform_team_effort,
        day_type_id, time_of_day, amenities_required,
        capacity, comments, team, created_by,
        venue_categories, amenities_list,
        venue_platform_team
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
      RETURNING *`,
      [
        data.name,
        data.description || null,
        data.activity_id || null,
        data.activity_name || null,
        data.city_id || null,
        data.city_name || null,
        data.area_id || null,
        data.area_name || null,
        data.club_id || null,
        data.club_name || null,
        data.growth_team_effort || false,
        data.platform_team_effort || false,
        data.day_type_id,
        data.time_of_day || null,
        data.amenities_required || null,
        data.capacity || null,
        data.comments || null,
        team || null,
        'system',
        data.venue_categories || null,
        data.amenities_list || null,
        data.venue_platform_team || 'bau'
      ]
    );

    // Fetch day_type_name for response
    let day_type_name = null;
    if (data.day_type_id) {
      const dayTypeResult = await queryLocal(
        'SELECT day_type FROM dim_day_types WHERE id = $1',
        [data.day_type_id]
      );
      if (dayTypeResult.rows.length > 0) {
        day_type_name = dayTypeResult.rows[0].day_type;
      }
    }

    res.status(201).json({
      success: true,
      requirement: { ...result.rows[0], type: 'venue', day_type_name }
    });
  } catch (error) {
    console.error('Error creating venue requirement:', error);
    res.status(500).json({ success: false, error: 'Failed to create requirement' });
  }
});

// PUT /api/requirements/venues/:id - Update venue requirement
router.put('/venues/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data: UpdateRequirementRequest = req.body;

    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      params.push(data.name);
    }
    if (data.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      params.push(data.description);
    }
    // Hierarchy fields
    if (data.activity_id !== undefined) {
      updates.push(`activity_id = $${paramIndex++}`);
      params.push(data.activity_id);
    }
    if (data.activity_name !== undefined) {
      updates.push(`activity_name = $${paramIndex++}`);
      params.push(data.activity_name);
    }
    if (data.city_id !== undefined) {
      updates.push(`city_id = $${paramIndex++}`);
      params.push(data.city_id);
    }
    if (data.city_name !== undefined) {
      updates.push(`city_name = $${paramIndex++}`);
      params.push(data.city_name);
    }
    if (data.area_id !== undefined) {
      updates.push(`area_id = $${paramIndex++}`);
      params.push(data.area_id);
    }
    if (data.area_name !== undefined) {
      updates.push(`area_name = $${paramIndex++}`);
      params.push(data.area_name);
    }
    if (data.club_id !== undefined) {
      updates.push(`club_id = $${paramIndex++}`);
      params.push(data.club_id);
    }
    if (data.club_name !== undefined) {
      updates.push(`club_name = $${paramIndex++}`);
      params.push(data.club_name);
    }
    if (data.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      params.push(data.status);
      // Auto-set completed_at when status changes to 'done', clear it otherwise
      if (data.status === 'done') {
        updates.push(`completed_at = CURRENT_TIMESTAMP`);
      } else {
        updates.push(`completed_at = NULL`);
      }
    }
    if (data.growth_team_effort !== undefined) {
      updates.push(`growth_team_effort = $${paramIndex++}`);
      params.push(data.growth_team_effort);
    }
    if (data.platform_team_effort !== undefined) {
      updates.push(`platform_team_effort = $${paramIndex++}`);
      params.push(data.platform_team_effort);
    }
    if (data.comments !== undefined) {
      updates.push(`comments = $${paramIndex++}`);
      params.push(data.comments);
    }
    // New scheduling fields (allow NULL for legacy requirements)
    if (data.day_type_id !== undefined) {
      updates.push(`day_type_id = $${paramIndex++}`);
      params.push(data.day_type_id);
    }
    if (data.time_of_day !== undefined) {
      // Validate time_of_day values if provided
      if (data.time_of_day && data.time_of_day.length > 0) {
        const validTimeSlots = ['early_morning', 'morning', 'afternoon', 'evening', 'night', 'all_nighter'];
        const invalidSlots = data.time_of_day.filter(slot => !validTimeSlots.includes(slot));
        if (invalidSlots.length > 0) {
          return res.status(400).json({
            success: false,
            error: `Invalid time_of_day values: ${invalidSlots.join(', ')}. Valid options: ${validTimeSlots.join(', ')}`
          });
        }
      }
      updates.push(`time_of_day = $${paramIndex++}`);
      params.push(data.time_of_day);
    }
    if (data.amenities_required !== undefined) {
      updates.push(`amenities_required = $${paramIndex++}`);
      params.push(data.amenities_required);
    }
    if (data.capacity !== undefined) {
      updates.push(`capacity = $${paramIndex++}`);
      params.push(data.capacity);
    }
    // Venue completion fields (captured when marking as done)
    if (data.venue_name !== undefined) {
      updates.push(`venue_name = $${paramIndex++}`);
      params.push(data.venue_name);
    }
    if (data.venue_city !== undefined) {
      updates.push(`venue_city = $${paramIndex++}`);
      params.push(data.venue_city);
    }
    if (data.venue_area !== undefined) {
      updates.push(`venue_area = $${paramIndex++}`);
      params.push(data.venue_area);
    }
    if ((data as any).venue_categories !== undefined) {
      updates.push(`venue_categories = $${paramIndex++}`);
      params.push((data as any).venue_categories);
    }
    if ((data as any).amenities_list !== undefined) {
      updates.push(`amenities_list = $${paramIndex++}`);
      params.push((data as any).amenities_list);
    }
    if ((data as any).venue_platform_team !== undefined) {
      updates.push(`venue_platform_team = $${paramIndex++}`);
      params.push((data as any).venue_platform_team);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);

    if (updates.length === 1) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    params.push(id);
    const result = await queryLocal(
      `UPDATE venue_requirements SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Requirement not found' });
    }

    // Fetch day_type_name for response
    let day_type_name = null;
    const req_row = result.rows[0];
    if (req_row.day_type_id) {
      const dayTypeResult = await queryLocal(
        'SELECT day_type FROM dim_day_types WHERE id = $1',
        [req_row.day_type_id]
      );
      if (dayTypeResult.rows.length > 0) {
        day_type_name = dayTypeResult.rows[0].day_type;
      }
    }

    res.json({
      success: true,
      requirement: { ...req_row, type: 'venue', day_type_name }
    });
  } catch (error) {
    console.error('Error updating venue requirement:', error);
    res.status(500).json({ success: false, error: 'Failed to update requirement' });
  }
});

// POST /api/requirements/venues/:id/escalate - Escalate between BAU and Supply teams
router.post('/venues/:id/escalate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { target_team, escalated_by } = req.body;

    if (!target_team || !['bau', 'supply'].includes(target_team)) {
      return res.status(400).json({
        success: false,
        error: 'target_team must be "bau" or "supply"'
      });
    }

    const result = await queryLocal(
      `UPDATE venue_requirements
       SET venue_platform_team = $1, escalated_at = CURRENT_TIMESTAMP, escalated_by = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [target_team, escalated_by || 'system', id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Requirement not found' });
    }

    res.json({
      success: true,
      requirement: { ...result.rows[0], type: 'venue' }
    });
  } catch (error) {
    console.error('Error escalating venue requirement:', error);
    res.status(500).json({ success: false, error: 'Failed to escalate requirement' });
  }
});

// DELETE /api/requirements/venues/:id - Delete venue requirement
router.delete('/venues/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await queryLocal(
      'DELETE FROM venue_requirements WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Requirement not found' });
    }

    res.json({ success: true, deleted_id: id });
  } catch (error) {
    console.error('Error deleting venue requirement:', error);
    res.status(500).json({ success: false, error: 'Failed to delete requirement' });
  }
});

// =====================================================
// CLUBS AND LAUNCHES ENDPOINT
// =====================================================

// GET /api/requirements/clubs-and-launches - Get clubs and launches for requirement linking
router.get('/clubs-and-launches', async (req: Request, res: Response) => {
  try {
    const { activity_id, city_id, area_id, search } = req.query;

    // First, resolve names from IDs for launch filtering
    let activityName: string | null = null;
    let cityName: string | null = null;
    let areaName: string | null = null;

    if (activity_id) {
      const activityResult = await queryProduction('SELECT name FROM activity WHERE id = $1', [activity_id]);
      if (activityResult.rows.length > 0) activityName = activityResult.rows[0].name;
    }
    if (city_id) {
      const cityResult = await queryProduction('SELECT name FROM city WHERE id = $1', [city_id]);
      if (cityResult.rows.length > 0) cityName = cityResult.rows[0].name;
    }
    if (area_id) {
      const areaResult = await queryProduction('SELECT name FROM area WHERE id = $1', [area_id]);
      if (areaResult.rows.length > 0) areaName = areaResult.rows[0].name;
    }

    // Build club query from production database
    // Use events to determine club location (clubs don't have direct location_id)
    // Note: location has area_id, city comes through area.city_id
    // Strategy: Get most recent location per club, but also include historical locations
    // for filtering purposes (a club that hosted in an area before should still appear)
    let clubQuery = `
      WITH club_locations AS (
        -- Most recent location per club (priority 1)
        SELECT DISTINCT ON (e.club_id)
          e.club_id,
          ci.id as city_id,
          ci.name as city_name,
          ar.id as area_id,
          ar.name as area_name,
          1 as priority
        FROM event e
        JOIN location l ON e.location_id = l.id
        LEFT JOIN area ar ON l.area_id = ar.id
        LEFT JOIN city ci ON ar.city_id = ci.id
        WHERE e.state = 'CREATED'
        ORDER BY e.club_id, e.created_at DESC
      ),
      club_all_locations AS (
        -- All unique city/area combinations per club (for filtering)
        SELECT DISTINCT
          e.club_id,
          ci.id as city_id,
          ar.id as area_id
        FROM event e
        JOIN location l ON e.location_id = l.id
        LEFT JOIN area ar ON l.area_id = ar.id
        LEFT JOIN city ci ON ar.city_id = ci.id
        WHERE e.state = 'CREATED'
      )
      SELECT DISTINCT
        c.pk as id,
        c.name,
        'club' as type,
        a.id as activity_id,
        a.name as activity_name,
        cl.city_id,
        cl.city_name,
        cl.area_id,
        cl.area_name
      FROM club c
      JOIN activity a ON c.activity_id = a.id
      LEFT JOIN club_locations cl ON c.pk = cl.club_id
      LEFT JOIN club_all_locations cal ON c.pk = cal.club_id
      WHERE c.status = 'ACTIVE'
    `;
    const clubParams: any[] = [];
    let clubParamIndex = 1;

    if (activity_id) {
      clubQuery += ` AND a.id = $${clubParamIndex++}`;
      clubParams.push(activity_id);
    }
    if (city_id) {
      // Check if club has EVER hosted in this city (using club_all_locations for filtering)
      clubQuery += ` AND cal.city_id = $${clubParamIndex++}`;
      clubParams.push(city_id);
    }
    if (area_id) {
      // Check if club has EVER hosted in this area (using club_all_locations for filtering)
      clubQuery += ` AND cal.area_id = $${clubParamIndex++}`;
      clubParams.push(area_id);
    }
    if (search) {
      clubQuery += ` AND c.name ILIKE $${clubParamIndex++}`;
      clubParams.push(`%${search}%`);
    }

    clubQuery += ` ORDER BY c.name LIMIT 50`;

    // Build launch query from local database
    // Note: new_club_launches stores activity_name, planned_city, planned_area as strings
    let launchQuery = `
      SELECT
        id,
        COALESCE(planned_club_name, activity_name || ' Launch') as name,
        'launch' as type,
        activity_name,
        planned_city as city_name,
        planned_area as area_name
      FROM new_club_launches
      WHERE launch_status IN ('planned', 'in_progress')
    `;
    const launchParams: any[] = [];
    let launchParamIndex = 1;

    if (activityName) {
      launchQuery += ` AND LOWER(activity_name) = LOWER($${launchParamIndex++})`;
      launchParams.push(activityName);
    }
    if (cityName) {
      launchQuery += ` AND LOWER(planned_city) = LOWER($${launchParamIndex++})`;
      launchParams.push(cityName);
    }
    if (areaName) {
      launchQuery += ` AND LOWER(planned_area) = LOWER($${launchParamIndex++})`;
      launchParams.push(areaName);
    }
    if (search) {
      launchQuery += ` AND (planned_club_name ILIKE $${launchParamIndex} OR activity_name ILIKE $${launchParamIndex})`;
      launchParams.push(`%${search}%`);
      launchParamIndex++;
    }

    launchQuery += ` ORDER BY activity_name LIMIT 20`;

    // Build expansion targets query
    // Since activity_id in club_dimensional_targets is often NULL,
    // we need to filter by club's activity from production
    let activityClubIds: number[] = [];
    if (activity_id) {
      const activityClubsResult = await queryProduction(
        `SELECT pk FROM club WHERE activity_id = $1 AND status = 'ACTIVE'`,
        [activity_id]
      ).catch(() => ({ rows: [] }));
      activityClubIds = activityClubsResult.rows.map((r: any) => r.pk);
    }

    let expansionQuery = `
      SELECT
        cdt.id as target_id,
        cdt.club_id,
        cdt.club_name,
        cdt.activity_id,
        da.area_name,
        cdt.target_meetups,
        'expansion' as type,
        COALESCE(cdt.club_name, 'Expansion Target') || ' - ' || da.area_name as name
      FROM club_dimensional_targets cdt
      JOIN dim_areas da ON cdt.area_id = da.id
      WHERE 1=1
    `;
    const expansionParams: any[] = [];
    let expansionParamIndex = 1;

    // Filter by area
    if (area_id) {
      expansionQuery += ` AND da.production_area_id = $${expansionParamIndex++}`;
      expansionParams.push(area_id);
    }

    // Filter by club_ids that belong to the selected activity
    if (activityClubIds.length > 0) {
      expansionQuery += ` AND cdt.club_id = ANY($${expansionParamIndex++})`;
      expansionParams.push(activityClubIds);
    } else if (activity_id) {
      // Activity selected but no clubs found - return empty
      expansionQuery += ` AND FALSE`;
    }

    expansionQuery += ` ORDER BY cdt.club_name LIMIT 20`;

    // Execute queries independently - don't let one failure block others
    let clubs: any[] = [];
    let launches: any[] = [];
    let expansionTargets: any[] = [];

    // Run queries in parallel but catch errors individually
    const [clubResult, launchResult, expansionResult] = await Promise.all([
      queryProduction(clubQuery, clubParams).catch(err => {
        console.error('Club query failed:', err.message);
        return { rows: [] };
      }),
      queryLocal(launchQuery, launchParams).catch(err => {
        console.error('Launch query failed:', err.message);
        return { rows: [] };
      }),
      queryLocal(expansionQuery, expansionParams).catch(err => {
        console.error('Expansion query failed:', err.message);
        return { rows: [] };
      })
    ]);

    clubs = clubResult.rows;
    launches = launchResult.rows;
    expansionTargets = expansionResult.rows;

    // Enrich expansion targets with club names from production
    if (expansionTargets.length > 0) {
      const clubIdsToEnrich = [...new Set(expansionTargets.map((t: any) => parseInt(t.club_id)).filter(Boolean))];
      if (clubIdsToEnrich.length > 0) {
        const clubNamesResult = await queryProduction(
          `SELECT pk, name FROM club WHERE pk = ANY($1)`,
          [clubIdsToEnrich]
        ).catch(() => ({ rows: [] }));
        const clubNameMap = new Map(clubNamesResult.rows.map((c: any) => [parseInt(c.pk), c.name]));

        expansionTargets = expansionTargets.map((t: any) => {
          const clubName = clubNameMap.get(parseInt(t.club_id)) || t.club_name;
          return {
            ...t,
            club_name: clubName,
            name: clubName ? `${clubName} - ${t.area_name}` : t.name
          };
        });
      }
    }

    res.json({
      success: true,
      clubs,
      launches,
      expansionTargets,
      total: clubs.length + launches.length + expansionTargets.length
    });
  } catch (error) {
    console.error('Error fetching clubs and launches:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch clubs and launches' });
  }
});

// =====================================================
// BULK OPERATIONS
// =====================================================

// POST /api/requirements/bulk-complete - Mark multiple requirements as done
router.post('/bulk-complete', async (req: Request, res: Response) => {
  try {
    const { leader_ids, venue_ids } = req.body;

    const results = {
      leaders_updated: 0,
      venues_updated: 0
    };

    if (leader_ids && leader_ids.length > 0) {
      const result = await queryLocal(
        `UPDATE leader_requirements
         SET status = 'done', updated_at = CURRENT_TIMESTAMP, completed_at = CURRENT_TIMESTAMP
         WHERE id = ANY($1)`,
        [leader_ids]
      );
      results.leaders_updated = result.rowCount || 0;
    }

    if (venue_ids && venue_ids.length > 0) {
      const result = await queryLocal(
        `UPDATE venue_requirements
         SET status = 'done', updated_at = CURRENT_TIMESTAMP, completed_at = CURRENT_TIMESTAMP
         WHERE id = ANY($1)`,
        [venue_ids]
      );
      results.venues_updated = result.rowCount || 0;
    }

    res.json({ success: true, ...results });
  } catch (error) {
    console.error('Error bulk completing requirements:', error);
    res.status(500).json({ success: false, error: 'Bulk complete failed' });
  }
});

// =====================================================
// REQUIREMENT COMMENTS
// =====================================================

// GET /api/requirements/:type/:id/comments - Get comments for a requirement
router.get('/:type/:id/comments', async (req: Request, res: Response) => {
  try {
    const { type, id } = req.params;

    // Validate type
    const requirementType = type === 'leaders' ? 'leader' : type === 'venues' ? 'venue' : null;
    if (!requirementType) {
      return res.status(400).json({ success: false, error: 'Invalid requirement type. Use "leaders" or "venues".' });
    }

    const requirementId = parseInt(id);
    if (isNaN(requirementId)) {
      return res.status(400).json({ success: false, error: 'Invalid requirement ID' });
    }

    const result = await queryLocal(`
      SELECT * FROM requirement_comments
      WHERE requirement_type = $1 AND requirement_id = $2
      ORDER BY created_at DESC
    `, [requirementType, requirementId]);

    res.json({
      success: true,
      comments: result.rows
    });
  } catch (error) {
    console.error('Error fetching requirement comments:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch comments' });
  }
});

// POST /api/requirements/:type/:id/comments - Add comment to a requirement
router.post('/:type/:id/comments', async (req: Request, res: Response) => {
  try {
    const { type, id } = req.params;
    const { comment_text, author_name } = req.body;

    // Validate type
    const requirementType = type === 'leaders' ? 'leader' : type === 'venues' ? 'venue' : null;
    if (!requirementType) {
      return res.status(400).json({ success: false, error: 'Invalid requirement type. Use "leaders" or "venues".' });
    }

    const requirementId = parseInt(id);
    if (isNaN(requirementId)) {
      return res.status(400).json({ success: false, error: 'Invalid requirement ID' });
    }

    if (!comment_text || !comment_text.trim()) {
      return res.status(400).json({ success: false, error: 'Comment text is required' });
    }

    const result = await queryLocal(`
      INSERT INTO requirement_comments (requirement_id, requirement_type, comment_text, author_name)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [requirementId, requirementType, comment_text.trim(), author_name || 'Anonymous']);

    res.json({
      success: true,
      comment: result.rows[0]
    });
  } catch (error) {
    console.error('Error adding requirement comment:', error);
    res.status(500).json({ success: false, error: 'Failed to add comment' });
  }
});

export default router;
