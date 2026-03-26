import { Pool, PoolClient } from 'pg';
import { logger } from '../utils/logger';

let pool: Pool;
let misfitsPool: Pool;

export function initUserSafetyService(opsDbPool: Pool, misfitsDbPool: Pool) {
  pool = opsDbPool;
  misfitsPool = misfitsDbPool;
}

export interface UserSafetyReport {
  id: number;
  report_id: number;
  reporter_user_id: number;
  reporter_name: string | null;
  reporter_contact: string | null;
  reported_user_id: number;
  reported_name: string | null;
  reported_contact: string | null;
  reason: string;
  description: string | null;
  image_urls: string[];
  status: 'created' | 'in_progress' | 'resolved';
  assigned_to: string | null;
  resolution_notes: string | null;
  reported_user_blocked: boolean;
  created_at: Date;
  updated_at: Date;
  resolved_at: Date | null;
  synced_at: Date;
}

export interface UserSafetyReportFilters {
  status?: string;
  reported_user_id?: number;
  reporter_user_id?: number;
  limit?: number;
  offset?: number;
}

/**
 * Sync user reports from misfits database to ops database
 * Fetches new reports and updates existing ones
 */
export async function syncUserReports(): Promise<{ synced: number; errors: number }> {
  const client = await pool.connect();
  try {
    logger.info('Starting user safety reports sync from misfits database');

    // Get all reports from misfits DB
    const misfitsReports = await misfitsPool.query(`
      SELECT
        ur.id,
        ur.reporter_id,
        ur.reported_id,
        ur.reason,
        ur.description,
        ur.image_urls,
        ur.created_at,
        ur.updated_at,
        reporter.first_name || ' ' || COALESCE(reporter.last_name, '') as reporter_name,
        reporter.phone as reporter_contact,
        reported.first_name || ' ' || COALESCE(reported.last_name, '') as reported_name,
        reported.phone as reported_contact,
        reported.is_blocked as reported_user_blocked
      FROM user_reports ur
      LEFT JOIN users reporter ON ur.reporter_id = reporter.pk
      LEFT JOIN users reported ON ur.reported_id = reported.pk
      ORDER BY ur.created_at DESC
    `);

    let synced = 0;
    let errors = 0;

    for (const report of misfitsReports.rows) {
      try {
        // Upsert into ops database
        await client.query(`
          INSERT INTO user_safety_reports (
            report_id,
            reporter_user_id,
            reporter_name,
            reporter_contact,
            reported_user_id,
            reported_name,
            reported_contact,
            reason,
            description,
            image_urls,
            reported_user_blocked,
            created_at,
            updated_at,
            synced_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
          ON CONFLICT (report_id)
          DO UPDATE SET
            reporter_name = EXCLUDED.reporter_name,
            reporter_contact = EXCLUDED.reporter_contact,
            reported_name = EXCLUDED.reported_name,
            reported_contact = EXCLUDED.reported_contact,
            reported_user_blocked = EXCLUDED.reported_user_blocked,
            updated_at = EXCLUDED.updated_at,
            synced_at = NOW()
        `, [
          report.id,
          report.reporter_id,
          report.reporter_name,
          report.reporter_contact,
          report.reported_id,
          report.reported_name,
          report.reported_contact,
          report.reason,
          report.description,
          report.image_urls,
          report.reported_user_blocked,
          report.created_at,
          report.updated_at
        ]);
        synced++;
      } catch (err) {
        logger.error('Error syncing user safety report', { report_id: report.id, error: err });
        errors++;
      }
    }

    logger.info('User safety reports sync completed', { synced, errors });
    return { synced, errors };

  } catch (error) {
    logger.error('Error in syncUserReports', { error });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get user safety reports with optional filters
 */
export async function getUserSafetyReports(
  filters: UserSafetyReportFilters = {}
): Promise<UserSafetyReport[]> {
  const { status, reported_user_id, reporter_user_id, limit = 500, offset = 0 } = filters;

  const conditions: string[] = ['1=1'];
  const params: any[] = [];
  let paramCount = 1;

  if (status) {
    conditions.push(`status = $${paramCount}`);
    params.push(status);
    paramCount++;
  }

  if (reported_user_id) {
    conditions.push(`reported_user_id = $${paramCount}`);
    params.push(reported_user_id);
    paramCount++;
  }

  if (reporter_user_id) {
    conditions.push(`reporter_user_id = $${paramCount}`);
    params.push(reporter_user_id);
    paramCount++;
  }

  const query = `
    SELECT
      id,
      report_id,
      reporter_user_id,
      reporter_name,
      reporter_contact,
      reported_user_id,
      reported_name,
      reported_contact,
      reason,
      description,
      image_urls,
      status,
      assigned_to,
      resolution_notes,
      reported_user_blocked,
      created_at,
      updated_at,
      resolved_at,
      synced_at
    FROM user_safety_reports
    WHERE ${conditions.join(' AND ')}
    ORDER BY
      CASE
        WHEN status = 'created' THEN 1
        WHEN status = 'in_progress' THEN 2
        WHEN status = 'resolved' THEN 3
      END,
      created_at DESC
    LIMIT $${paramCount} OFFSET $${paramCount + 1}
  `;

  params.push(limit, offset);

  try {
    const result = await pool.query(query, params);
    return result.rows;
  } catch (error) {
    logger.error('Error fetching user safety reports', { error, filters });
    throw error;
  }
}

/**
 * Update status of a user safety report
 */
export async function updateReportStatus(
  id: number,
  status: 'created' | 'in_progress' | 'resolved',
  resolutionNotes?: string
): Promise<UserSafetyReport> {
  const params: any[] = [status, id];
  let updateFields = 'status = $1, updated_at = NOW()';

  if (status === 'resolved') {
    updateFields += ', resolved_at = NOW()';
    if (resolutionNotes) {
      updateFields += ', resolution_notes = $3';
      params.splice(1, 0, resolutionNotes);
    }
  }

  const query = `
    UPDATE user_safety_reports
    SET ${updateFields}
    WHERE id = $${params.length}
    RETURNING *
  `;

  try {
    const result = await pool.query(query, params);
    if (result.rows.length === 0) {
      throw new Error(`Report not found: ${id}`);
    }
    logger.info('Updated user safety report status', { id, status });
    return result.rows[0];
  } catch (error) {
    logger.error('Error updating report status', { error, id, status });
    throw error;
  }
}

/**
 * Block a user on the Misfits platform
 */
export async function blockUser(userId: number, reason: string): Promise<void> {
  const client = await misfitsPool.connect();
  try {
    await client.query('BEGIN');

    // Update user's is_blocked status
    const result = await client.query(
      'UPDATE users SET is_blocked = true WHERE pk = $1 RETURNING pk, phone, first_name',
      [userId]
    );

    if (result.rows.length === 0) {
      throw new Error(`User not found: ${userId}`);
    }

    const user = result.rows[0];

    // Update all related safety reports to mark user as blocked
    await pool.query(
      'UPDATE user_safety_reports SET reported_user_blocked = true WHERE reported_user_id = $1',
      [userId]
    );

    await client.query('COMMIT');

    logger.info('User blocked successfully', {
      userId,
      phone: user.phone,
      name: user.first_name,
      reason
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error blocking user', { error, userId, reason });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Unblock a user on the Misfits platform
 */
export async function unblockUser(userId: number): Promise<void> {
  const client = await misfitsPool.connect();
  try {
    await client.query('BEGIN');

    // Update user's is_blocked status
    const result = await client.query(
      'UPDATE users SET is_blocked = false WHERE pk = $1 RETURNING pk, phone, first_name',
      [userId]
    );

    if (result.rows.length === 0) {
      throw new Error(`User not found: ${userId}`);
    }

    const user = result.rows[0];

    // Update all related safety reports to mark user as unblocked
    await pool.query(
      'UPDATE user_safety_reports SET reported_user_blocked = false WHERE reported_user_id = $1',
      [userId]
    );

    await client.query('COMMIT');

    logger.info('User unblocked successfully', {
      userId,
      phone: user.phone,
      name: user.first_name
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error unblocking user', { error, userId });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get dashboard statistics for user safety reports
 */
export async function getSafetyStats(): Promise<{
  total: number;
  open: number;
  in_progress: number;
  resolved: number;
  blocked_users: number;
}> {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'created') as open,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
        COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
        COUNT(DISTINCT reported_user_id) FILTER (WHERE reported_user_blocked = true) as blocked_users
      FROM user_safety_reports
    `);

    return result.rows[0];
  } catch (error) {
    logger.error('Error fetching safety stats', { error });
    throw error;
  }
}

/**
 * Get all blocked users from production database
 */
export async function getBlockedUsers(): Promise<Array<{
  user_id: number;
  name: string;
  phone: string;
  email: string | null;
  blocked_at: Date;
}>> {
  try {
    const result = await misfitsPool.query(`
      SELECT
        pk as user_id,
        first_name || ' ' || COALESCE(last_name, '') as name,
        phone,
        email,
        updated_at as blocked_at
      FROM users
      WHERE is_blocked = true
      ORDER BY updated_at DESC
    `);

    return result.rows;
  } catch (error) {
    logger.error('Error fetching blocked users', { error });
    throw error;
  }
}
