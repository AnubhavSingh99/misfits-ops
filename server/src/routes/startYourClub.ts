import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { queryProduction, queryLocal } from '../services/database';
import { broadcast } from '../services/startYourClub/sseManager';
import { misfitsApi } from '../services/startYourClub/misfitsApi';
import { callGrpc } from '../services/grpcClient';
import { logger } from '../utils/logger';

// Map production column names to frontend-expected names
function mapAppRow(row: any) {
  if (!row) return row;
  if (row.pk != null) row.id = row.pk;
  // Map production column names to ops frontend names
  if (row.city_name !== undefined && row.city === undefined) row.city = row.city_name;
  if (row.activity_name !== undefined && row.activity === undefined) row.activity = row.activity_name;
  if (row.club_name !== undefined && row.club === undefined) row.club = row.club_name;
  // Map timestamp columns to boolean flags for frontend compatibility
  if (row.first_call_done === undefined) row.first_call_done = !!row.first_call_done_at;
  if (row.venue_sorted === undefined) row.venue_sorted = !!row.venue_sorted_at;
  if (row.toolkit_shared === undefined) row.toolkit_shared = !!row.toolkit_shared_at;
  if (row.marketing_launched === undefined) row.marketing_launched = !!row.marketing_launched_at;
  if (row.split_snapshot !== undefined) row.split_percentage = row.split_snapshot;
  if (row.contract_pdf_url !== undefined) row.contract_url = row.contract_pdf_url;
  if (row.city_name !== undefined) row.city = row.city_name;
  if (row.activity_name !== undefined) row.activity = row.activity_name;
  // Map milestone timestamps to booleans (DB stores _at timestamps, frontend expects booleans)
  row.first_call_done = row.first_call_done_at != null;
  row.venue_sorted = row.venue_sorted_at != null;
  row.toolkit_shared = row.toolkit_shared_at != null;
  row.marketing_launched = row.marketing_launched_at != null;
  return row;
}
function mapAppRows(rows: any[]) {
  return rows.map(mapAppRow);
}

const STATUS_EVENT_TABLE = 'club_application_status_event';

const APP_ENRICHED_SELECT = `
  ca.*,
  COALESCE(ca.name, CONCAT(u.first_name, ' ', u.last_name)) as name,
  u.phone as user_phone,
  ('SYC-' || LPAD(ca.pk::text, 8, '0')) as application_ref,
  COALESCE(
    (
      SELECT MAX(se.created_at)
      FROM ${STATUS_EVENT_TABLE} se
      WHERE se.application_id = ca.pk
        AND se.to_status::text = ca.status::text
    ),
    ca.updated_at,
    ca.created_at
  ) as stage_entered_at,
  ROUND(
    (
      EXTRACT(
        EPOCH FROM (
          NOW() - COALESCE(
            (
              SELECT MAX(se.created_at)
              FROM ${STATUS_EVENT_TABLE} se
              WHERE se.application_id = ca.pk
                AND se.to_status::text = ca.status::text
            ),
            ca.updated_at,
            ca.created_at
          )
        )
      ) / 3600.0
    )::numeric,
    1
  ) as stage_age_hours,
  EXISTS(
    SELECT 1
    FROM club_application dup
    WHERE dup.pk <> ca.pk
      AND dup.archived = false
      AND (
        (ca.user_id IS NOT NULL AND dup.user_id = ca.user_id)
        OR (
          ca.user_id IS NULL
          AND u.phone IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM users dup_u
            WHERE dup_u.pk = dup.user_id
              AND dup_u.phone = u.phone
          )
        )
      )
      AND COALESCE(dup.city_name, '') = COALESCE(ca.city_name, '')
      AND COALESCE(dup.activity_name, '') = COALESCE(ca.activity_name, '')
  ) as is_duplicate_lead,
  EXISTS(
    SELECT 1
    FROM club_application prev
    WHERE prev.pk <> ca.pk
      AND (
        (ca.user_id IS NOT NULL AND prev.user_id = ca.user_id)
        OR (
          ca.user_id IS NULL
          AND u.phone IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM users prev_u
            WHERE prev_u.pk = prev.user_id
              AND prev_u.phone = u.phone
          )
        )
      )
      AND (
        prev.archived = true
        OR prev.status IN ('REJECTED', 'NOT_INTERESTED', 'CLUB_CREATED')
      )
  ) as is_repeat_application
  ,(
    SELECT COUNT(*)::int
    FROM club_application rej
    WHERE rej.status = 'REJECTED'
      AND COALESCE(rej.city_name, '') = COALESCE(ca.city_name, '')
      AND COALESCE(rej.activity_name, '') = COALESCE(ca.activity_name, '')
      AND (
        (ca.user_id IS NOT NULL AND rej.user_id = ca.user_id)
        OR (
          ca.user_id IS NULL
          AND u.phone IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM users rej_u
            WHERE rej_u.pk = rej.user_id
              AND rej_u.phone = u.phone
          )
        )
      )
      AND (rej.pk <> ca.pk OR ca.status = 'REJECTED')
  ) as repeat_rejection_count
  ,(
    SELECT prev.activity_name
    FROM club_application prev
    WHERE prev.pk <> ca.pk
      AND prev.activity_name IS NOT NULL
      AND (
        (ca.user_id IS NOT NULL AND prev.user_id = ca.user_id)
        OR (
          ca.user_id IS NULL
          AND u.phone IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM users prev_u
            WHERE prev_u.pk = prev.user_id
              AND prev_u.phone = u.phone
          )
        )
      )
    ORDER BY prev.created_at DESC
    LIMIT 1
  ) as last_applied_activity
  ,COALESCE(
    (
      SELECT ARRAY_AGG(hist.activity_name ORDER BY hist.created_at DESC)
      FROM club_application hist
      WHERE hist.activity_name IS NOT NULL
        AND (
          (ca.user_id IS NOT NULL AND hist.user_id = ca.user_id)
          OR (
            ca.user_id IS NULL
            AND u.phone IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM users hist_u
              WHERE hist_u.pk = hist.user_id
                AND hist_u.phone = u.phone
            )
          )
        )
    ),
    ARRAY[]::text[]
  ) as applied_activities_history
`;

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

const ALLOWED_REJECTION_REASONS = new Set([
  'insufficient_experience',
  'low_commitment',
  'unclear_motivation',
  'city_not_available',
  'incomplete_responses',
  'other',
]);

function normalizeRejectionInput(rawReason: any, rawNote?: any): { reason: string; note: string } {
  const reasonInput = String(rawReason || '').trim();
  const noteInput = String(rawNote || '').trim();

  // Compatibility for deprecated client value that is not accepted by gRPC enums.
  if (reasonInput === 'potential_lead') {
    return {
      reason: 'other',
      note: noteInput || 'Potential lead',
    };
  }

  // Backward compatibility: accept "other: custom note" payloads from older clients.
  const match = reasonInput.match(/^other\s*:\s*(.+)$/i);
  if (match) {
    return {
      reason: 'other',
      note: noteInput || match[1].trim(),
    };
  }

  if (!reasonInput) {
    return { reason: '', note: noteInput };
  }

  if (ALLOWED_REJECTION_REASONS.has(reasonInput)) {
    return { reason: reasonInput, note: noteInput };
  }

  // If an unexpected value is provided, preserve it in note and use a valid enum reason.
  return {
    reason: 'other',
    note: noteInput || reasonInput,
  };
}

function isPotentialLeadDecision(rawPotentialLead: any, rawReason: any): boolean {
  const reasonInput = String(rawReason || '').trim();
  if (reasonInput === 'potential_lead') return true;

  if (typeof rawPotentialLead === 'boolean') return rawPotentialLead;

  const flag = String(rawPotentialLead || '').trim().toLowerCase();
  return ['true', '1', 'yes', 'y'].includes(flag);
}

async function appendRejectionNote(applicationId: number, note: string) {
  const content = String(note || '').trim();
  if (!content) return;

  await callGrpc('SuperAdminService', 'StartYourClubAddNote', {
    application_id: applicationId,
    content: `Rejection note: ${content}`,
    metadata_json: JSON.stringify({ kind: 'rejection_note' })
  });
}

async function appendPotentialLeadNote(applicationId: number, note: string) {
  const content = String(note || '').trim();
  if (!content) return;

  await callGrpc('SuperAdminService', 'StartYourClubAddNote', {
    application_id: applicationId,
    content: `Potential lead note: ${content}`,
    metadata_json: JSON.stringify({ kind: 'potential_lead_note' })
  });
}

// GET /admin/all — List all applications (filterable, sortable, paginated)
router.get('/admin/all', async (req: Request, res: Response) => {
  try {
    const {
      status, statuses, city, activity, search,
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

    // Multi-status filter (comma-separated, e.g., "ACTIVE,ABANDONED")
    if (statuses) {
      const statusList = (statuses as string).split(',').filter(s => s.trim());
      if (statusList.length > 0) {
        conditions.push(`ca.status = ANY($${paramIdx++})`);
        params.push(statusList);
      }
    } else if (status) {
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

    const allowedSorts = ['created_at', 'updated_at', 'submitted_at', 'name', 'city_name', 'activity_name', 'status', 'stage_entered_at'];
    const sortCol = allowedSorts.includes(sort as string) ? sort : 'created_at';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';
    const sortPrefix = sortCol === 'name'
      ? "COALESCE(ca.name, CONCAT(u.first_name, ' ', u.last_name))"
      : sortCol === 'stage_entered_at'
        ? `COALESCE((SELECT MAX(se.created_at) FROM ${STATUS_EVENT_TABLE} se WHERE se.application_id = ca.pk AND se.to_status::text = ca.status::text), ca.updated_at, ca.created_at)`
        : `ca.${sortCol}`;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(500, Math.max(1, parseInt(limit as string, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    const countResult = await queryProduction(
      `SELECT COUNT(*) FROM club_application ca LEFT JOIN users u ON u.pk = ca.user_id ${where}`, params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await queryProduction(
      `SELECT ${APP_ENRICHED_SELECT}
       FROM club_application ca
       LEFT JOIN users u ON u.pk = ca.user_id
       ${where}
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
    logger.error('Failed to list applications from production, trying local fallback:', error);

    try {
      const q = req.query as Record<string, any>;
      const fallbackArchived = q.archived;
      const fallbackStatuses = q.statuses;
      const fallbackStatus = q.status;
      const fallbackCity = q.city;
      const fallbackActivity = q.activity;
      const fallbackSearch = q.search;
      const fallbackPage = q.page || '1';
      const fallbackLimit = q.limit || '50';

      const localConditions: string[] = [];
      const localParams: any[] = [];
      let localIdx = 1;

      if (fallbackArchived !== 'true') {
        localConditions.push(`ca.archived = false`);
      }
      if (fallbackStatuses) {
        const statusList = String(fallbackStatuses).split(',').filter(s => s.trim());
        if (statusList.length > 0) {
          localConditions.push(`ca.status = ANY($${localIdx++})`);
          localParams.push(statusList);
        }
      } else if (fallbackStatus) {
        localConditions.push(`ca.status = $${localIdx++}`);
        localParams.push(fallbackStatus);
      }
      if (fallbackCity) {
        localConditions.push(`ca.city = $${localIdx++}`);
        localParams.push(fallbackCity);
      }
      if (fallbackActivity) {
        localConditions.push(`ca.activity = $${localIdx++}`);
        localParams.push(fallbackActivity);
      }
      if (fallbackSearch) {
        localConditions.push(`(ca.name ILIKE $${localIdx} OR ca.city ILIKE $${localIdx} OR ca.activity ILIKE $${localIdx})`);
        localParams.push(`%${String(fallbackSearch)}%`);
        localIdx++;
      }

      const localWhere = localConditions.length > 0 ? `WHERE ${localConditions.join(' AND ')}` : '';
      const localPageNum = Math.max(1, parseInt(String(fallbackPage), 10) || 1);
      const localLimitNum = Math.min(500, Math.max(1, parseInt(String(fallbackLimit), 10) || 50));
      const localOffset = (localPageNum - 1) * localLimitNum;

      const localCount = await queryLocal(`SELECT COUNT(*)::int as count FROM club_applications ca ${localWhere}`, localParams);
      const localTotal = parseInt(localCount.rows?.[0]?.count || 0, 10);

      const localResult = await queryLocal(
        `SELECT
          ca.*,
          ca.id as pk,
          ca.city as city_name,
          ca.activity as activity_name,
          ca.contract_url as contract_pdf_url,
          ('SYC-' || LPAD(ca.id::text, 8, '0')) as application_ref,
          COALESCE(ca.updated_at, ca.created_at) as stage_entered_at,
          ROUND((EXTRACT(EPOCH FROM (NOW() - COALESCE(ca.updated_at, ca.created_at))) / 3600.0)::numeric, 1) as stage_age_hours,
          false as is_duplicate_lead,
          false as is_repeat_application,
          0::int as repeat_rejection_count,
          NULL::text as last_applied_activity,
          ARRAY[]::text[] as applied_activities_history
        FROM club_applications ca
        ${localWhere}
        ORDER BY COALESCE(ca.created_at, NOW()) DESC
        LIMIT $${localIdx++} OFFSET $${localIdx++}`,
        [...localParams, localLimitNum, localOffset]
      );

      const mapped = mapAppRows(localResult.rows || []);
      return res.json({
        success: true,
        data: mapped,
        total: localTotal,
        page: localPageNum,
        limit: localLimitNum,
        totalPages: Math.ceil(localTotal / localLimitNum),
        source: 'local_fallback',
        warning: error?.message || 'Production database unavailable'
      });
    } catch (localError: any) {
      logger.error('Local fallback for applications failed, returning empty set:', localError);
      return res.json({
        success: true,
        data: [],
        total: 0,
        page: 1,
        limit: 50,
        totalPages: 0,
        source: 'empty_fallback',
        warning: error?.message || 'Production database unavailable'
      });
    }
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
      `SELECT city_name as city, COUNT(*)::int as count
       FROM club_application
       WHERE archived = false AND city_name IS NOT NULL
       GROUP BY city_name
       ORDER BY count DESC`
    );

    const byActivity = await queryProduction(
      `SELECT activity_name as activity, COUNT(*)::int as count
       FROM club_application
       WHERE archived = false AND activity_name IS NOT NULL
       GROUP BY activity_name
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

    const stageAnalyticsResult = await queryProduction(`
      SELECT
        ca.status,
        COUNT(*)::int as count,
        ROUND(
          AVG(
            EXTRACT(
              EPOCH FROM (
                NOW() - COALESCE(
                  (
                    SELECT MAX(se.created_at)
                    FROM ${STATUS_EVENT_TABLE} se
                    WHERE se.application_id = ca.pk
                      AND se.to_status::text = ca.status::text
                  ),
                  ca.updated_at,
                  ca.created_at
                )
              )
            ) / 3600.0
          )::numeric,
          1
        ) as avg_stage_age_hrs
      FROM club_application ca
      WHERE ca.archived = false
      GROUP BY ca.status
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
        stage_analytics: stageAnalyticsResult.rows,
      },
    });
  } catch (error: any) {
    logger.error('Failed to get analytics from production, returning fallback:', error);
    try {
      const localCounts = await queryLocal(`
        SELECT
          COUNT(*) FILTER (WHERE archived = false)::int as total,
          COUNT(*) FILTER (WHERE status = 'SUBMITTED' AND archived = false)::int as submitted,
          COUNT(*) FILTER (WHERE status = 'UNDER_REVIEW' AND archived = false)::int as under_review,
          COUNT(*) FILTER (WHERE status IN ('INTERVIEW_PENDING', 'INTERVIEW_SCHEDULED', 'INTERVIEW_DONE') AND archived = false)::int as interview_phase,
          COUNT(*) FILTER (WHERE status = 'SELECTED' AND archived = false)::int as selected,
          COUNT(*) FILTER (WHERE status = 'CLUB_CREATED' AND archived = false)::int as onboarded,
          COUNT(*) FILTER (WHERE status = 'REJECTED' AND archived = false)::int as rejected,
          COUNT(*) FILTER (WHERE status = 'ON_HOLD' AND archived = false)::int as on_hold,
          COUNT(*) FILTER (WHERE status = 'ACTIVE' AND archived = false)::int as active_journey,
          COUNT(*) FILTER (WHERE status = 'ABANDONED' AND archived = false)::int as abandoned,
          COUNT(*) FILTER (WHERE status = 'NOT_INTERESTED' AND archived = false)::int as not_interested,
          COUNT(*) FILTER (WHERE status IN ('ACTIVE', 'ABANDONED', 'NOT_INTERESTED') AND archived = false)::int as dropped_early,
          COUNT(*) FILTER (WHERE status = 'REJECTED' AND rejected_from_status IN ('SUBMITTED', 'UNDER_REVIEW', 'ON_HOLD') AND archived = false)::int as rejected_screening,
          COUNT(*) FILTER (WHERE status = 'REJECTED' AND rejected_from_status = 'INTERVIEW_DONE' AND archived = false)::int as rejected_interview
        FROM club_applications
      `);

      const localStage = await queryLocal(`
        SELECT
          status,
          COUNT(*)::int as count,
          ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - COALESCE(updated_at, created_at))) / 3600.0)::numeric, 1) as avg_stage_age_hrs
        FROM club_applications
        WHERE archived = false
        GROUP BY status
        ORDER BY count DESC
      `);

      const funnel = localCounts.rows?.[0] || {};
      const total = parseInt(funnel.total || 0, 10);
      const submitted = parseInt(funnel.submitted || 0, 10);
      const underReview = parseInt(funnel.under_review || 0, 10);
      const interviewPhase = parseInt(funnel.interview_phase || 0, 10);
      const selected = parseInt(funnel.selected || 0, 10);
      const onboarded = parseInt(funnel.onboarded || 0, 10);
      const rejected = parseInt(funnel.rejected || 0, 10);
      const reachedSubmitted = submitted + underReview + interviewPhase + selected + onboarded + rejected;
      const reachedInterview = interviewPhase + selected + onboarded + parseInt(funnel.rejected_interview || 0, 10);
      const reachedSelected = selected + onboarded;

      return res.json({
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
            on_hold: parseInt(funnel.on_hold || 0, 10),
            active_journey: parseInt(funnel.active_journey || 0, 10),
            abandoned: parseInt(funnel.abandoned || 0, 10),
            not_interested: parseInt(funnel.not_interested || 0, 10),
            dropped_early: parseInt(funnel.dropped_early || 0, 10),
            rejected_screening: parseInt(funnel.rejected_screening || 0, 10),
            rejected_interview: parseInt(funnel.rejected_interview || 0, 10),
          },
          conversion: {
            submit_to_interview: reachedSubmitted > 0 ? Math.round((reachedInterview / reachedSubmitted) * 100) : 0,
            interview_to_selected: reachedInterview > 0 ? Math.round((reachedSelected / reachedInterview) * 100) : 0,
            selected_to_onboarded: reachedSelected > 0 ? Math.round((onboarded / reachedSelected) * 100) : 0,
            overall: total > 0 ? Math.round((onboarded / total) * 100) : 0,
          },
          tat: {
            submit_to_pick_hrs: null,
            pick_to_interview_hrs: null,
            interview_to_select_hrs: null,
            select_to_call_hrs: null,
            select_to_venue_hrs: null,
            select_to_launch_hrs: null,
            total_pipeline_hrs: null,
          },
          dropped_analysis: {
            rejection_reasons: [],
          },
          stage_analytics: localStage.rows || [],
        },
        source: 'local_fallback',
        warning: error?.message || 'Production database unavailable'
      });
    } catch {
      return res.json({
        success: true,
        data: {
          funnel: {
            total: 0,
            submitted: 0,
            under_review: 0,
            interview_phase: 0,
            selected: 0,
            onboarded: 0,
            rejected: 0,
            on_hold: 0,
            active_journey: 0,
            abandoned: 0,
            not_interested: 0,
            dropped_early: 0,
            rejected_screening: 0,
            rejected_interview: 0,
          },
          conversion: {
            submit_to_interview: 0,
            interview_to_selected: 0,
            selected_to_onboarded: 0,
            overall: 0,
          },
          tat: {
            submit_to_pick_hrs: null,
            pick_to_interview_hrs: null,
            interview_to_select_hrs: null,
            select_to_call_hrs: null,
            select_to_venue_hrs: null,
            select_to_launch_hrs: null,
            total_pipeline_hrs: null,
          },
          dropped_analysis: {
            rejection_reasons: [],
          },
          stage_analytics: [],
        },
        source: 'empty_fallback',
        warning: error?.message || 'Production database unavailable'
      });
    }
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
    const active = true;
    const sort_order = sortOrder;
    const result = await callGrpc('SuperAdminService', 'StartYourClubCreateRatingDimension', { key, label, description, step, sort_order, active });

    // Re-fetch all dimensions to return fresh data
    const freshResult = await queryProduction(
      `SELECT pk as id, key, label, description, step, sort_order
       FROM club_rating_dimension
       WHERE active = true
       ORDER BY step, sort_order`
    );
    const screening = freshResult.rows.filter((r: any) => r.step === 'screening');
    const interview = freshResult.rows.filter((r: any) => r.step === 'interview');
    res.json({ success: true, data: { screening, interview } });
  } catch (error: any) {
    logger.error('Failed to add rating dimension:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /admin/rating-dimensions/:id — Soft-delete a rating dimension
router.delete('/admin/rating-dimensions/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await callGrpc('SuperAdminService', 'StartYourClubDeleteRatingDimension', { id: parseInt(id) });

    // Re-fetch all dimensions to return fresh data
    const freshResult = await queryProduction(
      `SELECT pk as id, key, label, description, step, sort_order
       FROM club_rating_dimension
       WHERE active = true
       ORDER BY step, sort_order`
    );
    const screening = freshResult.rows.filter((r: any) => r.step === 'screening');
    const interview = freshResult.rows.filter((r: any) => r.step === 'interview');
    res.json({ success: true, data: { screening, interview } });
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
    try {
      const local = await queryLocal(
        `SELECT DISTINCT city FROM club_applications WHERE city IS NOT NULL AND archived = false ORDER BY city`
      );
      return res.json({ success: true, data: local.rows.map((r: any) => r.city), source: 'local_fallback' });
    } catch {
      return res.json({ success: true, data: [], source: 'empty_fallback' });
    }
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
    try {
      const local = await queryLocal(
        `SELECT DISTINCT activity FROM club_applications WHERE activity IS NOT NULL AND archived = false ORDER BY activity`
      );
      return res.json({ success: true, data: local.rows.map((r: any) => r.activity), source: 'local_fallback' });
    } catch {
      return res.json({ success: true, data: [], source: 'empty_fallback' });
    }
  }
});

// GET /admin/lookup-user — Look up a user by phone number (MUST be before /admin/:id)
router.get('/admin/lookup-user', async (req: Request, res: Response) => {
  try {
    const { phone } = req.query;
    if (!phone || typeof phone !== 'string' || phone.trim().length < 10) {
      return res.status(400).json({ success: false, error: 'Valid phone number is required' });
    }

    let normalizedPhone = phone.trim().replace(/\D/g, '');
    if (normalizedPhone.length === 10) normalizedPhone = `91${normalizedPhone}`;

    const result = await queryProduction(
      `SELECT pk, first_name, last_name, phone FROM users WHERE phone = $1 AND is_deleted = false`,
      [normalizedPhone]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found. Ask them to download the app and log in first.' });
    }

    const user = result.rows[0];
    res.json({ success: true, data: { user_id: user.pk, first_name: user.first_name, last_name: user.last_name || '', phone: user.phone } });
  } catch (error: any) {
    logger.error('Failed to look up user:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /admin/create-lead — Create a manual lead (MUST be before /admin/:id)
router.post('/admin/create-lead', async (req: Request, res: Response) => {
  try {
    const { user_id, city_name, activity_name, name } = req.body;
    if (!user_id) {
      return res.status(400).json({ success: false, error: 'user_id is required' });
    }
    const duplicateCheck = await queryProduction(
      `SELECT pk, status
       FROM club_application
       WHERE archived = false
         AND user_id = $1
         AND COALESCE(city_name, '') = COALESCE($2, '')
         AND COALESCE(activity_name, '') = COALESCE($3, '')
       ORDER BY created_at DESC
       LIMIT 1`,
      [user_id, city_name || '', activity_name || '']
    );

    if (duplicateCheck.rows.length > 0) {
      const existing = duplicateCheck.rows[0];
      return res.status(409).json({
        success: false,
        error: 'Duplicate lead detected for this user, city, and activity.',
        data: {
          existing_application_id: existing.pk,
          existing_status: existing.status,
        },
      });
    }

    const apiRes = await misfitsApi('POST', '/start-your-club/admin/create-lead', {
      user_id, city_name: city_name || '', activity_name: activity_name || '', name: name || '',
    });
    if (!apiRes.ok) {
      return res.status(apiRes.status).json({ success: false, error: apiRes.error || apiRes.data?.message });
    }
    broadcast('application_updated', apiRes.data);
    res.status(201).json({ success: true, data: apiRes.data });
  } catch (error: any) {
    logger.error('Failed to create lead:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /admin/reviewers — Get past reviewer names for autocomplete (MUST be before /admin/:id)
router.get('/admin/reviewers', async (req: Request, res: Response) => {
  try {
    const result = await queryLocal('SELECT name FROM syc_reviewers ORDER BY last_used_at DESC');
    res.json({ success: true, reviewers: result.rows.map((r: any) => r.name) });
  } catch (error: any) {
    logger.error('Failed to fetch reviewers:', error);
    res.json({ success: true, reviewers: [] });
  }
});

// GET /admin/:id — Full detail for one application
router.get('/admin/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const appResult = await queryProduction(
      `SELECT ${APP_ENRICHED_SELECT}
       FROM club_application ca
       LEFT JOIN users u ON u.pk = ca.user_id
       WHERE ca.pk = $1`,
      [id]
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

    // Build question_map: { questionId: questionText } for questionnaire responses
    let question_map: Record<string, string> = {};
    if (app.questionnaire_data && typeof app.questionnaire_data === 'object') {
      const qIds = Object.keys(app.questionnaire_data).map(Number).filter(n => !isNaN(n));
      if (qIds.length > 0) {
        try {
          const qResult = await queryProduction(
            'SELECT pk, question_text FROM club_questionnaire_config WHERE pk = ANY($1)',
            [qIds]
          );
          for (const row of qResult.rows) {
            question_map[String(row.pk)] = row.question_text;
          }
        } catch (err) {
          logger.warn('Failed to fetch question texts:', err);
        }
      }
    }

    res.json({
      success: true,
      data: {
        ...app,
        question_map,
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

// (reviewers route moved before /admin/:id)

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

    // Note: reviewed_by not in gRPC proto yet — Go backend doesn't store it on pick
    await callGrpc('SuperAdminService', 'StartYourClubPickApplication', { application_id: parseInt(id) });

    // Save reviewer name locally for autocomplete
    try {
      await queryLocal(
        `INSERT INTO syc_reviewers (name, last_used_at) VALUES ($1, NOW())
         ON CONFLICT (name) DO UPDATE SET last_used_at = NOW()`,
        [reviewed_by.trim()]
      );
    } catch (e) { /* ignore — autocomplete is non-critical */ }

    const updated = await queryProduction(
      `SELECT ${APP_ENRICHED_SELECT}
       FROM club_application ca
       LEFT JOIN users u ON u.pk = ca.user_id
       WHERE ca.pk = $1`,
      [id]
    );
    const freshApp = mapAppRow(updated.rows[0]);

    broadcast('application_updated', { id, status: 'UNDER_REVIEW' });
    res.json({ success: true, data: freshApp });
  } catch (error: any) {
    logger.error('Failed to pick application:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /admin/:id/review — 3-outcome review (select-for-interview / reject / on-hold)
router.patch('/admin/:id/review', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { action, ratings, rejection_reason, rejection_note, potential_lead, reviewed_by } = req.body;
    const normalizedRejection = normalizeRejectionInput(rejection_reason, rejection_note);
    const potentialLead = action === 'reject'
      && normalizedRejection.reason === 'other'
      && isPotentialLeadDecision(potential_lead, rejection_reason);
    const effectiveAction = potentialLead ? 'on_hold' : action;

    if (!['select_for_interview', 'reject', 'on_hold'].includes(action)) {
      return res.status(400).json({ success: false, error: 'Invalid action. Must be select_for_interview, reject, or on_hold' });
    }

    const outcomeMap: Record<string, number> = { 'select_for_interview': 1, 'on_hold': 2, 'reject': 3 };
    await callGrpc('SuperAdminService', 'StartYourClubReviewApplication', {
      application_id: parseInt(id),
      outcome: outcomeMap[effectiveAction] || 0,
      screening_ratings: ratings || {},
      rejection_reason: effectiveAction === 'reject' ? normalizedRejection.reason : ''
    });

    if (effectiveAction === 'reject' && normalizedRejection.note) {
      await appendRejectionNote(parseInt(id), normalizedRejection.note);
    }
    if (potentialLead && normalizedRejection.note) {
      await appendPotentialLeadNote(parseInt(id), normalizedRejection.note);
    }

    const updated = await queryProduction(
      `SELECT ${APP_ENRICHED_SELECT}
       FROM club_application ca
       LEFT JOIN users u ON u.pk = ca.user_id
       WHERE ca.pk = $1`,
      [id]
    );
    const freshApp = mapAppRow(updated.rows[0]);

    const statusMap: Record<string, string> = {
      'select_for_interview': 'INTERVIEW_PENDING',
      'reject': 'REJECTED',
      'on_hold': 'ON_HOLD',
    };
    const toStatus = statusMap[effectiveAction] || 'UNDER_REVIEW';

    broadcast('application_updated', { id, status: toStatus });
    res.json({ success: true, data: freshApp });
  } catch (error: any) {
    logger.error('Failed to review application:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /admin/:id/status — General status transition (mapped to appropriate gRPC call)
router.patch('/admin/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { to_status, actor = 'admin', metadata = {} } = req.body;
    const normalizedRejection = normalizeRejectionInput(metadata.rejection_reason, metadata.rejection_note);

    if (!to_status) {
      return res.status(400).json({ success: false, error: 'to_status is required' });
    }

    const appResult = await queryProduction('SELECT * FROM club_application WHERE pk = $1', [id]);
    if (appResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Application not found' });
    }

    // Map target status to the appropriate gRPC call
    const statusToGrpc: Record<string, { method: string; data: any }> = {
      'UNDER_REVIEW': { method: 'StartYourClubPickApplication', data: { application_id: parseInt(id) } },
      'REJECTED': { method: 'StartYourClubRejectApplication', data: { application_id: parseInt(id), rejection_reason: normalizedRejection.reason || '' } },
      'INTERVIEW_PENDING': { method: 'StartYourClubReviewApplication', data: { application_id: parseInt(id), outcome: 1, screening_ratings: metadata.ratings || {}, rejection_reason: '' } },
      'ON_HOLD': { method: 'StartYourClubReviewApplication', data: { application_id: parseInt(id), outcome: 2, screening_ratings: metadata.ratings || {}, rejection_reason: '' } },
      'SELECTED': { method: 'StartYourClubSelectApplication', data: { application_id: parseInt(id), misfits_pct: 70, leader_pct: 30, interview_ratings: { dimensions: metadata.interview_ratings || {} } } },
    };

    const grpcCall = statusToGrpc[to_status];
    if (grpcCall) {
      await callGrpc('SuperAdminService', grpcCall.method, grpcCall.data);
      if (to_status === 'REJECTED' && normalizedRejection.note) {
        await appendRejectionNote(parseInt(id), normalizedRejection.note);
      }
    } else {
      // Fallback: use the misfitsApi for statuses not mapped to gRPC
      const apiRes = await misfitsApi('PATCH', `/start-your-club/admin/${id}/status`, { status: to_status });
      if (!apiRes.ok) {
        return res.status(apiRes.status).json({ success: false, error: apiRes.error || apiRes.data?.message });
      }
    }

    const updated = await queryProduction(
      `SELECT ${APP_ENRICHED_SELECT}
       FROM club_application ca
       LEFT JOIN users u ON u.pk = ca.user_id
       WHERE ca.pk = $1`,
      [id]
    );
    const freshApp = mapAppRow(updated.rows[0]);

    broadcast('application_updated', { id, status: to_status });
    res.json({ success: true, data: freshApp });
  } catch (error: any) {
    logger.error('Failed to update status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /admin/:id/select — Select applicant + assign split (requires interview_ratings)
router.post('/admin/:id/select', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { split_percentage, interview_ratings: ratings } = req.body;

    const appResult = await queryProduction('SELECT * FROM club_application WHERE pk = $1', [id]);
    if (appResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Application not found' });
    }

    const app = appResult.rows[0];
    if (app.status !== 'INTERVIEW_DONE') {
      return res.status(400).json({ success: false, error: 'Can only select from INTERVIEW_DONE status' });
    }

    const split = split_percentage || { misfits: 70, leader: 30 };

    // Validate split percentages add to 100
    const m = Number(split.misfits);
    const l = Number(split.leader);
    if (isNaN(m) || isNaN(l) || m + l !== 100) {
      return res.status(400).json({ success: false, error: 'Split percentages must add up to 100' });
    }

    await callGrpc('SuperAdminService', 'StartYourClubSelectApplication', {
      application_id: parseInt(id),
      misfits_pct: parseInt(split.misfits),
      leader_pct: parseInt(split.leader),
      interview_ratings: { dimensions: ratings || {} }
    });

    const updated = await queryProduction(
      `SELECT ${APP_ENRICHED_SELECT}
       FROM club_application ca
       LEFT JOIN users u ON u.pk = ca.user_id
       WHERE ca.pk = $1`,
      [id]
    );
    const freshApp = mapAppRow(updated.rows[0]);

    broadcast('application_updated', { id, status: 'SELECTED' });
    res.json({ success: true, data: freshApp });
  } catch (error: any) {
    logger.error('Failed to select applicant:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /admin/:id/split — Update revenue split
router.patch('/admin/:id/split', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const misfits = req.body.misfits ?? req.body.misfits_pct;
    const leader = req.body.leader ?? req.body.leader_pct;

    if (misfits == null || leader == null || Number(misfits) + Number(leader) !== 100) {
      return res.status(400).json({ success: false, error: 'Split must add up to 100%' });
    }

    const appResult = await queryProduction('SELECT status FROM club_application WHERE pk = $1', [id]);
    if (appResult.rows.length === 0) return res.status(404).json({ success: false, error: 'Application not found' });
    if (!['SELECTED', 'CLUB_CREATED'].includes(appResult.rows[0].status)) {
      return res.status(400).json({ success: false, error: 'Split can only be updated for selected/onboarded applications' });
    }

    await callGrpc('SuperAdminService', 'StartYourClubUpdateSplit', {
      application_id: parseInt(id),
      misfits_pct: misfits,
      leader_pct: leader
    });

    const updated = await queryProduction(
      `SELECT ${APP_ENRICHED_SELECT}
       FROM club_application ca
       LEFT JOIN users u ON u.pk = ca.user_id
       WHERE ca.pk = $1`,
      [id]
    );
    const freshApp = mapAppRow(updated.rows[0]);

    broadcast('application_updated', { id, type: 'split_updated' });
    res.json({ success: true, data: freshApp });
  } catch (error: any) {
    logger.error('Failed to update split:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /admin/:id/milestones — Toggle milestones
router.patch('/admin/:id/milestones', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { first_call_done, venue_sorted, toolkit_shared, marketing_launched } = req.body;

    const appResult = await queryProduction('SELECT * FROM club_application WHERE pk = $1', [id]);
    if (appResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Application not found' });
    }

    const app = mapAppRow(appResult.rows[0]);
    if (app.status !== 'SELECTED') {
      return res.status(400).json({ success: false, error: 'Milestones can only be updated for SELECTED applications' });
    }

    // Merge with existing milestone state — only override fields that were explicitly sent
    // This prevents toggling one milestone from clearing the others
    await callGrpc('SuperAdminService', 'StartYourClubUpdateMilestones', {
      application_id: parseInt(id),
      first_call_done: first_call_done !== undefined ? !!first_call_done : !!app.first_call_done,
      venue_sorted: venue_sorted !== undefined ? !!venue_sorted : !!app.venue_sorted,
      toolkit_shared: toolkit_shared !== undefined ? !!toolkit_shared : !!app.toolkit_shared,
      marketing_launched: marketing_launched !== undefined ? !!marketing_launched : !!app.marketing_launched
    });

    const updated = await queryProduction(
      `SELECT ${APP_ENRICHED_SELECT}
       FROM club_application ca
       LEFT JOIN users u ON u.pk = ca.user_id
       WHERE ca.pk = $1`,
      [id]
    );
    const freshApp = mapAppRow(updated.rows[0]);

    // Check if auto-transitioned to CLUB_CREATED
    if (freshApp.status === 'CLUB_CREATED') {
      broadcast('application_updated', { id, status: 'CLUB_CREATED' });
      return res.json({ success: true, data: freshApp });
    }

    broadcast('application_updated', { id, status: freshApp.status });
    res.json({ success: true, data: freshApp });
  } catch (error: any) {
    logger.error('Failed to update milestones:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /admin/:id/note — Add note
router.post('/admin/:id/note', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { content: text } = req.body;

    if (!text?.trim()) {
      return res.status(400).json({ success: false, error: 'Note content is required' });
    }

    await callGrpc('SuperAdminService', 'StartYourClubAddNote', {
      application_id: parseInt(id),
      content: text,
      metadata_json: ''
    });

    // Re-fetch activity log for fresh data
    const activity = await queryProduction(
      'SELECT * FROM club_application_activity WHERE application_id = $1 ORDER BY created_at DESC LIMIT 1',
      [id]
    );

    broadcast('activity_added', { application_id: id, type: 'note' });
    res.json({ success: true, data: activity.rows[0] ? mapAppRow(activity.rows[0]) : { application_id: id, type: 'note' } });
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

    await callGrpc('SuperAdminService', 'StartYourClubAddCallLog', {
      application_id: parseInt(id),
      content: notes || '',
      metadata_json: JSON.stringify({ duration, outcome })
    });

    // Re-fetch activity log for fresh data
    const activity = await queryProduction(
      'SELECT * FROM club_application_activity WHERE application_id = $1 ORDER BY created_at DESC LIMIT 1',
      [id]
    );

    broadcast('activity_added', { application_id: id, type: 'call' });
    res.json({ success: true, data: activity.rows[0] ? mapAppRow(activity.rows[0]) : { application_id: id, type: 'call' } });
  } catch (error: any) {
    logger.error('Failed to log call:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /admin/:id/reject — Blanket reject from any non-terminal status
router.patch('/admin/:id/reject', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { rejection_reason, rejection_note, ratings, interview_ratings, potential_lead } = req.body;
    const normalizedRejection = normalizeRejectionInput(rejection_reason, rejection_note);
    const potentialLead = normalizedRejection.reason === 'other'
      && isPotentialLeadDecision(potential_lead, rejection_reason);

    if (!normalizedRejection.reason) {
      return res.status(400).json({ success: false, error: 'Rejection reason is required' });
    }

    if (potentialLead) {
      try {
        await callGrpc('SuperAdminService', 'StartYourClubReviewApplication', {
          application_id: parseInt(id),
          outcome: 2, // ON_HOLD
          screening_ratings: ratings || {},
          rejection_reason: ''
        });
      } catch (holdErr: any) {
        logger.warn('Review-on-hold failed, falling back to direct status patch:', holdErr.message);
        const apiRes = await misfitsApi('PATCH', `/start-your-club/admin/${id}/status`, { status: 'ON_HOLD' });
        if (!apiRes.ok) {
          return res.status(apiRes.status || 500).json({ success: false, error: apiRes.error || apiRes.data?.message || holdErr.message });
        }
      }

      if (normalizedRejection.note) {
        await appendPotentialLeadNote(parseInt(id), normalizedRejection.note);
      }
    } else if (ratings && Object.keys(ratings).length > 0) {
      // If ratings are provided, save them via the review endpoint (reject outcome) to preserve them
      try {
        await callGrpc('SuperAdminService', 'StartYourClubReviewApplication', {
          application_id: parseInt(id),
          outcome: 3, // REJECT
          screening_ratings: ratings,
          rejection_reason: normalizedRejection.reason
        });
        if (normalizedRejection.note) {
          await appendRejectionNote(parseInt(id), normalizedRejection.note);
        }
        // Review already handled rejection — skip the separate reject call
      } catch (reviewErr: any) {
        // If review fails (e.g., wrong status), fall back to direct reject
        logger.warn('Review-reject failed, falling back to direct reject:', reviewErr.message);
        await callGrpc('SuperAdminService', 'StartYourClubRejectApplication', { application_id: parseInt(id), rejection_reason: normalizedRejection.reason });
        if (normalizedRejection.note) {
          await appendRejectionNote(parseInt(id), normalizedRejection.note);
        }
      }
    } else {
      await callGrpc('SuperAdminService', 'StartYourClubRejectApplication', { application_id: parseInt(id), rejection_reason: normalizedRejection.reason });
      if (normalizedRejection.note) {
        await appendRejectionNote(parseInt(id), normalizedRejection.note);
      }
    }

    const updated = await queryProduction(
      `SELECT ${APP_ENRICHED_SELECT}
       FROM club_application ca
       LEFT JOIN users u ON u.pk = ca.user_id
       WHERE ca.pk = $1`,
      [id]
    );
    const freshApp = mapAppRow(updated.rows[0]);

    const nextStatus = potentialLead ? 'ON_HOLD' : 'REJECTED';
    broadcast('application_updated', { id, status: nextStatus });
    res.json({ success: true, data: freshApp });
  } catch (error: any) {
    logger.error('Failed to reject application:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /admin/bulk-archive — Archive multiple applications
router.post('/admin/bulk-archive', async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;

    if (!ids?.length) {
      return res.status(400).json({ success: false, error: 'No application IDs provided' });
    }

    const result = await callGrpc('SuperAdminService', 'StartYourClubBulkArchiveApplications', {
      application_ids: ids.map(Number)
    });

    broadcast('applications_archived', { ids: ids.map(Number) });
    res.json({ success: true, data: { archived_count: result.archived || ids.length } });
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

    const fileUrl = `/api/start-club/contracts/${file.filename}`;

    await callGrpc('SuperAdminService', 'StartYourClubUploadContract', { application_id: parseInt(id), contract_pdf_url: fileUrl });

    const updated = await queryProduction(
      `SELECT ${APP_ENRICHED_SELECT}
       FROM club_application ca
       LEFT JOIN users u ON u.pk = ca.user_id
       WHERE ca.pk = $1`,
      [id]
    );
    const freshApp = mapAppRow(updated.rows[0]);

    broadcast('application_updated', { id, type: 'contract_uploaded' });
    res.json({ success: true, data: { contract_url: fileUrl, filename: file.originalname, ...freshApp } });
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

    const fileUrl = `/api/start-club/contracts/${file.filename}`;

    await callGrpc('SuperAdminService', 'StartYourClubUploadSignedContract', { application_id: parseInt(id), signed_contract_url: fileUrl });

    const updated = await queryProduction(
      `SELECT ${APP_ENRICHED_SELECT}
       FROM club_application ca
       LEFT JOIN users u ON u.pk = ca.user_id
       WHERE ca.pk = $1`,
      [id]
    );
    const freshApp = mapAppRow(updated.rows[0]);

    broadcast('application_updated', { id, type: 'signed_contract_uploaded' });
    res.json({ success: true, data: { signed_contract_url: fileUrl, ...freshApp } });
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

// (lookup-user and create-lead moved before /admin/:id to prevent Express route shadowing)

// ══════════════════════════════════════════
//  RESCHEDULE
// ══════════════════════════════════════════

// PATCH /admin/:id/reschedule — Move INTERVIEW_SCHEDULED back to INTERVIEW_PENDING + clear Calendly data
router.patch('/admin/:id/reschedule', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Use Go reschedule endpoint which transitions status AND clears calendly fields
    const apiRes = await misfitsApi('PATCH', `/start-your-club/admin/${id}/reschedule`, {});
    if (!apiRes.ok) {
      return res.status(apiRes.status).json({ success: false, error: apiRes.error || apiRes.data?.message });
    }

    broadcast('application_updated', { id, status: 'INTERVIEW_PENDING' });
    res.json({ success: true, data: { id, status: 'INTERVIEW_PENDING' } });
  } catch (error: any) {
    logger.error('Failed to reschedule:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
