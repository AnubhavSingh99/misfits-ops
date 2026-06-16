import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { queryProduction } from '../services/database';
import { callGrpc } from '../services/grpcClient';
import { misfitsApi } from '../services/startYourClub/misfitsApi';
import { broadcast } from '../services/startYourClub/sseManager';
import {
  sendStartClubPotentialLeadNotification,
  updateStartClubLeadSlackMessage,
} from '../services/slackService';
import { logger } from '../utils/logger';

const router = Router();

type SlackRequest = Request & { rawBody?: Buffer };

function getSlackSigningSecret() {
  return process.env.SLACK_SIGNING_SECRET || '';
}

function timingSafeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  return aBuffer.length === bBuffer.length && crypto.timingSafeEqual(aBuffer, bBuffer);
}

function verifySlackSignature(req: SlackRequest) {
  const signingSecret = getSlackSigningSecret();
  if (!signingSecret) {
    logger.warn('SLACK_SIGNING_SECRET is not configured; rejecting Slack action request');
    return false;
  }

  const timestamp = String(req.header('x-slack-request-timestamp') || '');
  const signature = String(req.header('x-slack-signature') || '');
  const rawBody = req.rawBody?.toString('utf8') || '';
  if (!timestamp || !signature || !rawBody) return false;

  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 60 * 5) return false;

  const base = `v0:${timestamp}:${rawBody}`;
  const expected = `v0=${crypto
    .createHmac('sha256', signingSecret)
    .update(base)
    .digest('hex')}`;

  return timingSafeEqual(expected, signature);
}

function parseSlackPayload(req: Request) {
  const rawPayload = typeof req.body?.payload === 'string'
    ? req.body.payload
    : typeof req.body === 'string'
      ? req.body
      : '';

  if (!rawPayload) return null;
  try {
    return JSON.parse(rawPayload);
  } catch {
    return null;
  }
}

function parseActionValue(action: any) {
  if (!action) return {};
  const value = String(action.value || '').trim();
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return { lead_id: value };
  }
}

function getActorName(payload: any) {
  return payload?.user?.profile?.real_name
    || payload?.user?.real_name
    || payload?.user?.name
    || payload?.user?.username
    || payload?.user?.id
    || 'Slack user';
}

async function fetchLead(applicationId: number) {
  const result = await queryProduction(
    `SELECT
       ca.*,
       COALESCE(ca.name, CONCAT(u.first_name, ' ', u.last_name)) as name,
       COALESCE(NULLIF(BTRIM(to_jsonb(ca)->>'user_phone'), ''), u.phone) as user_phone,
       ('SYC-' || LPAD(ca.pk::text, 8, '0')) as application_ref
     FROM club_application ca
     LEFT JOIN users u ON u.pk = ca.user_id
     WHERE ca.pk = $1`,
    [applicationId]
  );

  if (result.rows.length === 0) return null;
  const lead = result.rows[0];
  lead.id = lead.pk;
  lead.city = lead.city_name;
  lead.activity = lead.activity_name;
  return lead;
}

async function approveLeadForInterview(applicationId: number, lead: any) {
  try {
    await callGrpc('SuperAdminService', 'StartYourClubReviewApplication', {
      application_id: applicationId,
      outcome: 1,
      screening_ratings: lead.screening_ratings || {},
      rejection_reason: ''
    });
  } catch (grpcError: any) {
    logger.warn('Slack approve gRPC failed, falling back to status patch:', grpcError?.message || grpcError);
    const apiRes = await misfitsApi('PATCH', `/start-your-club/admin/${applicationId}/status`, {
      status: 'INTERVIEW_PENDING'
    });
    if (!apiRes.ok) {
      throw new Error(apiRes.error || apiRes.data?.message || grpcError?.message || 'Failed to approve lead');
    }
  }
}

async function rejectLead(applicationId: number) {
  await callGrpc('SuperAdminService', 'StartYourClubRejectApplication', {
    application_id: applicationId,
    rejection_reason: 'other'
  });
}

async function handleLeadAction(payload: any) {
  const action = payload?.actions?.[0];
  const value = parseActionValue(action);
  const actionId = String(action?.action_id || value.action || '').toLowerCase();
  const leadId = Number.parseInt(String(value.lead_id || value.application_id || ''), 10);
  const slackAction = actionId.includes('approve') ? 'approve' : actionId.includes('reject') ? 'reject' : '';

  if (!Number.isFinite(leadId) || !slackAction) {
    throw new Error('Invalid Slack lead action payload');
  }

  const lead = await fetchLead(leadId);
  if (!lead) {
    throw new Error(`Lead ${leadId} not found`);
  }

  const currentStatus = String(lead.status || '').toUpperCase();
  const actorName = getActorName(payload);
  const channel = payload?.channel?.id || payload?.container?.channel_id;
  const messageTs = payload?.message?.ts || payload?.container?.message_ts;

  try {
    if (slackAction === 'approve') {
      if (!['ON_HOLD', 'UNDER_REVIEW', 'SUBMITTED'].includes(currentStatus)) {
        throw new Error(`Cannot approve from ${currentStatus}`);
      }
      await approveLeadForInterview(leadId, lead);
    } else {
      if (currentStatus === 'REJECTED') {
        throw new Error('Lead is already rejected');
      }
      await rejectLead(leadId);
    }

    const updatedLead = await fetchLead(leadId) || lead;
    broadcast('application_updated', {
      id: leadId,
      status: slackAction === 'approve' ? 'INTERVIEW_PENDING' : 'REJECTED',
      type: 'slack_action'
    });

    await updateStartClubLeadSlackMessage(updatedLead, {
      action: slackAction,
      actorName,
      channel,
      messageTs
    });
  } catch (error: any) {
    await updateStartClubLeadSlackMessage(lead, {
      action: slackAction,
      actorName,
      channel,
      messageTs,
      error: error?.message || 'Action failed'
    });
    throw error;
  }
}

// POST /api/slack/action — Slack interactive button callback.
router.post('/action', async (req: SlackRequest, res: Response) => {
  if (!verifySlackSignature(req)) {
    return res.status(401).json({ error: 'Invalid Slack signature' });
  }

  const payload = parseSlackPayload(req);
  if (!payload) {
    return res.status(400).json({ error: 'Invalid Slack payload' });
  }

  res.status(200).send('');

  handleLeadAction(payload).catch((error) => {
    logger.error('Slack lead action failed:', error);
  });
});

// POST /api/slack/events — Slack Events API URL verification callback.
router.post('/events', async (req: SlackRequest, res: Response) => {
  if (!verifySlackSignature(req)) {
    return res.status(401).json({ error: 'Invalid Slack signature' });
  }

  if (req.body?.type === 'url_verification' && req.body?.challenge) {
    return res.status(200).send(req.body.challenge);
  }

  res.status(200).json({ ok: true });
});

// POST /api/slack/send-start-club-lead — Manually send/re-send one potential lead to Slack.
router.post('/send-start-club-lead', async (req: Request, res: Response) => {
  try {
    const applicationId = Number.parseInt(String(req.body?.lead_id || req.body?.application_id || ''), 10);
    if (!Number.isFinite(applicationId)) {
      return res.status(400).json({ success: false, error: 'lead_id is required' });
    }

    const lead = await fetchLead(applicationId);
    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    if (String(lead.status || '').toUpperCase() !== 'ON_HOLD') {
      return res.status(409).json({ success: false, error: `Lead is ${lead.status}, not ON_HOLD` });
    }

    const result = await sendStartClubPotentialLeadNotification(lead);
    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error || 'Slack send failed' });
    }

    res.json({ success: true, message_ts: result.messageTs });
  } catch (error: any) {
    logger.error('Manual Slack lead send failed:', error);
    res.status(500).json({ success: false, error: error?.message || 'Slack send failed' });
  }
});

export default router;
