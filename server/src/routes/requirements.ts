import { Router, Request, Response } from 'express';
import { queryLocal } from '../services/database';
import { getTeamForClub } from '../../../shared/teamConfig';
import {
  LeaderRequirement,
  VenueRequirement,
  CreateRequirementRequest,
  UpdateRequirementRequest,
  RequirementStatus
} from '../../../shared/types';

const router = Router();

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
      SELECT * FROM leader_requirements
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

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
    if (club_id) {
      query += ` AND club_id = $${paramIndex++}`;
      params.push(club_id);
    }
    if (launch_id) {
      query += ` AND launch_id = $${paramIndex++}`;
      params.push(launch_id);
    }
    if (team) {
      query += ` AND team = $${paramIndex++}`;
      params.push(team);
    }
    if (status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }
    if (search) {
      query += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC`;

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

    res.json({
      success: true,
      requirements,
      total: requirements.length
    });
  } catch (error) {
    console.error('Error fetching leader requirements:', error);
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
      SELECT * FROM leader_requirements
      WHERE ${whereClause}
      ORDER BY activity_name, city_name, area_name, name
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

    res.json({ success: true, hierarchy, summary });
  } catch (error) {
    console.error('Error fetching leader requirements hierarchy:', error);
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
    console.error('Error fetching leader filter options:', error);
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

    res.json({
      success: true,
      requirement: { ...result.rows[0], type: 'leader' }
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
      SELECT * FROM venue_requirements
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

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
    if (club_id) {
      query += ` AND club_id = $${paramIndex++}`;
      params.push(club_id);
    }
    if (team) {
      query += ` AND team = $${paramIndex++}`;
      params.push(team);
    }
    if (status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }
    if (search) {
      query += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC`;

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

// GET /api/requirements/venues/hierarchy - Get hierarchy for dashboard
router.get('/venues/hierarchy', async (req: Request, res: Response) => {
  try {
    const { team, status, activity_ids, city_ids, area_ids, club_ids, teams } = req.query;

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
    const hierarchyOrder = req.query.hierarchy_order
      ? String(req.query.hierarchy_order).split(',').filter(l => ['activity', 'city', 'area'].includes(l))
      : ['activity', 'city', 'area'];

    const query = `
      SELECT * FROM venue_requirements
      WHERE ${whereClause}
      ORDER BY activity_name, city_name, area_name, name
    `;

    const result = await queryLocal(query, params);
    const requirements = result.rows;

    // Helper to get level info from requirement
    const getLevelInfo = (reqData: any, level: string) => {
      switch (level) {
        case 'activity':
          return {
            name: reqData.activity_name || 'Unknown Activity',
            id_field: 'activity_id',
            id_value: reqData.activity_id
          };
        case 'city':
          return {
            name: reqData.city_name || 'Unknown City',
            id_field: 'city_id',
            id_value: reqData.city_id
          };
        case 'area':
          return {
            name: reqData.area_name || 'Unknown Area',
            id_field: 'area_id',
            id_value: reqData.area_id
          };
        default:
          return { name: 'Unknown', id_field: '', id_value: null };
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
            status_counts: { not_picked: 0, deprioritised: 0, in_progress: 0, done: 0 },
            growth_effort_count: 0,
            platform_effort_count: 0
          };

          if (isLastLevel) {
            node.requirements = [];
          } else {
            node.children = new Map();
          }

          currentMap.set(levelKey, node);
        }

        const node = currentMap.get(levelKey);

        node.count++;
        node.status_counts[reqData.status as RequirementStatus]++;
        if (reqData.growth_team_effort) node.growth_effort_count++;
        if (reqData.platform_team_effort) node.platform_effort_count++;

        if (i === hierarchyOrder.length - 1) {
          node.requirements.push({ ...reqData, type: 'venue' });
        } else {
          currentKey = levelKey;
          currentMap = node.children;
        }
      }
    }

    const convertMapToArray = (node: any): any => {
      if (node.children instanceof Map) {
        node.children = Array.from(node.children.values()).map(convertMapToArray);
      }
      return node;
    };

    const hierarchy = Array.from(hierarchyMap.values()).map(convertMapToArray);

    const summary = {
      total: requirements.length,
      not_picked: requirements.filter((r: any) => r.status === 'not_picked').length,
      deprioritised: requirements.filter((r: any) => r.status === 'deprioritised').length,
      in_progress: requirements.filter((r: any) => r.status === 'in_progress').length,
      done: requirements.filter((r: any) => r.status === 'done').length
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
        SELECT DISTINCT ON (LOWER(area_name)) area_id as id, area_name as name
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

// GET /api/requirements/venues/:id - Get single venue requirement
router.get('/venues/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await queryLocal(
      'SELECT * FROM venue_requirements WHERE id = $1',
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
        comments, team, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
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
        data.comments || null,
        team || null,
        'system'
      ]
    );

    res.status(201).json({
      success: true,
      requirement: { ...result.rows[0], type: 'venue' }
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
    if (data.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      params.push(data.status);
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

    res.json({
      success: true,
      requirement: { ...result.rows[0], type: 'venue' }
    });
  } catch (error) {
    console.error('Error updating venue requirement:', error);
    res.status(500).json({ success: false, error: 'Failed to update requirement' });
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

    // Import queryProduction for reading from production DB
    const { queryProduction } = await import('../services/database');

    // Build club query from production database
    let clubQuery = `
      SELECT
        c.pk as id,
        c.name,
        'club' as type,
        a.pk as activity_id,
        a.name as activity_name,
        ci.pk as city_id,
        ci.name as city_name,
        ar.pk as area_id,
        ar.name as area_name
      FROM club c
      JOIN activity a ON c.activity_id = a.pk
      JOIN location l ON c.location_id = l.pk
      JOIN city ci ON l.city_id = ci.pk
      LEFT JOIN area ar ON l.area_id = ar.pk
      WHERE c.status = 'ACTIVE'
    `;
    const clubParams: any[] = [];
    let clubParamIndex = 1;

    if (activity_id) {
      clubQuery += ` AND a.pk = $${clubParamIndex++}`;
      clubParams.push(activity_id);
    }
    if (city_id) {
      clubQuery += ` AND ci.pk = $${clubParamIndex++}`;
      clubParams.push(city_id);
    }
    if (area_id) {
      clubQuery += ` AND ar.pk = $${clubParamIndex++}`;
      clubParams.push(area_id);
    }
    if (search) {
      clubQuery += ` AND c.name ILIKE $${clubParamIndex++}`;
      clubParams.push(`%${search}%`);
    }

    clubQuery += ` ORDER BY c.name LIMIT 50`;

    // Build launch query from local database
    let launchQuery = `
      SELECT
        id,
        COALESCE(planned_club_name, activity_name || ' Launch') as name,
        'launch' as type,
        activity_id,
        activity_name,
        city_id,
        city_name,
        area_id,
        area_name
      FROM new_club_launches
      WHERE launch_status IN ('planned', 'in_progress')
    `;
    const launchParams: any[] = [];
    let launchParamIndex = 1;

    if (activity_id) {
      launchQuery += ` AND activity_id = $${launchParamIndex++}`;
      launchParams.push(activity_id);
    }
    if (city_id) {
      launchQuery += ` AND city_id = $${launchParamIndex++}`;
      launchParams.push(city_id);
    }
    if (area_id) {
      launchQuery += ` AND area_id = $${launchParamIndex++}`;
      launchParams.push(area_id);
    }
    if (search) {
      launchQuery += ` AND (planned_club_name ILIKE $${launchParamIndex} OR activity_name ILIKE $${launchParamIndex})`;
      launchParams.push(`%${search}%`);
      launchParamIndex++;
    }

    launchQuery += ` ORDER BY activity_name LIMIT 20`;

    // Execute both queries in parallel
    const [clubResult, launchResult] = await Promise.all([
      queryProduction(clubQuery, clubParams),
      queryLocal(launchQuery, launchParams)
    ]);

    // Combine and return
    const clubs = clubResult.rows;
    const launches = launchResult.rows;

    res.json({
      success: true,
      clubs,
      launches,
      total: clubs.length + launches.length
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
         SET status = 'done', updated_at = CURRENT_TIMESTAMP
         WHERE id = ANY($1)`,
        [leader_ids]
      );
      results.leaders_updated = result.rowCount || 0;
    }

    if (venue_ids && venue_ids.length > 0) {
      const result = await queryLocal(
        `UPDATE venue_requirements
         SET status = 'done', updated_at = CURRENT_TIMESTAMP
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

export default router;
