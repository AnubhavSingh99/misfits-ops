import { Router } from 'express';
import { logger } from '../utils/logger';
import { queryLocal, queryProduction } from '../services/database';

const router = Router();

// =====================================================
// TEAM LEAD COLOR MAPPING
// =====================================================

const TEAM_LEAD_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  'Shashwat': { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800' },
  'Saurabh': { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800' },
  'CD': { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-800' },
  'default': { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-800' }
};

function getTeamColor(teamLead: string | null): { bg: string; border: string; text: string } {
  if (!teamLead) return TEAM_LEAD_COLORS['default'];
  const lead = teamLead.toLowerCase();
  if (lead.includes('shashwat')) return TEAM_LEAD_COLORS['Shashwat'];
  if (lead.includes('saurabh')) return TEAM_LEAD_COLORS['Saurabh'];
  if (lead.includes('cd')) return TEAM_LEAD_COLORS['CD'];
  return TEAM_LEAD_COLORS['default'];
}

// Helper: Get Monday of a week from any date
function getWeekMonday(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  d.setDate(diff);
  // Use local date formatting to avoid timezone shifts (IST -> UTC would shift by 1 day)
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const dayOfMonth = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${dayOfMonth}`;
}

// =====================================================
// CRUD ENDPOINTS
// =====================================================

// GET /api/scaling-tasks - List tasks with filters
router.get('/', async (req, res) => {
  try {
    const {
      week_start,
      activity_id,
      city_id,
      area_id,
      club_id,
      launch_id,
      status,
      assigned_to_poc_id,
      include_completed
    } = req.query;

    let whereConditions: string[] = [];
    let params: any[] = [];
    let paramIndex = 1;

    // Filter by week
    if (week_start) {
      whereConditions.push(`stw.week_start = $${paramIndex++}`);
      params.push(week_start);
    }

    // Filter by hierarchy - hierarchical matching
    // When activity_id is passed without city_id, we want tasks at activity level
    // AND all tasks at city/area/club levels under that activity
    // This supports tooltip rollup views
    if (activity_id) {
      whereConditions.push(`st.activity_id = $${paramIndex++}`);
      params.push(parseInt(activity_id as string));
    }
    if (city_id) {
      whereConditions.push(`st.city_id = $${paramIndex++}`);
      params.push(parseInt(city_id as string));
    }
    if (area_id) {
      whereConditions.push(`st.area_id = $${paramIndex++}`);
      params.push(parseInt(area_id as string));
    }
    if (club_id) {
      whereConditions.push(`st.club_id = $${paramIndex++}`);
      params.push(parseInt(club_id as string));
    }
    if (launch_id) {
      whereConditions.push(`st.launch_id = $${paramIndex++}`);
      params.push(parseInt(launch_id as string));
    }

    // Filter by status
    if (status) {
      whereConditions.push(`st.status = $${paramIndex++}`);
      params.push(status);
    } else if (include_completed !== 'true') {
      // By default, exclude completed and cancelled
      whereConditions.push(`st.status IN ('not_started', 'in_progress')`);
    }

    // Filter by assignee
    if (assigned_to_poc_id) {
      whereConditions.push(`st.assigned_to_poc_id = $${paramIndex++}`);
      params.push(parseInt(assigned_to_poc_id as string));
    }

    const whereClause = whereConditions.length > 0
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';

    const query = `
      SELECT
        st.*,
        stw.week_start,
        stw.position as week_position,
        (SELECT COUNT(*) FROM scaling_task_comments stc WHERE stc.task_id = st.id) as comments_count
      FROM scaling_tasks st
      LEFT JOIN scaling_task_weeks stw ON st.id = stw.task_id
      ${whereClause}
      ORDER BY stw.week_start ASC NULLS LAST, stw.position ASC, st.created_at DESC
    `;

    const result = await queryLocal(query, params);

    // If we have tasks, fetch their linked leader requirements
    let leaderReqsByTask: Record<number, any[]> = {};
    if (result.rows.length > 0) {
      const taskIds = result.rows.map((t: any) => t.id);
      const leaderReqQuery = `
        SELECT
          stlr.task_id,
          lr.id,
          lr.name,
          lr.status,
          lr.growth_team_effort,
          lr.platform_team_effort,
          lr.existing_leader_effort,
          lr.leaders_required
        FROM scaling_task_leader_requirements stlr
        JOIN leader_requirements lr ON stlr.leader_requirement_id = lr.id
        WHERE stlr.task_id = ANY($1)
      `;
      const leaderReqResult = await queryLocal(leaderReqQuery, [taskIds]);
      leaderReqResult.rows.forEach((req: any) => {
        if (!leaderReqsByTask[req.task_id]) {
          leaderReqsByTask[req.task_id] = [];
        }
        leaderReqsByTask[req.task_id].push({
          id: req.id,
          name: req.name,
          status: req.status,
          growth_team_effort: req.growth_team_effort,
          platform_team_effort: req.platform_team_effort,
          existing_leader_effort: req.existing_leader_effort,
          leaders_required: req.leaders_required
        });
      });
    }

    // Add team colors and linked requirements to each task
    const tasksWithColors = result.rows.map((task: any) => ({
      ...task,
      team_color: getTeamColor(task.assigned_team_lead),
      linked_leader_requirements: leaderReqsByTask[task.id] || []
    }));

    res.json({
      success: true,
      tasks: tasksWithColors,
      count: tasksWithColors.length
    });
  } catch (error) {
    logger.error('Failed to fetch scaling tasks:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tasks',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/scaling-tasks/sprints - Get tasks grouped by week
router.get('/sprints', async (req, res) => {
  try {
    const {
      activity_ids,
      city_ids,
      area_ids,
      club_ids,
      launch_id,
      weeks_count = '4'
    } = req.query;

    // Build hierarchy filter (support multi-select arrays)
    let whereConditions: string[] = [];
    let params: any[] = [];
    let paramIndex = 1;

    // Parse comma-separated IDs for multi-select support
    if (activity_ids) {
      const ids = (activity_ids as string).split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      if (ids.length > 0) {
        whereConditions.push(`st.activity_id = ANY($${paramIndex++})`);
        params.push(ids);
      }
    }
    if (city_ids) {
      const ids = (city_ids as string).split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      if (ids.length > 0) {
        whereConditions.push(`st.city_id = ANY($${paramIndex++})`);
        params.push(ids);
      }
    }
    if (area_ids) {
      const ids = (area_ids as string).split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      if (ids.length > 0) {
        whereConditions.push(`st.area_id = ANY($${paramIndex++})`);
        params.push(ids);
      }
    }
    if (club_ids) {
      const ids = (club_ids as string).split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      if (ids.length > 0) {
        whereConditions.push(`st.club_id = ANY($${paramIndex++})`);
        params.push(ids);
      }
    }
    if (launch_id) {
      whereConditions.push(`st.launch_id = $${paramIndex++}`);
      params.push(parseInt(launch_id as string));
    }

    const hierarchyFilter = whereConditions.length > 0
      ? 'AND ' + whereConditions.join(' AND ')
      : '';

    // Get current week Monday
    const currentMonday = getWeekMonday(new Date());
    const weeksToShow = parseInt(weeks_count as string) || 4;

    // Helper to format date locally without timezone shift
    const formatLocalDate = (d: Date): string => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // Generate week dates
    const weeks: any[] = [];
    for (let i = -1; i < weeksToShow; i++) {
      // Parse currentMonday as local date to avoid timezone issues
      const [year, month, day] = currentMonday.split('-').map(Number);
      const weekDate = new Date(year, month - 1, day + (i * 7));
      const weekStart = formatLocalDate(weekDate);
      const weekEnd = new Date(year, month - 1, day + (i * 7) + 6);

      weeks.push({
        week_start: weekStart,
        week_end: formatLocalDate(weekEnd),
        week_label: `${weekDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
        is_current: i === 0,
        tasks: [],
        summary: {
          not_started: 0,
          in_progress: 0,
          completed: 0
        }
      });
    }

    // Fetch tasks for these weeks
    const tasksQuery = `
      SELECT
        st.*,
        stw.week_start,
        stw.position as week_position,
        (SELECT COUNT(*) FROM scaling_task_comments stc WHERE stc.task_id = st.id) as comments_count
      FROM scaling_tasks st
      JOIN scaling_task_weeks stw ON st.id = stw.task_id
      WHERE stw.week_start >= $${paramIndex++}
        AND stw.week_start <= $${paramIndex++}
        ${hierarchyFilter}
      ORDER BY stw.week_start ASC, stw.position ASC, st.created_at DESC
    `;

    const firstWeek = weeks[0].week_start;
    const lastWeek = weeks[weeks.length - 1].week_start;
    params.push(firstWeek, lastWeek);

    const tasksResult = await queryLocal(tasksQuery, params);

    // Get all task IDs to fetch linked requirements
    const taskIds = tasksResult.rows.map((t: any) => t.id);

    // Fetch linked requirements for all tasks at once (if there are tasks)
    let leaderReqsByTask: Record<number, any[]> = {};
    let venueReqsByTask: Record<number, any[]> = {};

    if (taskIds.length > 0) {
      // Fetch leader requirements
      const leaderReqsResult = await queryLocal(`
        SELECT stlr.task_id, lr.*
        FROM scaling_task_leader_requirements stlr
        JOIN leader_requirements lr ON stlr.leader_requirement_id = lr.id
        WHERE stlr.task_id = ANY($1)
      `, [taskIds]);

      // Group by task_id
      for (const req of leaderReqsResult.rows) {
        if (!leaderReqsByTask[req.task_id]) leaderReqsByTask[req.task_id] = [];
        leaderReqsByTask[req.task_id].push({ ...req, type: 'leader' });
      }

      // Fetch venue requirements
      const venueReqsResult = await queryLocal(`
        SELECT stvr.task_id, vr.*
        FROM scaling_task_venue_requirements stvr
        JOIN venue_requirements vr ON stvr.venue_requirement_id = vr.id
        WHERE stvr.task_id = ANY($1)
      `, [taskIds]);

      // Group by task_id
      for (const req of venueReqsResult.rows) {
        if (!venueReqsByTask[req.task_id]) venueReqsByTask[req.task_id] = [];
        venueReqsByTask[req.task_id].push({ ...req, type: 'venue' });
      }
    }

    // Group tasks by week and add colors + linked requirements
    for (const task of tasksResult.rows) {
      // Convert week_start to string for comparison (DB might return Date object)
      // Use local date formatting to avoid timezone shifts
      let taskWeekStart: string;
      if (task.week_start instanceof Date) {
        const d = task.week_start;
        taskWeekStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      } else {
        taskWeekStart = String(task.week_start).split('T')[0];
      }
      const week = weeks.find(w => w.week_start === taskWeekStart);
      if (week) {
        week.tasks.push({
          ...task,
          team_color: getTeamColor(task.assigned_team_lead),
          linked_leader_requirements: leaderReqsByTask[task.id] || [],
          linked_venue_requirements: venueReqsByTask[task.id] || []
        });

        // Update summary
        if (task.status === 'not_started') week.summary.not_started++;
        else if (task.status === 'in_progress') week.summary.in_progress++;
        else if (task.status === 'completed') week.summary.completed++;
      }
    }

    res.json({
      success: true,
      weeks,
      current_week: currentMonday
    });
  } catch (error) {
    logger.error('Failed to fetch sprints:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sprints',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/scaling-tasks/summary/by-hierarchy - Get task summary for hierarchy nodes
// Shows tasks from current sprint + last sprint (2 weeks) with status breakdown
router.get('/summary/by-hierarchy', async (req, res) => {
  try {
    const { activity_id, city_id, area_id } = req.query;

    // Build base filter - include sprint time filter
    let whereConditions: string[] = [];
    let params: any[] = [];
    let paramIndex = 1;

    // Filter to current + last sprint (tasks from last 2 weeks OR still open regardless of age)
    // This shows: recent tasks + any open tasks that might be stale
    whereConditions.push(`(
      created_at >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '1 week'
      OR status IN ('not_started', 'in_progress')
    )`);

    if (activity_id) {
      whereConditions.push(`activity_id = $${paramIndex++}`);
      params.push(parseInt(activity_id as string));
    }
    if (city_id) {
      whereConditions.push(`city_id = $${paramIndex++}`);
      params.push(parseInt(city_id as string));
    }
    if (area_id) {
      whereConditions.push(`area_id = $${paramIndex++}`);
      params.push(parseInt(area_id as string));
    }

    const whereClause = whereConditions.length > 0
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';

    // Get summary grouped by hierarchy - simplified without stage transitions
    const query = `
      SELECT
        task_scope,
        activity_id,
        activity_name,
        city_id,
        city_name,
        area_id,
        area_name,
        club_id,
        club_name,
        launch_id,
        COUNT(*) FILTER (WHERE status = 'not_started') as not_started,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled
      FROM scaling_tasks
      ${whereClause}
      GROUP BY task_scope, activity_id, activity_name, city_id, city_name, area_id, area_name, club_id, club_name, launch_id
    `;

    const result = await queryLocal(query, params);

    res.json({
      success: true,
      summaries: result.rows
    });
  } catch (error) {
    logger.error('Failed to fetch task summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch task summary',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/scaling-tasks/search - Search tasks for reverse linking
router.get('/search', async (req, res) => {
  try {
    const { q, activity_id, city_id, area_id, club_id, limit = 15 } = req.query;

    let whereConditions: string[] = ['status NOT IN (\'completed\', \'cancelled\')'];
    const params: any[] = [];
    let paramIndex = 1;

    if (q) {
      whereConditions.push(`(title ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
      params.push(`%${q}%`);
      paramIndex++;
    }
    if (activity_id) {
      whereConditions.push(`activity_id = $${paramIndex++}`);
      params.push(parseInt(activity_id as string));
    }
    if (city_id) {
      whereConditions.push(`city_id = $${paramIndex++}`);
      params.push(parseInt(city_id as string));
    }
    if (area_id) {
      whereConditions.push(`area_id = $${paramIndex++}`);
      params.push(parseInt(area_id as string));
    }
    if (club_id) {
      whereConditions.push(`club_id = $${paramIndex++}`);
      params.push(parseInt(club_id as string));
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const result = await queryLocal(`
      SELECT
        id, task_scope, title, description,
        activity_id, activity_name,
        city_id, city_name,
        area_id, area_name,
        club_id, club_name,
        status, assigned_to_name, assigned_team_lead,
        created_at
      FROM scaling_tasks
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex}
    `, [...params, parseInt(limit as string)]);

    const tasks = result.rows.map((task: any) => ({
      ...task,
      team_color: getTeamColor(task.assigned_team_lead)
    }));

    res.json({
      success: true,
      tasks,
      total: tasks.length
    });
  } catch (error) {
    logger.error('Failed to search tasks:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search tasks',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/scaling-tasks/:id - Get single task with comments and linked requirements
router.get('/:id', async (req, res) => {
  try {
    const taskId = parseInt(req.params.id);

    // Get task
    const taskResult = await queryLocal(`
      SELECT st.*,
        (SELECT json_agg(json_build_object(
          'id', stw.id,
          'week_start', stw.week_start,
          'position', stw.position
        )) FROM scaling_task_weeks stw WHERE stw.task_id = st.id) as weeks
      FROM scaling_tasks st
      WHERE st.id = $1
    `, [taskId]);

    if (taskResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }

    // Get comments
    const commentsResult = await queryLocal(`
      SELECT * FROM scaling_task_comments
      WHERE task_id = $1
      ORDER BY created_at DESC
    `, [taskId]);

    // Get linked leader requirements
    const leaderReqResult = await queryLocal(`
      SELECT lr.*
      FROM leader_requirements lr
      JOIN scaling_task_leader_requirements stlr ON lr.id = stlr.leader_requirement_id
      WHERE stlr.task_id = $1
      ORDER BY lr.created_at DESC
    `, [taskId]);

    // Get linked venue requirements
    const venueReqResult = await queryLocal(`
      SELECT vr.*
      FROM venue_requirements vr
      JOIN scaling_task_venue_requirements stvr ON vr.id = stvr.venue_requirement_id
      WHERE stvr.task_id = $1
      ORDER BY vr.created_at DESC
    `, [taskId]);

    const task = {
      ...taskResult.rows[0],
      team_color: getTeamColor(taskResult.rows[0].assigned_team_lead),
      comments: commentsResult.rows,
      linked_leader_requirements: leaderReqResult.rows.map((r: any) => ({ ...r, type: 'leader' })),
      linked_venue_requirements: venueReqResult.rows.map((r: any) => ({ ...r, type: 'venue' }))
    };

    res.json({
      success: true,
      task
    });
  } catch (error) {
    logger.error('Failed to fetch task:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch task',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/scaling-tasks - Create task with hierarchy context
router.post('/', async (req, res) => {
  try {
    const {
      task_scope,
      activity_id,
      activity_name,
      city_id,
      city_name,
      area_id,
      area_name,
      club_id,
      club_name,
      launch_id,
      target_id,
      title,
      description,
      source_stage,
      target_stage,
      meetups_count,
      assigned_to_poc_id,
      assigned_to_name,
      assigned_team_lead,
      status,
      week_start,
      due_date,
      created_by
    } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        error: 'Title is required'
      });
    }

    if (!task_scope) {
      return res.status(400).json({
        success: false,
        error: 'Task scope is required'
      });
    }

    if (!assigned_to_name && !assigned_to_poc_id) {
      return res.status(400).json({
        success: false,
        error: 'Assignee is required'
      });
    }

    // Insert task
    const insertQuery = `
      INSERT INTO scaling_tasks (
        task_scope,
        activity_id, activity_name,
        city_id, city_name,
        area_id, area_name,
        club_id, club_name,
        launch_id, target_id,
        title, description,
        source_stage, target_stage, meetups_count,
        assigned_to_poc_id, assigned_to_name, assigned_team_lead,
        status, due_date, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
      RETURNING *
    `;

    const taskResult = await queryLocal(insertQuery, [
      task_scope,
      activity_id || null,
      activity_name || null,
      city_id || null,
      city_name || null,
      area_id || null,
      area_name || null,
      club_id || null,
      club_name || null,
      launch_id || null,
      target_id || null,
      title,
      description || null,
      source_stage || null,
      target_stage || null,
      meetups_count || 0,
      assigned_to_poc_id || null,
      assigned_to_name || null,
      assigned_team_lead || null,
      status || 'not_started',
      due_date || null,
      created_by || 'Operations'
    ]);

    const task = taskResult.rows[0];

    // Add to week if week_start provided
    if (week_start) {
      const weekMonday = getWeekMonday(new Date(week_start));

      // Get max position for this week
      const maxPosResult = await queryLocal(`
        SELECT COALESCE(MAX(position), -1) + 1 as next_pos
        FROM scaling_task_weeks
        WHERE week_start = $1
      `, [weekMonday]);

      await queryLocal(`
        INSERT INTO scaling_task_weeks (task_id, week_start, position)
        VALUES ($1, $2, $3)
      `, [task.id, weekMonday, maxPosResult.rows[0].next_pos]);
    }

    logger.info(`Created scaling task ${task.id}: ${title}`);

    res.json({
      success: true,
      task: {
        ...task,
        team_color: getTeamColor(task.assigned_team_lead)
      }
    });
  } catch (error) {
    logger.error('Failed to create task:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create task',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// PUT /api/scaling-tasks/:id - Update task
router.put('/:id', async (req, res) => {
  try {
    const taskId = parseInt(req.params.id);
    const {
      title,
      description,
      source_stage,
      target_stage,
      meetups_count,
      assigned_to_poc_id,
      assigned_to_name,
      assigned_team_lead,
      status
    } = req.body;

    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      values.push(title);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description);
    }
    if (source_stage !== undefined) {
      updates.push(`source_stage = $${paramIndex++}`);
      values.push(source_stage);
    }
    if (target_stage !== undefined) {
      updates.push(`target_stage = $${paramIndex++}`);
      values.push(target_stage);
    }
    if (meetups_count !== undefined) {
      updates.push(`meetups_count = $${paramIndex++}`);
      values.push(meetups_count);
    }
    if (assigned_to_poc_id !== undefined) {
      updates.push(`assigned_to_poc_id = $${paramIndex++}`);
      values.push(assigned_to_poc_id);
    }
    if (assigned_to_name !== undefined) {
      updates.push(`assigned_to_name = $${paramIndex++}`);
      values.push(assigned_to_name);
    }
    if (assigned_team_lead !== undefined) {
      updates.push(`assigned_team_lead = $${paramIndex++}`);
      values.push(assigned_team_lead);
    }
    if (status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(status);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    values.push(taskId);
    const updateQuery = `
      UPDATE scaling_tasks
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await queryLocal(updateQuery, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }

    logger.info(`Updated scaling task ${taskId}`);

    res.json({
      success: true,
      task: {
        ...result.rows[0],
        team_color: getTeamColor(result.rows[0].assigned_team_lead)
      }
    });
  } catch (error) {
    logger.error('Failed to update task:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update task',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// DELETE /api/scaling-tasks/:id - Delete task
router.delete('/:id', async (req, res) => {
  try {
    const taskId = parseInt(req.params.id);

    const result = await queryLocal(`
      DELETE FROM scaling_tasks WHERE id = $1 RETURNING id
    `, [taskId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }

    logger.info(`Deleted scaling task ${taskId}`);

    res.json({
      success: true,
      message: 'Task deleted successfully'
    });
  } catch (error) {
    logger.error('Failed to delete task:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete task',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// =====================================================
// COMMENTS ENDPOINTS
// =====================================================

// POST /api/scaling-tasks/:id/comments - Add comment to task
router.post('/:id/comments', async (req, res) => {
  try {
    const taskId = parseInt(req.params.id);
    const { comment_text, author_name } = req.body;

    if (!comment_text) {
      return res.status(400).json({
        success: false,
        error: 'Comment text is required'
      });
    }

    const result = await queryLocal(`
      INSERT INTO scaling_task_comments (task_id, comment_text, author_name)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [taskId, comment_text, author_name || 'Anonymous']);

    logger.info(`Added comment to task ${taskId}`);

    res.json({
      success: true,
      comment: result.rows[0]
    });
  } catch (error) {
    logger.error('Failed to add comment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add comment',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/scaling-tasks/:id/comments - Get comments for task
router.get('/:id/comments', async (req, res) => {
  try {
    const taskId = parseInt(req.params.id);

    const result = await queryLocal(`
      SELECT * FROM scaling_task_comments
      WHERE task_id = $1
      ORDER BY created_at DESC
    `, [taskId]);

    res.json({
      success: true,
      comments: result.rows
    });
  } catch (error) {
    logger.error('Failed to fetch comments:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch comments',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// =====================================================
// SPRINT/WEEK MANAGEMENT ENDPOINTS
// =====================================================

// POST /api/scaling-tasks/:id/duplicate-to-week - Duplicate task to another week
router.post('/:id/duplicate-to-week', async (req, res) => {
  try {
    const taskId = parseInt(req.params.id);
    const { week_start } = req.body;

    if (!week_start) {
      return res.status(400).json({
        success: false,
        error: 'week_start is required'
      });
    }

    const weekMonday = getWeekMonday(new Date(week_start));

    // Check if task exists
    const taskCheck = await queryLocal(`SELECT id FROM scaling_tasks WHERE id = $1`, [taskId]);
    if (taskCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }

    // Check if already in this week
    const existingCheck = await queryLocal(`
      SELECT id FROM scaling_task_weeks WHERE task_id = $1 AND week_start = $2
    `, [taskId, weekMonday]);

    if (existingCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Task already exists in this week'
      });
    }

    // Get max position
    const maxPosResult = await queryLocal(`
      SELECT COALESCE(MAX(position), -1) + 1 as next_pos
      FROM scaling_task_weeks
      WHERE week_start = $1
    `, [weekMonday]);

    // Add to week
    await queryLocal(`
      INSERT INTO scaling_task_weeks (task_id, week_start, position)
      VALUES ($1, $2, $3)
    `, [taskId, weekMonday, maxPosResult.rows[0].next_pos]);

    logger.info(`Duplicated task ${taskId} to week ${weekMonday}`);

    res.json({
      success: true,
      message: 'Task added to week successfully'
    });
  } catch (error) {
    logger.error('Failed to duplicate task to week:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to duplicate task to week',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// PUT /api/scaling-tasks/:id/reorder - Update position within week
router.put('/:id/reorder', async (req, res) => {
  try {
    const taskId = parseInt(req.params.id);
    const { week_start, new_position } = req.body;

    if (!week_start || new_position === undefined) {
      return res.status(400).json({
        success: false,
        error: 'week_start and new_position are required'
      });
    }

    const weekMonday = getWeekMonday(new Date(week_start));

    // Get current position
    const currentResult = await queryLocal(`
      SELECT position FROM scaling_task_weeks
      WHERE task_id = $1 AND week_start = $2
    `, [taskId, weekMonday]);

    if (currentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Task not found in this week'
      });
    }

    const currentPosition = currentResult.rows[0].position;

    // Shift other tasks
    if (new_position < currentPosition) {
      // Moving up: shift tasks down
      await queryLocal(`
        UPDATE scaling_task_weeks
        SET position = position + 1
        WHERE week_start = $1
          AND position >= $2
          AND position < $3
          AND task_id != $4
      `, [weekMonday, new_position, currentPosition, taskId]);
    } else if (new_position > currentPosition) {
      // Moving down: shift tasks up
      await queryLocal(`
        UPDATE scaling_task_weeks
        SET position = position - 1
        WHERE week_start = $1
          AND position > $2
          AND position <= $3
          AND task_id != $4
      `, [weekMonday, currentPosition, new_position, taskId]);
    }

    // Update task position
    await queryLocal(`
      UPDATE scaling_task_weeks
      SET position = $1
      WHERE task_id = $2 AND week_start = $3
    `, [new_position, taskId, weekMonday]);

    res.json({
      success: true,
      message: 'Task reordered successfully'
    });
  } catch (error) {
    logger.error('Failed to reorder task:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reorder task',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/scaling-tasks/:id/reorder - Move task between weeks or reorder within week
router.post('/:id/reorder', async (req, res) => {
  try {
    const taskId = parseInt(req.params.id);
    const { source_week, dest_week, new_position } = req.body;

    if (!source_week || !dest_week || new_position === undefined) {
      return res.status(400).json({
        success: false,
        error: 'source_week, dest_week, and new_position are required'
      });
    }

    const sourceWeekMonday = getWeekMonday(new Date(source_week));
    const destWeekMonday = getWeekMonday(new Date(dest_week));

    // Check if task exists in source week
    const sourceCheck = await queryLocal(`
      SELECT position FROM scaling_task_weeks
      WHERE task_id = $1 AND week_start = $2
    `, [taskId, sourceWeekMonday]);

    if (sourceCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Task not found in source week'
      });
    }

    if (sourceWeekMonday === destWeekMonday) {
      // Same week - just reorder
      const currentPosition = sourceCheck.rows[0].position;

      if (new_position < currentPosition) {
        await queryLocal(`
          UPDATE scaling_task_weeks
          SET position = position + 1
          WHERE week_start = $1
            AND position >= $2
            AND position < $3
            AND task_id != $4
        `, [destWeekMonday, new_position, currentPosition, taskId]);
      } else if (new_position > currentPosition) {
        await queryLocal(`
          UPDATE scaling_task_weeks
          SET position = position - 1
          WHERE week_start = $1
            AND position > $2
            AND position <= $3
            AND task_id != $4
        `, [destWeekMonday, currentPosition, new_position, taskId]);
      }

      await queryLocal(`
        UPDATE scaling_task_weeks
        SET position = $1
        WHERE task_id = $2 AND week_start = $3
      `, [new_position, taskId, destWeekMonday]);
    } else {
      // Different week - move task
      // Remove from source week
      await queryLocal(`
        DELETE FROM scaling_task_weeks
        WHERE task_id = $1 AND week_start = $2
      `, [taskId, sourceWeekMonday]);

      // Shift positions in source week
      await queryLocal(`
        UPDATE scaling_task_weeks
        SET position = position - 1
        WHERE week_start = $1 AND position > $2
      `, [sourceWeekMonday, sourceCheck.rows[0].position]);

      // Check if already exists in dest week
      const destCheck = await queryLocal(`
        SELECT id FROM scaling_task_weeks
        WHERE task_id = $1 AND week_start = $2
      `, [taskId, destWeekMonday]);

      if (destCheck.rows.length === 0) {
        // Shift positions in dest week to make room
        await queryLocal(`
          UPDATE scaling_task_weeks
          SET position = position + 1
          WHERE week_start = $1 AND position >= $2
        `, [destWeekMonday, new_position]);

        // Insert in dest week
        await queryLocal(`
          INSERT INTO scaling_task_weeks (task_id, week_start, position)
          VALUES ($1, $2, $3)
        `, [taskId, destWeekMonday, new_position]);
      }
    }

    logger.info(`Reordered task ${taskId} from ${sourceWeekMonday} to ${destWeekMonday} at position ${new_position}`);

    res.json({
      success: true,
      message: 'Task reordered successfully'
    });
  } catch (error) {
    logger.error('Failed to reorder task:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reorder task',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// DELETE /api/scaling-tasks/:id/weeks/:weekStart - Remove task from a specific week
router.delete('/:id/weeks/:weekStart', async (req, res) => {
  try {
    const taskId = parseInt(req.params.id);
    const weekStart = req.params.weekStart;

    const result = await queryLocal(`
      DELETE FROM scaling_task_weeks
      WHERE task_id = $1 AND week_start = $2
      RETURNING id
    `, [taskId, weekStart]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Task not found in this week'
      });
    }

    res.json({
      success: true,
      message: 'Task removed from week successfully'
    });
  } catch (error) {
    logger.error('Failed to remove task from week:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove task from week',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// =====================================================
// ASSIGNEE ENDPOINTS
// =====================================================

// GET /api/scaling-tasks/assignees - Get all POCs with team info for dropdown
router.get('/assignees/list', async (req, res) => {
  try {
    // Hardcoded team members from shared config
    // Blue: Shashwat (lead), New person 1, Kar
    // Green: Saurabh (lead), Riya, Tanya
    // Yellow: CD (lead), Kriti
    const TEAM_MEMBERS = [
      // Team Blue (Shashwat)
      { id: 1, name: 'Shashwat', team_lead: 'Shashwat' },
      { id: 2, name: 'New person 1', team_lead: 'Shashwat' },
      { id: 3, name: 'Kar', team_lead: 'Shashwat' },
      // Team Green (Saurabh)
      { id: 4, name: 'Saurabh', team_lead: 'Saurabh' },
      { id: 5, name: 'Riya', team_lead: 'Saurabh' },
      { id: 6, name: 'Tanya', team_lead: 'Saurabh' },
      // Team Yellow (CD)
      { id: 7, name: 'CD', team_lead: 'CD' },
      { id: 8, name: 'Kriti', team_lead: 'CD' },
    ];

    const assignees = TEAM_MEMBERS.map(member => ({
      ...member,
      team_color: getTeamColor(member.team_lead)
    }));

    res.json({
      success: true,
      assignees
    });
  } catch (error) {
    logger.error('Failed to fetch assignees:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch assignees',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/scaling-tasks/auto-assign/:activityName - Get suggested POC for an activity
router.get('/auto-assign/:activityName', async (req, res) => {
  try {
    const activityName = decodeURIComponent(req.params.activityName);

    // Find POC who has this activity in their activities array
    const result = await queryLocal(`
      SELECT
        id,
        name,
        poc_type,
        team_name,
        team_role
      FROM poc_structure
      WHERE is_active = TRUE
        AND $1 = ANY(activities)
      ORDER BY
        CASE WHEN poc_type = 'activity_head' THEN 0 ELSE 1 END,
        name
      LIMIT 1
    `, [activityName]);

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        suggested: null,
        message: 'No POC found for this activity'
      });
    }

    const poc = result.rows[0];
    let team_lead = 'default';
    const teamName = (poc.team_name || '').toLowerCase();

    if (teamName.includes('shashwat')) team_lead = 'Shashwat';
    else if (teamName.includes('saurabh')) team_lead = 'Saurabh';
    else if (teamName.includes('cd')) team_lead = 'CD';

    res.json({
      success: true,
      suggested: {
        ...poc,
        team_lead,
        team_color: getTeamColor(team_lead)
      }
    });
  } catch (error) {
    logger.error('Failed to auto-assign:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to auto-assign',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// =====================================================
// HIERARCHY FILTER ENDPOINTS (from production DB)
// These provide context-led cascading filters based on actual hierarchy
// =====================================================

// GET /api/scaling-tasks/filters/activities - Get ALL activities from production
router.get('/filters/activities', async (req, res) => {
  try {
    const result = await queryProduction(`
      SELECT DISTINCT a.id, a.name
      FROM activity a
      JOIN club c ON c.activity_id = a.id
      WHERE c.status = 'ACTIVE'
      ORDER BY a.name
    `);

    res.json({
      success: true,
      options: result.rows
    });
  } catch (error) {
    logger.error('Failed to fetch activity filters:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch activity filters'
    });
  }
});

// GET /api/scaling-tasks/filters/cities - Get cities for selected activities (cascading)
// Uses event -> location -> area -> city path since clubs don't have direct area_id
// Use include_all=true to get ALL cities (for new club launches/expansion targets)
router.get('/filters/cities', async (req, res) => {
  try {
    const { activity_ids, include_all } = req.query;

    // If include_all=true, return all cities without requiring existing clubs
    // This is used for new club launches where we want to show all possible cities
    if (include_all === 'true') {
      const allCitiesQuery = `
        SELECT DISTINCT ci.id, ci.name
        FROM city ci
        ORDER BY ci.name
      `;
      const allCitiesResult = await queryProduction(allCitiesQuery, []);
      return res.json({
        success: true,
        options: allCitiesResult.rows
      });
    }

    let query = `
      SELECT DISTINCT ci.id, ci.name
      FROM city ci
      JOIN area ar ON ar.city_id = ci.id
      JOIN location l ON l.area_id = ar.id
      JOIN event e ON e.location_id = l.id
      JOIN club c ON e.club_id = c.pk
      WHERE c.status = 'ACTIVE'
    `;
    const params: any[] = [];

    // Support multi-select: activity_ids can be comma-separated
    if (activity_ids) {
      const ids = (activity_ids as string).split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      if (ids.length > 0) {
        query += ` AND c.activity_id = ANY($1)`;
        params.push(ids);
      }
    }

    query += ` ORDER BY ci.name`;

    const result = await queryProduction(query, params);

    res.json({
      success: true,
      options: result.rows
    });
  } catch (error) {
    logger.error('Failed to fetch city filters:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch city filters'
    });
  }
});

// GET /api/scaling-tasks/filters/areas - Get areas for selected cities (cascading)
// Use include_all=true to get ALL areas in a city (for new club launches)
router.get('/filters/areas', async (req, res) => {
  try {
    const { activity_ids, city_ids, include_all } = req.query;

    // If include_all=true, return all areas in the city without requiring existing clubs
    // This is used for new club launches where we want to show all possible areas
    if (include_all === 'true' && city_ids) {
      const ids = (city_ids as string).split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      if (ids.length > 0) {
        const result = await queryProduction(
          `SELECT id, name FROM area WHERE city_id = ANY($1) ORDER BY name`,
          [ids]
        );
        return res.json({
          success: true,
          options: result.rows
        });
      }
    }

    // Default behavior: only return areas with active clubs
    let query = `
      SELECT DISTINCT ar.id, ar.name
      FROM area ar
      JOIN location l ON l.area_id = ar.id
      JOIN event e ON e.location_id = l.id
      JOIN club c ON e.club_id = c.pk
      WHERE c.status = 'ACTIVE'
    `;
    const params: any[] = [];
    let paramIndex = 1;

    // Filter by activities (multi-select)
    if (activity_ids) {
      const ids = (activity_ids as string).split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      if (ids.length > 0) {
        query += ` AND c.activity_id = ANY($${paramIndex++})`;
        params.push(ids);
      }
    }

    // Filter by cities (multi-select)
    if (city_ids) {
      const ids = (city_ids as string).split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      if (ids.length > 0) {
        query += ` AND ar.city_id = ANY($${paramIndex++})`;
        params.push(ids);
      }
    }

    query += ` ORDER BY ar.name`;

    const result = await queryProduction(query, params);

    res.json({
      success: true,
      options: result.rows
    });
  } catch (error) {
    logger.error('Failed to fetch area filters:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch area filters'
    });
  }
});

// GET /api/scaling-tasks/filters/clubs - Get clubs for selected areas (cascading)
// Also includes launches from local database
router.get('/filters/clubs', async (req, res) => {
  try {
    const { activity_ids, city_ids, area_ids } = req.query;

    // First, get area names and activity names for matching launches
    let areaNames: string[] = [];
    let activityNames: string[] = [];

    if (area_ids) {
      const areaIds = (area_ids as string).split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      if (areaIds.length > 0) {
        const areaResult = await queryProduction(
          `SELECT name FROM area WHERE id = ANY($1)`,
          [areaIds]
        );
        areaNames = areaResult.rows.map((r: any) => r.name);
      }
    }

    if (activity_ids) {
      const actIds = (activity_ids as string).split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      if (actIds.length > 0) {
        const actResult = await queryProduction(
          `SELECT name FROM activity WHERE id = ANY($1)`,
          [actIds]
        );
        activityNames = actResult.rows.map((r: any) => r.name);
      }
    }

    // Query clubs from production
    let query = `
      SELECT DISTINCT c.pk as id, c.name
      FROM club c
      JOIN event e ON e.club_id = c.pk
      JOIN location l ON e.location_id = l.id
      JOIN area ar ON l.area_id = ar.id
      WHERE c.status = 'ACTIVE'
    `;
    const params: any[] = [];
    let paramIndex = 1;

    // Filter by activities (multi-select)
    if (activity_ids) {
      const ids = (activity_ids as string).split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      if (ids.length > 0) {
        query += ` AND c.activity_id = ANY($${paramIndex++})`;
        params.push(ids);
      }
    }

    // Filter by cities (multi-select)
    if (city_ids) {
      const ids = (city_ids as string).split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      if (ids.length > 0) {
        query += ` AND ar.city_id = ANY($${paramIndex++})`;
        params.push(ids);
      }
    }

    // Filter by areas (multi-select)
    if (area_ids) {
      const ids = (area_ids as string).split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      if (ids.length > 0) {
        query += ` AND l.area_id = ANY($${paramIndex++})`;
        params.push(ids);
      }
    }

    query += ` ORDER BY c.name`;

    const result = await queryProduction(query, params);

    // Also fetch launches from local database that match the filters
    let launches: any[] = [];
    if (areaNames.length > 0 && activityNames.length > 0) {
      // Use case-insensitive matching for area and activity names
      const lowerAreaNames = areaNames.map(n => n.toLowerCase());
      const lowerActivityNames = activityNames.map(n => n.toLowerCase());
      const launchResult = await queryLocal(`
        SELECT
          id,
          planned_club_name as name,
          'launch' as type
        FROM new_club_launches
        WHERE launch_status IN ('planned', 'in_progress')
          AND LOWER(planned_area) = ANY($1)
          AND LOWER(activity_name) = ANY($2)
        ORDER BY planned_club_name
      `, [lowerAreaNames, lowerActivityNames]);
      launches = launchResult.rows.map((l: any) => ({
        id: `launch_${l.id}`,
        name: `🚀 ${l.name}`,
        is_launch: true,
        launch_id: l.id
      }));
    }

    // Combine clubs and launches
    const clubs = result.rows.map((c: any) => ({
      id: c.id,
      name: c.name,
      is_launch: false
    }));

    res.json({
      success: true,
      options: [...clubs, ...launches]
    });
  } catch (error) {
    logger.error('Failed to fetch club filters:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch club filters'
    });
  }
});

// =====================================================
// REQUIREMENT LINKING ENDPOINTS
// =====================================================

// POST /api/scaling-tasks/:id/requirements/leaders/:reqId - Link leader requirement to task
router.post('/:id/requirements/leaders/:reqId', async (req, res) => {
  try {
    const taskId = parseInt(req.params.id);
    const reqId = parseInt(req.params.reqId);

    // Check if task exists
    const taskCheck = await queryLocal('SELECT id FROM scaling_tasks WHERE id = $1', [taskId]);
    if (taskCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    // Check if requirement exists
    const reqCheck = await queryLocal('SELECT id FROM leader_requirements WHERE id = $1', [reqId]);
    if (reqCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Leader requirement not found' });
    }

    // Link (upsert - ignore if already exists)
    await queryLocal(`
      INSERT INTO scaling_task_leader_requirements (task_id, leader_requirement_id)
      VALUES ($1, $2)
      ON CONFLICT (task_id, leader_requirement_id) DO NOTHING
    `, [taskId, reqId]);

    logger.info(`Linked leader requirement ${reqId} to task ${taskId}`);

    res.json({ success: true, message: 'Leader requirement linked to task' });
  } catch (error) {
    logger.error('Failed to link leader requirement:', error);
    res.status(500).json({ success: false, error: 'Failed to link requirement' });
  }
});

// DELETE /api/scaling-tasks/:id/requirements/leaders/:reqId - Unlink leader requirement from task
router.delete('/:id/requirements/leaders/:reqId', async (req, res) => {
  try {
    const taskId = parseInt(req.params.id);
    const reqId = parseInt(req.params.reqId);

    const result = await queryLocal(`
      DELETE FROM scaling_task_leader_requirements
      WHERE task_id = $1 AND leader_requirement_id = $2
      RETURNING id
    `, [taskId, reqId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Link not found' });
    }

    logger.info(`Unlinked leader requirement ${reqId} from task ${taskId}`);

    res.json({ success: true, message: 'Leader requirement unlinked from task' });
  } catch (error) {
    logger.error('Failed to unlink leader requirement:', error);
    res.status(500).json({ success: false, error: 'Failed to unlink requirement' });
  }
});

// POST /api/scaling-tasks/:id/requirements/venues/:reqId - Link venue requirement to task
router.post('/:id/requirements/venues/:reqId', async (req, res) => {
  try {
    const taskId = parseInt(req.params.id);
    const reqId = parseInt(req.params.reqId);

    // Check if task exists
    const taskCheck = await queryLocal('SELECT id FROM scaling_tasks WHERE id = $1', [taskId]);
    if (taskCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    // Check if requirement exists
    const reqCheck = await queryLocal('SELECT id FROM venue_requirements WHERE id = $1', [reqId]);
    if (reqCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Venue requirement not found' });
    }

    // Link (upsert - ignore if already exists)
    await queryLocal(`
      INSERT INTO scaling_task_venue_requirements (task_id, venue_requirement_id)
      VALUES ($1, $2)
      ON CONFLICT (task_id, venue_requirement_id) DO NOTHING
    `, [taskId, reqId]);

    logger.info(`Linked venue requirement ${reqId} to task ${taskId}`);

    res.json({ success: true, message: 'Venue requirement linked to task' });
  } catch (error) {
    logger.error('Failed to link venue requirement:', error);
    res.status(500).json({ success: false, error: 'Failed to link requirement' });
  }
});

// DELETE /api/scaling-tasks/:id/requirements/venues/:reqId - Unlink venue requirement from task
router.delete('/:id/requirements/venues/:reqId', async (req, res) => {
  try {
    const taskId = parseInt(req.params.id);
    const reqId = parseInt(req.params.reqId);

    const result = await queryLocal(`
      DELETE FROM scaling_task_venue_requirements
      WHERE task_id = $1 AND venue_requirement_id = $2
      RETURNING id
    `, [taskId, reqId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Link not found' });
    }

    logger.info(`Unlinked venue requirement ${reqId} from task ${taskId}`);

    res.json({ success: true, message: 'Venue requirement unlinked from task' });
  } catch (error) {
    logger.error('Failed to unlink venue requirement:', error);
    res.status(500).json({ success: false, error: 'Failed to unlink requirement' });
  }
});

// GET /api/scaling-tasks/:id/requirements - Get all linked requirements for a task
router.get('/:id/requirements', async (req, res) => {
  try {
    const taskId = parseInt(req.params.id);

    // Get linked leader requirements
    const leaderResult = await queryLocal(`
      SELECT lr.*
      FROM leader_requirements lr
      JOIN scaling_task_leader_requirements stlr ON lr.id = stlr.leader_requirement_id
      WHERE stlr.task_id = $1
      ORDER BY lr.created_at DESC
    `, [taskId]);

    // Get linked venue requirements
    const venueResult = await queryLocal(`
      SELECT vr.*
      FROM venue_requirements vr
      JOIN scaling_task_venue_requirements stvr ON vr.id = stvr.venue_requirement_id
      WHERE stvr.task_id = $1
      ORDER BY vr.created_at DESC
    `, [taskId]);

    const leaderRequirements = leaderResult.rows.map((r: any) => ({ ...r, type: 'leader' }));
    const venueRequirements = venueResult.rows.map((r: any) => ({ ...r, type: 'venue' }));

    res.json({
      success: true,
      linked_leader_requirements: leaderRequirements,
      linked_venue_requirements: venueRequirements
    });
  } catch (error) {
    logger.error('Failed to fetch task requirements:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch requirements' });
  }
});

// POST /api/scaling-tasks/:id/complete-with-requirements - Complete task and optionally mark requirements as done
router.post('/:id/complete-with-requirements', async (req, res) => {
  try {
    const taskId = parseInt(req.params.id);
    const { complete_leaders, complete_venues } = req.body;

    // Update task status to completed
    const taskResult = await queryLocal(`
      UPDATE scaling_tasks
      SET status = 'completed'
      WHERE id = $1
      RETURNING *
    `, [taskId]);

    if (taskResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    const results = {
      task_completed: true,
      leaders_completed: 0,
      venues_completed: 0
    };

    // Mark selected leader requirements as done (one-way: doesn't affect other linked tasks)
    if (complete_leaders && complete_leaders.length > 0) {
      const leaderResult = await queryLocal(`
        UPDATE leader_requirements
        SET status = 'done', updated_at = CURRENT_TIMESTAMP
        WHERE id = ANY($1)
      `, [complete_leaders]);
      results.leaders_completed = leaderResult.rowCount || 0;
    }

    // Mark selected venue requirements as done
    if (complete_venues && complete_venues.length > 0) {
      const venueResult = await queryLocal(`
        UPDATE venue_requirements
        SET status = 'done', updated_at = CURRENT_TIMESTAMP
        WHERE id = ANY($1)
      `, [complete_venues]);
      results.venues_completed = venueResult.rowCount || 0;
    }

    logger.info(`Completed task ${taskId} with ${results.leaders_completed} leaders and ${results.venues_completed} venues`);

    res.json({
      success: true,
      ...results,
      task: {
        ...taskResult.rows[0],
        team_color: getTeamColor(taskResult.rows[0].assigned_team_lead)
      }
    });
  } catch (error) {
    logger.error('Failed to complete task with requirements:', error);
    res.status(500).json({ success: false, error: 'Failed to complete task' });
  }
});

export default router;
