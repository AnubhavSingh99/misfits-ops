import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { queryLocal, queryProduction } from '../services/database';

const router = Router();

// Team activity assignments (mirrors shared/teamConfig.ts)
const BLUE_ACTIVITIES = ['Board Gaming', 'Mafia', 'Quiz'];
const YELLOW_ACTIVITIES = ['Badminton', 'Art', 'Journaling', 'Box Cricket', 'Football'];

function getTeam(activity: string): string {
  if (BLUE_ACTIVITIES.includes(activity)) return 'Blue';
  if (YELLOW_ACTIVITIES.includes(activity)) return 'Yellow';
  return 'Green';
}

function getPoc(team: string): string {
  if (team === 'Yellow') return 'CD';
  if (team === 'Green') return 'Saurabh';
  if (team === 'Blue') return 'Shashwat';
  return '';
}

// GET /api/shark-tank/invites
router.get('/invites', async (req: Request, res: Response) => {
  try {
    const result = await queryLocal(
      `SELECT id, club_name, activity_name, team, leader_name, leader_phone, poc, status, created_at, updated_at
       FROM shark_tank_invites
       ORDER BY
         CASE poc WHEN 'Shashwat' THEN 1 WHEN 'Saurabh' THEN 2 WHEN 'CD' THEN 3 ELSE 4 END,
         club_name, leader_name`
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Failed to fetch shark tank invites:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch invites' });
  }
});

// POST /api/shark-tank/invites/seed - Seed/refresh data from production DB
router.post('/invites/seed', async (req: Request, res: Response) => {
  try {
    // Fetch active club leaders from production
    const prodResult = await queryProduction(`
      SELECT DISTINCT
        cl.name AS club_name,
        a.name AS activity_name,
        TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS leader_name,
        u.phone AS leader_phone
      FROM club cl
      JOIN activity a ON cl.activity_id = a.id
      JOIN groups g ON cl.pk = g.entity_id AND g.entity_type = 'CLUB' AND g.is_deleted = false
      JOIN group_member gm ON g.user_group_id = gm.user_group_id AND gm.role = 'ADMIN' AND gm.is_deleted = false AND gm.is_removed = false
      JOIN users u ON gm.user_id = u.pk AND u.is_deleted = false
      WHERE cl.status = 'ACTIVE'
        AND cl.is_private = false
        AND a.name != 'Test'
      ORDER BY cl.name, leader_name
    `);

    // Clear existing data
    await queryLocal('DELETE FROM shark_tank_invites');

    // Insert new data with team/POC assignments
    let inserted = 0;
    for (const row of prodResult.rows) {
      const team = getTeam(row.activity_name);
      const poc = getPoc(team);
      await queryLocal(
        `INSERT INTO shark_tank_invites (club_name, activity_name, team, leader_name, leader_phone, poc, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'not_done')`,
        [row.club_name, row.activity_name, team, row.leader_name, row.leader_phone, poc]
      );
      inserted++;
    }

    logger.info(`Seeded ${inserted} shark tank invites`);
    res.json({ success: true, count: inserted });
  } catch (error) {
    logger.error('Failed to seed shark tank invites:', error);
    res.status(500).json({ success: false, error: 'Failed to seed invites' });
  }
});

// PUT /api/shark-tank/invites/:id - Update status
router.put('/invites/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['done', 'not_done'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status. Must be done or not_done' });
    }

    await queryLocal(
      `UPDATE shark_tank_invites SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [status, parseInt(id)]
    );

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to update shark tank invite:', error);
    res.status(500).json({ success: false, error: 'Failed to update invite' });
  }
});

export default router;
