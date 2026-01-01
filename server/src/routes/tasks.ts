import { Router } from 'express';
import { query } from '../services/database';
import { logger } from '../utils/logger';

const router = Router();

// GET /api/tasks - Get all tasks with optional filtering
router.get('/', async (req, res) => {
  try {
    const { status, priority, assigned_to_poc_id, activity, city } = req.query;

    let whereConditions = [];
    let queryParams = [];
    let paramIndex = 1;

    if (status) {
      whereConditions.push(`t.status = $${paramIndex}`);
      queryParams.push(status);
      paramIndex++;
    }

    if (priority) {
      whereConditions.push(`t.priority = $${paramIndex}`);
      queryParams.push(priority);
      paramIndex++;
    }

    if (assigned_to_poc_id) {
      whereConditions.push(`t.assigned_to_poc_id = $${paramIndex}`);
      queryParams.push(assigned_to_poc_id);
      paramIndex++;
    }

    if (activity) {
      whereConditions.push(`t.activity = $${paramIndex}`);
      queryParams.push(activity);
      paramIndex++;
    }

    if (city) {
      whereConditions.push(`t.city = $${paramIndex}`);
      queryParams.push(city);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const result = await query(`
      SELECT
        t.*,
        p.name as assigned_poc_name,
        p.poc_type,
        u.name as assigned_user_name,
        c.name as club_name,
        (SELECT COUNT(*) FROM task_comments tc WHERE tc.task_id = t.id) as comments_count
      FROM operations_tasks t
      LEFT JOIN poc_structure p ON t.assigned_to_poc_id = p.id
      LEFT JOIN users u ON t.assigned_to_user_id = u.id
      LEFT JOIN clubs c ON t.club_id = c.id
      ${whereClause}
      ORDER BY
        CASE t.priority
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
        END,
        t.created_at DESC
    `, queryParams);

    // Calculate stats
    const statsResult = await query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled,
        COUNT(CASE WHEN due_date < CURRENT_DATE AND status NOT IN ('completed', 'cancelled') THEN 1 END) as overdue,
        COUNT(CASE WHEN due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '3 days' AND status NOT IN ('completed', 'cancelled') THEN 1 END) as due_soon
      FROM operations_tasks
      ${whereClause}
    `, queryParams);

    res.json({
      success: true,
      tasks: result.rows,
      stats: statsResult.rows[0]
    });

  } catch (error) {
    logger.error('Error fetching tasks:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tasks'
    });
  }
});

// GET /api/tasks/:id - Get single task with comments
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const taskResult = await query(`
      SELECT
        t.*,
        p.name as assigned_poc_name,
        p.poc_type,
        u.name as assigned_user_name,
        c.name as club_name
      FROM operations_tasks t
      LEFT JOIN poc_structure p ON t.assigned_to_poc_id = p.id
      LEFT JOIN users u ON t.assigned_to_user_id = u.id
      LEFT JOIN clubs c ON t.club_id = c.id
      WHERE t.id = $1
    `, [id]);

    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const commentsResult = await query(`
      SELECT * FROM task_comments
      WHERE task_id = $1
      ORDER BY created_at ASC
    `, [id]);

    res.json({
      success: true,
      task: taskResult.rows[0],
      comments: commentsResult.rows
    });

  } catch (error) {
    logger.error('Error fetching task:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch task'
    });
  }
});

// POST /api/tasks - Create new task
router.post('/', async (req, res) => {
  try {
    const {
      title,
      description,
      assigned_to_poc_id,
      assigned_to_user_id,
      priority = 'medium',
      due_date,
      club_id,
      activity,
      city,
      created_by = 'System'
    } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const result = await query(`
      INSERT INTO operations_tasks
      (title, description, assigned_to_poc_id, assigned_to_user_id, priority, due_date, club_id, activity, city, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [title, description, assigned_to_poc_id, assigned_to_user_id, priority, due_date, club_id, activity, city, created_by]);

    res.status(201).json({
      success: true,
      task: result.rows[0]
    });

  } catch (error) {
    logger.error('Error creating task:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create task'
    });
  }
});

// PUT /api/tasks/:id - Update task
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      assigned_to_poc_id,
      assigned_to_user_id,
      priority,
      status,
      due_date,
      activity,
      city
    } = req.body;

    // If status is being set to completed, set completed_at
    const completedAt = status === 'completed' ? 'CURRENT_TIMESTAMP' : null;

    const result = await query(`
      UPDATE operations_tasks
      SET
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        assigned_to_poc_id = COALESCE($3, assigned_to_poc_id),
        assigned_to_user_id = COALESCE($4, assigned_to_user_id),
        priority = COALESCE($5, priority),
        status = COALESCE($6, status),
        due_date = COALESCE($7, due_date),
        activity = COALESCE($8, activity),
        city = COALESCE($9, city),
        completed_at = CASE WHEN $6 = 'completed' THEN CURRENT_TIMESTAMP ELSE completed_at END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $10
      RETURNING *
    `, [title, description, assigned_to_poc_id, assigned_to_user_id, priority, status, due_date, activity, city, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json({
      success: true,
      task: result.rows[0]
    });

  } catch (error) {
    logger.error('Error updating task:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update task'
    });
  }
});

// DELETE /api/tasks/:id - Delete task
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(`
      DELETE FROM operations_tasks
      WHERE id = $1
      RETURNING *
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json({
      success: true,
      message: 'Task deleted successfully'
    });

  } catch (error) {
    logger.error('Error deleting task:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete task'
    });
  }
});

// POST /api/tasks/:id/comments - Add comment to task
router.post('/:id/comments', async (req, res) => {
  try {
    const { id } = req.params;
    const { author_name, comment_text } = req.body;

    if (!author_name || !comment_text) {
      return res.status(400).json({ error: 'Author name and comment text are required' });
    }

    const result = await query(`
      INSERT INTO task_comments (task_id, author_name, comment_text)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [id, author_name, comment_text]);

    res.status(201).json({
      success: true,
      comment: result.rows[0]
    });

  } catch (error) {
    logger.error('Error adding comment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add comment'
    });
  }
});


// GET /api/tasks/assignees/pocs - Get list of POCs for assignment dropdown
router.get('/assignees/pocs', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        id,
        name,
        poc_type,
        activities,
        cities,
        team_name,
        email,
        phone
      FROM poc_structure
      WHERE is_active = true
      ORDER BY name
    `);

    res.json({
      success: true,
      pocs: result.rows
    });

  } catch (error) {
    logger.error('Error fetching POCs for assignment:', error);

    // If poc_structure table doesn't exist, return empty list
    if (error instanceof Error && error.message.includes('poc_structure') && error.message.includes('does not exist')) {
      logger.warn('poc_structure table does not exist in production database, returning empty POCs list');
      res.json({
        success: true,
        pocs: [],
        message: 'POC structure not configured in this database'
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: 'Failed to fetch POCs for assignment',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/tasks/assignees/users - Get list of users for assignment dropdown
router.get('/assignees/users', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        id,
        name,
        email,
        role,
        city,
        activity
      FROM users
      ORDER BY name
    `);

    res.json({
      success: true,
      users: result.rows
    });

  } catch (error) {
    logger.error('Error fetching users for assignment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users'
    });
  }
});

export default router;