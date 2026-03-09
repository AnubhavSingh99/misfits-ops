import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { queryProduction } from '../services/database';
import { validateTransition } from '../services/startYourClub/stateMachine';
import { broadcast } from '../services/startYourClub/sseManager';
import { logger } from '../utils/logger';
import type { ClubApplicationStatus, ScreeningRatings, RejectionReason } from '../../../shared/types';

// Map production column names to frontend-expected names
function mapAppRow(row: any) {
  if (!row) return row;
  if (row.pk != null) row.id = row.pk;
  // Map production column names to ops frontend names
  if (row.split_snapshot !== undefined) row.split_percentage = row.split_snapshot;
  if (row.contract_pdf_url !== undefined) row.contract_url = row.contract_pdf_url;
  if (row.city_name !== undefined) row.city = row.city_name;
  if (row.activity_name !== undefined) row.activity = row.activity_name;
  return row;
}
function mapAppRows(rows: any[]) {
  return rows.map(mapAppRow);
}

// Contract file upload setup
const UPLOADS_DIR = path.join(__dirname, '../../uploads/contracts');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const contractUpload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const id = req.params.id;
      const type = req.path.includes('signed') ? 'signed' : 'unsigned';
      cb(null, `${id}-${type}-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only PDF, DOC, DOCX, JPG, PNG files are allowed'));
  },
});

const router = Router();

// Helper: record a status event
async function recordStatusEvent(
  applicationId: string | number,
  fromStatus: string | null,
  toStatus: string,
  actor: 'applicant' | 'admin' | 'system',
  metadata: Record<string, any> = {}
) {
  await queryProduction(
    `INSERT INTO club_application_status_event (application_id, from_status, to_status, actor, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [applicationId, fromStatus, toStatus, actor, JSON.stringify(metadata)]
  );
}

// GET /admin/all — List all applications (filterable, sortable, paginated)
router.get('/admin/all', async (req: Request, res: Response) => {
  try {
    const {
      status, city, activity, search,
      sort = 'created_at', order = 'desc',
      page = '1', limit = '50',
      archived
    } = req.query;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    // Default: hide archived
    if (archived !== 'true') {
      conditions.push(`archived = false`);
    }

    if (status) {
      conditions.push(`ca.status = $${paramIdx++}`);
      params.push(status);
    }
    if (city) {
      conditions.push(`ca.city_name = $${paramIdx++}`);
      params.push(city);
    }
    if (activity) {
      conditions.push(`ca.activity_name = $${paramIdx++}`);
      params.push(activity);
    }
    if (search) {
      conditions.push(`(ca.name ILIKE $${paramIdx} OR CONCAT(u.first_name, ' ', u.last_name) ILIKE $${paramIdx} OR ca.city_name ILIKE $${paramIdx} OR ca.activity_name ILIKE $${paramIdx})`);
      params.push(`%${search}%`);
      paramIdx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const allowedSorts = ['created_at', 'updated_at', 'submitted_at', 'name', 'city', 'activity', 'status'];
    const sortCol = allowedSorts.includes(sort as string) ? sort : 'created_at';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';
    const sortPrefix = sortCol === 'name' ? "COALESCE(ca.name, CONCAT(u.first_name, ' ', u.last_name))" : `ca.${sortCol}`;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    const countResult = await queryProduction(
      `SELECT COUNT(*) FROM club_application ca LEFT JOIN users u ON u.pk = ca.user_id ${where}`, params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await queryProduction(
      `SELECT ca.*, COALESCE(ca.name, CONCAT(u.first_name, ' ', u.last_name)) as name FROM club_application ca LEFT JOIN users u ON u.pk = ca.user_id ${where}
       ORDER BY ${sortPrefix} ${sortOrder}
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, limitNum, offset]
    );

    res.json({
      success: true,
      data: mapAppRows(dataResult.rows),
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error: any) {
    logger.error('Failed to list applications:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /admin/funnel — Funnel stats
router.get('/admin/funnel', async (req: Request, res: Response) => {
  try {
    const result = await queryProduction(
      `SELECT status, COUNT(*)::int as count
       FROM club_application
       WHERE archived = false
       GROUP BY status
       ORDER BY count DESC`
    );

    const byCity = await queryProduction(
      `SELECT city, COUNT(*)::int as count
       FROM club_application
       WHERE archived = false AND city IS NOT NULL
       GROUP BY city
       ORDER BY count DESC`
    );

    const byActivity = await queryProduction(
      `SELECT activity, COUNT(*)::int as count
       FROM club_application
       WHERE archived = false AND activity IS NOT NULL
       GROUP BY activity
       ORDER BY count DESC`
    );

    res.json({
      success: true,
      data: {
        by_status: result.rows,
        by_city: byCity.rows,
        by_activity: byActivity.rows,
        total: result.rows.reduce((sum: number, r: any) => sum + r.count, 0),
      },
    });
  } catch (error: any) {
    logger.error('Failed to get funnel stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /admin/analytics — Funnel conversion + TAT stats
router.get('/admin/analytics', async (req: Request, res: Response) => {
  try {
    // Funnel counts
    const funnelResult = await queryProduction(`
      SELECT
        COUNT(*) FILTER (WHERE archived = false) as total,
        COUNT(*) FILTER (WHERE status = 'SUBMITTED' AND archived = false) as submitted,
        COUNT(*) FILTER (WHERE status = 'UNDER_REVIEW' AND archived = false) as under_review,
        COUNT(*) FILTER (WHERE status IN ('INTERVIEW_PENDING', 'INTERVIEW_SCHEDULED', 'INTERVIEW_DONE') AND archived = false) as interview_phase,
        COUNT(*) FILTER (WHERE status = 'SELECTED' AND archived = false) as selected,
        COUNT(*) FILTER (WHERE status = 'CLUB_CREATED' AND archived = false) as onboarded,
        COUNT(*) FILTER (WHERE status = 'REJECTED' AND archived = false) as rejected,
        COUNT(*) FILTER (WHERE status = 'ON_HOLD' AND archived = false) as on_hold,
        COUNT(*) FILTER (WHERE status = 'ACTIVE' AND archived = false) as active_journey,
        COUNT(*) FILTER (WHERE status = 'ABANDONED' AND archived = false) as abandoned,
        COUNT(*) FILTER (WHERE status = 'NOT_INTERESTED' AND archived = false) as not_interested,
        COUNT(*) FILTER (WHERE status IN ('ACTIVE', 'ABANDONED', 'NOT_INTERESTED') AND archived = false) as dropped_early,
        COUNT(*) FILTER (WHERE status = 'REJECTED' AND rejected_from_status IN ('SUBMITTED', 'UNDER_REVIEW', 'ON_HOLD') AND archived = false) as rejected_screening,
        COUNT(*) FILTER (WHERE status = 'REJECTED' AND rejected_from_status = 'INTERVIEW_DONE' AND archived = false) as rejected_interview
      FROM club_application
    `);

    // Average TAT per stage (in hours)
    const tatResult = await queryProduction(`
      SELECT
        AVG(EXTRACT(EPOCH FROM (picked_at - submitted_at)) / 3600) FILTER (WHERE picked_at IS NOT NULL AND submitted_at IS NOT NULL) as avg_submit_to_pick_hrs,
        AVG(EXTRACT(EPOCH FROM (interview_started_at - picked_at)) / 3600) FILTER (WHERE interview_started_at IS NOT NULL AND picked_at IS NOT NULL) as avg_pick_to_interview_hrs,
        AVG(EXTRACT(EPOCH FROM (selected_at - interview_started_at)) / 3600) FILTER (WHERE selected_at IS NOT NULL AND interview_started_at IS NOT NULL) as avg_interview_to_select_hrs,
        AVG(EXTRACT(EPOCH FROM (first_call_done_at - selected_at)) / 3600) FILTER (WHERE first_call_done_at IS NOT NULL AND selected_at IS NOT NULL) as avg_select_to_call_hrs,
        AVG(EXTRACT(EPOCH FROM (venue_sorted_at - selected_at)) / 3600) FILTER (WHERE venue_sorted_at IS NOT NULL AND selected_at IS NOT NULL) as avg_select_to_venue_hrs,
        AVG(EXTRACT(EPOCH FROM (marketing_launched_at - selected_at)) / 3600) FILTER (WHERE marketing_launched_at IS NOT NULL AND selected_at IS NOT NULL) as avg_select_to_launch_hrs,
        AVG(EXTRACT(EPOCH FROM (club_created_at - submitted_at)) / 3600) FILTER (WHERE club_created_at IS NOT NULL AND submitted_at IS NOT NULL) as avg_total_pipeline_hrs
      FROM club_application WHERE archived = false
    `);

    // Rejection reasons breakdown (for dropped analysis)
    const rejectionReasonsResult = await queryProduction(`
      SELECT rejection_reason as reason, COUNT(*)::int as count
      FROM club_application
      WHERE status = 'REJECTED' AND archived = false AND rejection_reason IS NOT NULL
      GROUP BY rejection_reason
      ORDER BY count DESC
    `);

    const funnel = funnelResult.rows[0];
    const tat = tatResult.rows[0];

    // Compute conversions
    const total = parseInt(funnel.total) || 0;
    const submitted = parseInt(funnel.submitted) || 0;
    const underReview = parseInt(funnel.under_review) || 0;
    const interviewPhase = parseInt(funnel.interview_phase) || 0;
    const selected = parseInt(funnel.selected) || 0;
    const onboarded = parseInt(funnel.onboarded) || 0;
    const rejected = parseInt(funnel.rejected) || 0;
    const onHold = parseInt(funnel.on_hold) || 0;

    // Pipeline stages (cumulative who reached this stage)
    const reachedSubmitted = submitted + underReview + interviewPhase + selected + onboarded + rejected;
    const reachedInterview = interviewPhase + selected + onboarded + parseInt(funnel.rejected_interview || 0);
    const reachedSelected = selected + onboarded;

    res.json({
      success: true,
      data: {
        funnel: {
          total,
          submitted,
          under_review: underReview,
          interview_phase: interviewPhase,
          selected,
          onboarded,
          rejected,
          on_hold: onHold,
          active_journey: parseInt(funnel.active_journey) || 0,
          abandoned: parseInt(funnel.abandoned) || 0,
          not_interested: parseInt(funnel.not_interested) || 0,
          dropped_early: parseInt(funnel.dropped_early) || 0,
          rejected_screening: parseInt(funnel.rejected_screening) || 0,
          rejected_interview: parseInt(funnel.rejected_interview) || 0,
        },
        conversion: {
          submit_to_interview: reachedSubmitted > 0 ? Math.round((reachedInterview / reachedSubmitted) * 100) : 0,
          interview_to_selected: reachedInterview > 0 ? Math.round((reachedSelected / reachedInterview) * 100) : 0,
          selected_to_onboarded: reachedSelected > 0 ? Math.round((onboarded / reachedSelected) * 100) : 0,
          overall: total > 0 ? Math.round((onboarded / total) * 100) : 0,
        },
        tat: {
          submit_to_pick_hrs: tat.avg_submit_to_pick_hrs ? parseFloat(tat.avg_submit_to_pick_hrs).toFixed(1) : null,
          pick_to_interview_hrs: tat.avg_pick_to_interview_hrs ? parseFloat(tat.avg_pick_to_interview_hrs).toFixed(1) : null,
          interview_to_select_hrs: tat.avg_interview_to_select_hrs ? parseFloat(tat.avg_interview_to_select_hrs).toFixed(1) : null,
          select_to_call_hrs: tat.avg_select_to_call_hrs ? parseFloat(tat.avg_select_to_call_hrs).toFixed(1) : null,
          select_to_venue_hrs: tat.avg_select_to_venue_hrs ? parseFloat(tat.avg_select_to_venue_hrs).toFixed(1) : null,
          select_to_launch_hrs: tat.avg_select_to_launch_hrs ? parseFloat(tat.avg_select_to_launch_hrs).toFixed(1) : null,
          total_pipeline_hrs: tat.avg_total_pipeline_hrs ? parseFloat(tat.avg_total_pipeline_hrs).toFixed(1) : null,
        },
        dropped_analysis: {
          rejection_reasons: rejectionReasonsResult.rows,
        },
      },
    });
  } catch (error: any) {
    logger.error('Failed to get analytics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /admin/rating-dimensions — Fetch active rating dimensions
router.get('/admin/rating-dimensions', async (req: Request, res: Response) => {
  try {
    const result = await queryProduction(
      `SELECT pk as id, key, label, description, step, sort_order
       FROM club_rating_dimension
       WHERE active = true
       ORDER BY step, sort_order`
    );
    const screening = result.rows.filter((r: any) => r.step === 'screening');
    const interview = result.rows.filter((r: any) => r.step === 'interview');
    res.json({ success: true, data: { screening, interview } });
  } catch (error: any) {
    logger.error('Failed to fetch rating dimensions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /admin/rating-dimensions — Add a new rating dimension
router.post('/admin/rating-dimensions', async (req: Request, res: Response) => {
  try {
    const { label, description, step } = req.body;
    if (!label?.trim()) {
      return res.status(400).json({ success: false, error: 'Label is required' });
    }
    if (!description?.trim()) {
      return res.status(400).json({ success: false, error: 'Description is required' });
    }
    if (!['screening', 'interview'].includes(step)) {
      return res.status(400).json({ success: false, error: 'Step must be screening or interview' });
    }
    const key = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const existing = await queryProduction(
      `SELECT pk FROM club_rating_dimension WHERE key = $1 AND step = $2 AND active = true`,
      [key, step]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ success: false, error: `Dimension "${key}" already exists for ${step}` });
    }
    const maxOrder = await queryProduction(
      `SELECT COALESCE(MAX(sort_order), 0) as max_order FROM club_rating_dimension WHERE step = $1 AND active = true`,
      [step]
    );
    const sortOrder = maxOrder.rows[0].max_order + 1;
    const result = await queryProduction(
      `INSERT INTO club_rating_dimension (key, label, description, step, sort_order)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [key, label.trim(), (description || '').trim(), step, sortOrder]
    );
    res.json({ success: true, data: mapAppRow(result.rows[0]) });
  } catch (error: any) {
    logger.error('Failed to add rating dimension:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /admin/rating-dimensions/:id — Soft-delete a rating dimension
router.delete('/admin/rating-dimensions/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await queryProduction(
      `UPDATE club_rating_dimension SET active = false WHERE pk = $1 RETURNING *`,
      [id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Dimension not found' });
    }
    res.json({ success: true, data: mapAppRow(result.rows[0]) });
  } catch (error: any) {
    logger.error('Failed to delete rating dimension:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /admin/cities — Distinct cities for filter dropdown
router.get('/admin/cities', async (req: Request, res: Response) => {
  try {
    const result = await queryProduction(
      `SELECT DISTINCT city_name as city FROM club_application WHERE city_name IS NOT NULL AND archived = false ORDER BY city_name`
    );
    res.json({ success: true, data: result.rows.map((r: any) => r.city) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /admin/activities — Distinct activities for filter dropdown
router.get('/admin/activities', async (req: Request, res: Response) => {
  try {
    const result = await queryProduction(
      `SELECT DISTINCT activity_name as activity FROM club_application WHERE activity_name IS NOT NULL AND archived = false ORDER BY activity_name`
    );
    res.json({ success: true, data: result.rows.map((r: any) => r.activity) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /admin/:id — Full detail for one application
router.get('/admin/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const appResult = await queryProduction(
      `SELECT ca.*, COALESCE(ca.name, CONCAT(u.first_name, ' ', u.last_name)) as name FROM club_application ca LEFT JOIN users u ON u.pk = ca.user_id WHERE ca.pk = $1`, [id]
    );
    if (appResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Application not found' });
    }

    const app = mapAppRow(appResult.rows[0]);

    // Timeline
    const timeline = await queryProduction(
      'SELECT * FROM club_application_status_event WHERE application_id = $1 ORDER BY created_at ASC',
      [id]
    );

    // Activity (notes, calls)
    const activity = await queryProduction(
      'SELECT * FROM club_application_activity WHERE application_id = $1 ORDER BY created_at DESC',
      [id]
    );

    // Past applications (same user_id, archived)
    let pastApps: any[] = [];
    if (app.user_id) {
      const pastResult = await queryProduction(
        'SELECT pk as id, status, city_name as city, activity_name as activity, created_at, archived FROM club_application WHERE user_id = $1 AND pk != $2 ORDER BY created_at DESC',
        [app.user_id, id]
      );
      pastApps = pastResult.rows;
    }

    // Question text map (question_id → question_text) for tooltip display
    let questionMap: Record<string, string> = {};
    if (app.questionnaire_data && typeof app.questionnaire_data === 'object') {
      const qIds = Object.keys(app.questionnaire_data).filter(k => /^\d+$/.test(k));
      if (qIds.length > 0) {
        const qResult = await queryProduction(
          `SELECT pk, question_text FROM club_questionnaire_config WHERE pk = ANY($1::int[])`,
          [qIds.map(Number)]
        );
        for (const row of qResult.rows) {
          questionMap[String(row.pk)] = row.question_text;
        }
      }
    }

    res.json({
      success: true,
      data: {
        ...app,
        question_map: questionMap,
        timeline: mapAppRows(timeline.rows),
        activity_log: mapAppRows(activity.rows),
        past_applications: pastApps,
      },
    });
  } catch (error: any) {
    logger.error('Failed to get application detail:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /admin/:id/pick — "Pick" a submitted application for review (SUBMITTED → UNDER_REVIEW)
router.patch('/admin/:id/pick', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reviewed_by } = req.body;

    if (!reviewed_by?.trim()) {
      return res.status(400).json({ success: false, error: 'reviewed_by (your name) is required' });
    }

    const appResult = await queryProduction('SELECT * FROM club_application WHERE pk = $1', [id]);
    if (appResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Application not found' });
    }

    const app = appResult.rows[0];
    if (app.status !== 'SUBMITTED') {
      return res.status(400).json({ success: false, error: `Can only pick from SUBMITTED status, current: ${app.status}` });
    }

    await queryProduction(
      `UPDATE club_application SET status = 'UNDER_REVIEW', picked_at = NOW(), updated_at = NOW() WHERE pk = $1`,
      [id]
    );

    await recordStatusEvent(id, 'SUBMITTED', 'UNDER_REVIEW', 'admin', { reviewed_by: reviewed_by.trim() });
    broadcast('application_updated', { id, status: 'UNDER_REVIEW' });
    res.json({ success: true, data: { id, status: 'UNDER_REVIEW', reviewed_by: reviewed_by.trim() } });
  } catch (error: any) {
    logger.error('Failed to pick application:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /admin/:id/review — 3-outcome review (select-for-interview / reject / on-hold)
// ALL actions require screening ratings. Also handles SUBMITTED directly (sets reviewed_by).
router.patch('/admin/:id/review', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { action, ratings, rejection_reason, rejection_note, reviewed_by } = req.body;

    const appResult = await queryProduction('SELECT * FROM club_application WHERE pk = $1', [id]);
    if (appResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Application not found' });
    }

    const app = appResult.rows[0];
    let toStatus: ClubApplicationStatus;

    if (action === 'select_for_interview') {
      toStatus = 'INTERVIEW_PENDING';
    } else if (action === 'reject') {
      toStatus = 'REJECTED';
    } else if (action === 'on_hold') {
      toStatus = 'ON_HOLD';
    } else {
      return res.status(400).json({ success: false, error: 'Invalid action. Must be select_for_interview, reject, or on_hold' });
    }

    // If coming from SUBMITTED, require reviewed_by
    if (app.status === 'SUBMITTED' && !reviewed_by?.trim()) {
      return res.status(400).json({ success: false, error: 'Your name (reviewed_by) is required when reviewing from Submitted' });
    }

    const validation = validateTransition({
      from: app.status,
      to: toStatus,
      actor: 'admin',
      ratings: ratings as ScreeningRatings,
      rejectionReason: rejection_reason as RejectionReason,
    });

    if (!validation.valid) {
      return res.status(400).json({ success: false, error: validation.error });
    }

    // Build update
    const updates: string[] = ['status = $2', 'updated_at = NOW()'];
    const updateParams: any[] = [id, toStatus];
    let paramIdx = 3;

    if (ratings) {
      updates.push(`screening_ratings = $${paramIdx++}`);
      updateParams.push(JSON.stringify(ratings));
    }
    if (rejection_reason) {
      updates.push(`rejection_reason = $${paramIdx++}`);
      updateParams.push(rejection_reason);
    }
    // Set picked_at when coming from SUBMITTED
    if (reviewed_by?.trim()) {
      updates.push('picked_at = NOW()');
    }
    // Track which stage they were rejected from
    if (toStatus === 'REJECTED') {
      updates.push(`rejected_from_status = $${paramIdx++}`);
      updateParams.push(app.status);
    }
    // Track interview start time
    if (toStatus === 'INTERVIEW_PENDING') {
      updates.push('interview_started_at = NOW()');
    }

    await queryProduction(
      `UPDATE club_application SET ${updates.join(', ')} WHERE pk = $1`,
      updateParams
    );

    await recordStatusEvent(id, app.status, toStatus, 'admin', {
      action,
      ...(ratings && { ratings }),
      ...(rejection_reason && { rejection_reason }),
      ...(rejection_note && { rejection_note }),
      ...(reviewed_by && { reviewed_by: reviewed_by.trim() }),
    });

    broadcast('application_updated', { id, status: toStatus });
    res.json({ success: true, data: { id, status: toStatus } });
  } catch (error: any) {
    logger.error('Failed to review application:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /admin/:id/status — General status transition
router.patch('/admin/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { to_status, actor = 'admin', metadata = {} } = req.body;

    const appResult = await queryProduction('SELECT * FROM club_application WHERE pk = $1', [id]);
    if (appResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Application not found' });
    }

    const app = appResult.rows[0];
    const validation = validateTransition({
      from: app.status,
      to: to_status,
      actor,
      ratings: metadata.ratings,
      interviewRatings: metadata.interview_ratings,
      rejectionReason: metadata.rejection_reason,
    });

    if (!validation.valid) {
      return res.status(400).json({ success: false, error: validation.error });
    }

    const updates: string[] = ['status = $2', 'updated_at = NOW()'];
    const params: any[] = [id, to_status];
    let paramIdx = 3;

    // Set timestamps based on status
    if (to_status === 'SUBMITTED') {
      updates.push('submitted_at = NOW()');
    } else if (to_status === 'SELECTED') {
      updates.push('selected_at = NOW()');
    } else if (to_status === 'CLUB_CREATED') {
      updates.push('club_created_at = NOW()');
    }

    if (metadata.rejection_reason) {
      updates.push(`rejection_reason = $${paramIdx++}`);
      params.push(metadata.rejection_reason);
    }
    if (metadata.ratings) {
      updates.push(`screening_ratings = $${paramIdx++}`);
      params.push(JSON.stringify(metadata.ratings));
    }
    if (metadata.interview_ratings) {
      updates.push(`interview_ratings = $${paramIdx++}`);
      params.push(JSON.stringify(metadata.interview_ratings));
    }

    await queryProduction(`UPDATE club_application SET ${updates.join(', ')} WHERE pk = $1`, params);
    await recordStatusEvent(id, app.status, to_status, actor, metadata);

    broadcast('application_updated', { id, status: to_status });
    res.json({ success: true, data: { id, status: to_status } });
  } catch (error: any) {
    logger.error('Failed to update status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /admin/:id/select — Select applicant + assign split (requires interview_ratings)
router.post('/admin/:id/select', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { split_percentage, interview_ratings } = req.body;

    const appResult = await queryProduction('SELECT * FROM club_application WHERE pk = $1', [id]);
    if (appResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Application not found' });
    }

    const app = appResult.rows[0];
    if (app.status !== 'INTERVIEW_DONE') {
      return res.status(400).json({ success: false, error: 'Can only select from INTERVIEW_DONE status' });
    }

    // Validate split percentages add to 100
    if (split_percentage) {
      const m = Number(split_percentage.misfits);
      const l = Number(split_percentage.leader);
      if (isNaN(m) || isNaN(l) || m + l !== 100) {
        return res.status(400).json({ success: false, error: 'Split percentages must add up to 100' });
      }
    }

    // Validate interview ratings required
    const validation = validateTransition({
      from: 'INTERVIEW_DONE',
      to: 'SELECTED',
      actor: 'admin',
      interviewRatings: interview_ratings,
    });
    if (!validation.valid) {
      return res.status(400).json({ success: false, error: validation.error });
    }

    await queryProduction(
      `UPDATE club_application
       SET status = 'SELECTED', split_snapshot = $2, interview_ratings = $3, selected_at = NOW(), updated_at = NOW()
       WHERE pk = $1`,
      [id, JSON.stringify(split_percentage || { misfits: 70, leader: 30 }), JSON.stringify(interview_ratings)]
    );

    await recordStatusEvent(id, 'INTERVIEW_DONE', 'SELECTED', 'admin', { split_percentage, interview_ratings });
    broadcast('application_updated', { id, status: 'SELECTED' });
    res.json({ success: true, data: { id, status: 'SELECTED' } });
  } catch (error: any) {
    logger.error('Failed to select applicant:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /admin/:id/split — Update revenue split
router.patch('/admin/:id/split', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { misfits, leader } = req.body;

    if (misfits == null || leader == null || misfits + leader !== 100) {
      return res.status(400).json({ success: false, error: 'Split must add up to 100%' });
    }

    const appResult = await queryProduction('SELECT status FROM club_application WHERE pk = $1', [id]);
    if (appResult.rows.length === 0) return res.status(404).json({ success: false, error: 'Application not found' });
    if (!['SELECTED', 'CLUB_CREATED'].includes(appResult.rows[0].status)) {
      return res.status(400).json({ success: false, error: 'Split can only be updated for selected/onboarded applications' });
    }

    await queryProduction(
      `UPDATE club_application SET split_snapshot = $2, updated_at = NOW() WHERE pk = $1`,
      [id, JSON.stringify({ misfits, leader })]
    );

    broadcast('application_updated', { id, type: 'split_updated' });
    res.json({ success: true, data: { split_percentage: { misfits, leader } } });
  } catch (error: any) {
    logger.error('Failed to update split:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /admin/:id/milestones — Toggle milestones
router.patch('/admin/:id/milestones', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { first_call_done, venue_sorted, toolkit_shared, marketing_launched, contract_url } = req.body;

    const appResult = await queryProduction('SELECT * FROM club_application WHERE pk = $1', [id]);
    if (appResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Application not found' });
    }

    const app = appResult.rows[0];
    if (app.status !== 'SELECTED') {
      return res.status(400).json({ success: false, error: 'Milestones can only be updated for SELECTED applications' });
    }

    const updates: string[] = ['updated_at = NOW()'];
    const params: any[] = [id];
    let paramIdx = 2;

    if (first_call_done !== undefined) {
      updates.push(`first_call_done = $${paramIdx++}`);
      params.push(first_call_done);
      if (first_call_done) updates.push('first_call_done_at = NOW()');
      else updates.push('first_call_done_at = NULL');
    }
    if (venue_sorted !== undefined) {
      updates.push(`venue_sorted = $${paramIdx++}`);
      params.push(venue_sorted);
      if (venue_sorted) updates.push('venue_sorted_at = NOW()');
      else updates.push('venue_sorted_at = NULL');
    }
    if (toolkit_shared !== undefined) {
      updates.push(`toolkit_shared = $${paramIdx++}`);
      params.push(toolkit_shared);
      if (toolkit_shared) updates.push('toolkit_shared_at = NOW()');
      else updates.push('toolkit_shared_at = NULL');
    }
    if (contract_url !== undefined) {
      updates.push(`contract_url = $${paramIdx++}`);
      params.push(contract_url || null);
    }
    if (marketing_launched !== undefined) {
      // Gate: marketing_launched can only be set to true if first_call_done AND venue_sorted AND split saved
      if (marketing_launched === true) {
        const fcDone = first_call_done !== undefined ? first_call_done : app.first_call_done;
        const vsDone = venue_sorted !== undefined ? venue_sorted : app.venue_sorted;
        if (!fcDone || !vsDone) {
          return res.status(400).json({ success: false, error: 'First call and venue must be completed before marketing launch' });
        }
        if (!app.split_snapshot) {
          return res.status(400).json({ success: false, error: 'Revenue split must be saved before marketing launch' });
        }
      }
      updates.push(`marketing_launched = $${paramIdx++}`);
      params.push(marketing_launched);
      if (marketing_launched) updates.push('marketing_launched_at = NOW()');
      else updates.push('marketing_launched_at = NULL');
    }

    await queryProduction(`UPDATE club_application SET ${updates.join(', ')} WHERE pk = $1`, params);

    // If marketing_launched is true and all milestones done → auto-transition to CLUB_CREATED
    const updatedResult = await queryProduction('SELECT * FROM club_application WHERE pk = $1', [id]);
    const updated = updatedResult.rows[0];
    if (updated.first_call_done && updated.venue_sorted && updated.marketing_launched) {
      await queryProduction(
        `UPDATE club_application SET status = 'CLUB_CREATED', club_created_at = NOW(), updated_at = NOW() WHERE pk = $1`,
        [id]
      );
      await recordStatusEvent(id, 'SELECTED', 'CLUB_CREATED', 'admin', { trigger: 'all_milestones_complete' });
      broadcast('application_updated', { id, status: 'CLUB_CREATED' });
      return res.json({ success: true, data: { id, status: 'CLUB_CREATED', milestones_complete: true } });
    }

    broadcast('application_updated', { id, status: 'SELECTED' });
    res.json({ success: true, data: { id, milestones: { first_call_done: updated.first_call_done, venue_sorted: updated.venue_sorted, toolkit_shared: updated.toolkit_shared, marketing_launched: updated.marketing_launched, contract_url: updated.contract_url } } });
  } catch (error: any) {
    logger.error('Failed to update milestones:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /admin/:id/note — Add note
router.post('/admin/:id/note', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    if (!content?.trim()) {
      return res.status(400).json({ success: false, error: 'Note content is required' });
    }

    const result = await queryProduction(
      `INSERT INTO club_application_activity (application_id, type, content, created_by)
       VALUES ($1, 'note', $2, 0) RETURNING *`,
      [id, content.trim()]
    );

    broadcast('activity_added', { application_id: id, type: 'note' });
    res.json({ success: true, data: mapAppRow(result.rows[0]) });
  } catch (error: any) {
    logger.error('Failed to add note:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /admin/:id/call-log — Log a call
router.post('/admin/:id/call-log', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { duration, outcome, notes } = req.body;

    const result = await queryProduction(
      `INSERT INTO club_application_activity (application_id, type, content, metadata, created_by)
       VALUES ($1, 'call', $2, $3, 0) RETURNING *`,
      [id, notes || '', JSON.stringify({ duration, outcome })]
    );

    broadcast('activity_added', { application_id: id, type: 'call' });
    res.json({ success: true, data: mapAppRow(result.rows[0]) });
  } catch (error: any) {
    logger.error('Failed to log call:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /admin/:id/reject — Blanket reject from any non-terminal status
router.patch('/admin/:id/reject', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { rejection_reason, rejection_note, ratings, interview_ratings } = req.body;

    if (!rejection_reason) {
      return res.status(400).json({ success: false, error: 'Rejection reason is required' });
    }

    const appResult = await queryProduction('SELECT * FROM club_application WHERE pk = $1', [id]);
    if (appResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Application not found' });
    }

    const app = appResult.rows[0];
    const validation = validateTransition({
      from: app.status,
      to: 'REJECTED',
      actor: 'admin',
      rejectionReason: rejection_reason,
      ratings,
      interviewRatings: interview_ratings,
    });

    if (!validation.valid) {
      return res.status(400).json({ success: false, error: validation.error });
    }

    const updates: string[] = ['status = $2', 'rejection_reason = $3', `rejected_from_status = $4`, 'updated_at = NOW()'];
    const params: any[] = [id, 'REJECTED', rejection_reason, app.status];
    let paramIdx = 5;

    if (ratings) {
      updates.push(`screening_ratings = $${paramIdx++}`);
      params.push(JSON.stringify(ratings));
    }
    if (interview_ratings) {
      updates.push(`interview_ratings = $${paramIdx++}`);
      params.push(JSON.stringify(interview_ratings));
    }

    await queryProduction(`UPDATE club_application SET ${updates.join(', ')} WHERE pk = $1`, params);

    await recordStatusEvent(id, app.status, 'REJECTED', 'admin', { rejection_reason, rejection_note, ratings, interview_ratings });
    broadcast('application_updated', { id, status: 'REJECTED' });
    res.json({ success: true, data: { id, status: 'REJECTED' } });
  } catch (error: any) {
    logger.error('Failed to reject application:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /admin/bulk-archive — Archive multiple applications (ON_HOLD protected)
router.post('/admin/bulk-archive', async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;

    if (!ids?.length) {
      return res.status(400).json({ success: false, error: 'No application IDs provided' });
    }

    // Block archiving for high-investment statuses (Interview Phase + Selected + Onboarded)
    const blockedStatuses = ['INTERVIEW_PENDING', 'INTERVIEW_SCHEDULED', 'INTERVIEW_DONE', 'SELECTED', 'CLUB_CREATED'];
    const blockedCheck = await queryProduction(
      `SELECT pk, status FROM club_application WHERE pk = ANY($1::bigint[]) AND status = ANY($2)`,
      [ids, blockedStatuses]
    );

    if (blockedCheck.rows.length > 0) {
      const details = blockedCheck.rows.map((r: any) => `${r.pk} (${r.status})`).join(', ');
      return res.status(400).json({
        success: false,
        error: `Cannot archive applications in active pipeline stages: ${details}. Move to ON_HOLD first.`,
        blocked_ids: blockedCheck.rows.map((r: any) => r.pk),
      });
    }

    const result = await queryProduction(
      `UPDATE club_application SET archived = true, updated_at = NOW() WHERE pk = ANY($1::bigint[]) RETURNING pk as id`,
      [ids]
    );

    broadcast('applications_archived', { ids: result.rows.map((r: any) => r.id) });
    res.json({ success: true, data: { archived_count: result.rowCount } });
  } catch (error: any) {
    logger.error('Failed to bulk archive:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});


// POST /admin/:id/upload-contract — Upload unsigned contract
router.post('/admin/:id/upload-contract', contractUpload.single('contract'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    // Validate application exists and is SELECTED
    const appResult = await queryProduction('SELECT status FROM club_application WHERE pk = $1', [id]);
    if (appResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Application not found' });
    }
    if (appResult.rows[0].status !== 'SELECTED') {
      return res.status(409).json({ success: false, error: 'Contracts can only be uploaded for SELECTED applications' });
    }

    const contractUrl = `/api/start-club/contracts/${file.filename}`;

    await queryProduction(
      `UPDATE club_application SET contract_pdf_url = $2, contract_uploaded_at = NOW(), updated_at = NOW() WHERE pk = $1`,
      [id, contractUrl]
    );

    broadcast('application_updated', { id, type: 'contract_uploaded' });
    res.json({ success: true, data: { contract_url: contractUrl, filename: file.originalname } });
  } catch (error: any) {
    logger.error('Failed to upload contract:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /admin/:id/upload-signed-contract — Upload signed contract
router.post('/admin/:id/upload-signed-contract', contractUpload.single('contract'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const signedUrl = `/api/start-club/contracts/${file.filename}`;

    await queryProduction(
      `UPDATE club_application SET signed_contract_url = $2, signed_contract_uploaded_at = NOW(), updated_at = NOW() WHERE pk = $1`,
      [id, signedUrl]
    );

    broadcast('application_updated', { id, type: 'signed_contract_uploaded' });
    res.json({ success: true, data: { signed_contract_url: signedUrl } });
  } catch (error: any) {
    logger.error('Failed to upload signed contract:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /contracts/:filename — Serve contract files (public, shareable)
router.get('/contracts/:filename', (req: Request, res: Response) => {
  // Prevent path traversal — only allow alphanumeric, hyphens, underscores, dots
  const filename = path.basename(req.params.filename);
  if (filename !== req.params.filename || filename.includes('..')) {
    return res.status(400).json({ success: false, error: 'Invalid filename' });
  }
  const filePath = path.join(UPLOADS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: 'File not found' });
  }
  res.sendFile(filePath);
});

// ══════════════════════════════════════════
//  MANUAL LEAD CREATION
// ══════════════════════════════════════════

// GET /admin/lookup-user — Look up a user by phone number
router.get('/admin/lookup-user', async (req: Request, res: Response) => {
  try {
    const { phone } = req.query;
    if (!phone || typeof phone !== 'string' || phone.trim().length < 10) {
      return res.status(400).json({ success: false, error: 'Valid phone number is required' });
    }

    const result = await queryProduction(
      `SELECT pk, first_name, last_name, phone FROM users WHERE phone = $1 AND is_deleted = false`,
      [phone.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found. Ask them to download the app and log in first.',
      });
    }

    const user = result.rows[0];
    res.json({
      success: true,
      data: {
        user_id: user.pk,
        first_name: user.first_name,
        last_name: user.last_name || '',
        phone: user.phone,
      },
    });
  } catch (error: any) {
    logger.error('Failed to look up user:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /admin/create-lead — Create a manual lead from admin dashboard
router.post('/admin/create-lead', async (req: Request, res: Response) => {
  try {
    const { phone, first_name, last_name, city, activity, target_status } = req.body;

    // Validate required fields
    if (!phone?.trim() || !first_name?.trim() || !city?.trim() || !activity?.trim() || !target_status) {
      return res.status(400).json({
        success: false,
        error: 'Phone, first name, city, activity, and target status are required',
      });
    }

    // Validate target_status
    const allowedStatuses = ['SUBMITTED', 'UNDER_REVIEW', 'INTERVIEW_PENDING', 'INTERVIEW_SCHEDULED', 'INTERVIEW_DONE', 'SELECTED'];
    if (!allowedStatuses.includes(target_status)) {
      return res.status(400).json({
        success: false,
        error: `Target status must be one of: ${allowedStatuses.join(', ')}`,
      });
    }

    // Look up user by phone
    const userResult = await queryProduction(
      `SELECT pk FROM users WHERE phone = $1 AND is_deleted = false`,
      [phone.trim()]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found. Ask them to download the app and log in first.',
      });
    }
    const userId = userResult.rows[0].pk;

    // Check for existing active application
    const existingResult = await queryProduction(
      `SELECT pk FROM club_application WHERE user_id = $1 AND archived = false LIMIT 1`,
      [userId]
    );
    if (existingResult.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'User already has an active application',
        existing_id: existingResult.rows[0].pk,
      });
    }

    // Build the INSERT with status-dependent timestamps
    const name = `${first_name.trim()} ${(last_name || '').trim()}`.trim();

    // Determine which timestamps to set based on target status
    const statusOrder = ['SUBMITTED', 'UNDER_REVIEW', 'INTERVIEW_PENDING', 'INTERVIEW_SCHEDULED', 'INTERVIEW_DONE', 'SELECTED'];
    const targetIdx = statusOrder.indexOf(target_status);

    const extraCols: string[] = [];
    const extraVals: string[] = [];
    const extraParams: any[] = [];
    let paramIdx = 7; // first 6 params are: user_id, name, city, activity, status, source

    // Always set submitted_at for admin-created leads
    extraCols.push('submitted_at');
    extraVals.push('NOW()');

    if (targetIdx >= 1) { // UNDER_REVIEW or beyond
      extraCols.push('picked_at');
      extraVals.push('NOW()');
    }
    if (targetIdx >= 2) { // INTERVIEW_PENDING or beyond
      extraCols.push('interview_started_at');
      extraVals.push('NOW()');
    }

    const insertResult = await queryProduction(
      `INSERT INTO club_application (
        user_id, name, city, activity, status, source,
        admin_created, admin_created_by,
        ${extraCols.join(', ')},
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        true, 'admin',
        ${extraVals.join(', ')},
        NOW(), NOW()
      ) RETURNING *`,
      [userId, name, city.trim(), activity.trim(), target_status, 'admin']
    );

    const created = mapAppRow(insertResult.rows[0]);

    // Record status event
    await recordStatusEvent(created.id, null, target_status, 'admin', {
      admin_created: true,
      first_name: first_name.trim(),
      last_name: (last_name || '').trim(),
    });

    broadcast('application_updated', { id: created.id, status: target_status });

    res.json({ success: true, data: created });
  } catch (error: any) {
    logger.error('Failed to create lead:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ══════════════════════════════════════════
//  RESCHEDULE
// ══════════════════════════════════════════

// PATCH /admin/:id/reschedule — Move INTERVIEW_SCHEDULED back to INTERVIEW_PENDING
router.patch('/admin/:id/reschedule', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Fetch application
    const appResult = await queryProduction(
      `SELECT * FROM club_application WHERE pk = $1`,
      [id]
    );
    if (appResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Application not found' });
    }

    const app = appResult.rows[0];
    if (app.status !== 'INTERVIEW_SCHEDULED') {
      return res.status(400).json({
        success: false,
        error: `Can only reschedule from INTERVIEW_SCHEDULED, current status: ${app.status}`,
      });
    }

    // Clear calendly fields and transition status
    await queryProduction(
      `UPDATE club_application
       SET status = 'INTERVIEW_PENDING',
           calendly_event_uri = NULL,
           calendly_invitee_uri = NULL,
           interview_scheduled_at = NULL,
           calendly_meet_link = NULL,
           updated_at = NOW()
       WHERE pk = $1`,
      [id]
    );

    // Record status event
    await recordStatusEvent(id, 'INTERVIEW_SCHEDULED', 'INTERVIEW_PENDING', 'admin', {
      reason: 'reschedule',
      previous_scheduled_at: app.interview_scheduled_at,
    });

    broadcast('application_updated', { id, status: 'INTERVIEW_PENDING' });

    res.json({ success: true, data: { id, status: 'INTERVIEW_PENDING' } });
  } catch (error: any) {
    logger.error('Failed to reschedule:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
