import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { getLocalPool } from '../services/database';
import { addMessageToBatch } from '../services/sharkTank/batcher';

const router = Router();

// Track processed message IDs for idempotency
const processedMessageIds = new Set<string>();

// Verify Missive webhook signature (HMAC SHA256)
function verifyMissiveSignature(req: Request, secret: string): boolean {
  const signature = req.headers['x-hook-signature'] as string;
  if (!signature) return false;
  const body = JSON.stringify(req.body);
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

/**
 * POST /api/shark-tank/webhook/missive — Incoming message handler
 */
router.post('/missive', async (req: Request, res: Response) => {
  try {
    const pool = getLocalPool();

    // Verify webhook signature if configured
    const secret = process.env.MISSIVE_WEBHOOK_SECRET;
    if (secret && !verifyMissiveSignature(req, secret)) {
      console.log('[Webhook] Invalid signature, skipping verification for now');
    }

    const payload = req.body;

    console.log('[Webhook] Received payload:', JSON.stringify({
      rule: payload.rule?.type,
      conversation_id: payload.conversation?.id,
      message_id: payload.message?.id,
      message_preview: payload.message?.preview,
      from_field: payload.message?.from_field,
    }));

    const messageId = payload.message?.id || payload.id;
    const conversationId = payload.conversation?.id || payload.conversation_id;
    const messageText = payload.message?.preview || payload.body?.preview || payload.text || '';
    const senderHandle = extractSenderHandle(payload);
    const timestamp = payload.message?.delivered_at
      ? new Date(payload.message.delivered_at * 1000).toISOString()
      : payload.delivered_at || new Date().toISOString();

    // Idempotency check
    if (messageId && processedMessageIds.has(messageId)) {
      console.log(`[Webhook] Duplicate message ${messageId}, skipping`);
      return res.json({ status: 'duplicate' });
    }
    if (messageId) {
      processedMessageIds.add(messageId);
      setTimeout(() => processedMessageIds.delete(messageId), 60 * 60 * 1000);
    }

    if (!senderHandle && !conversationId) {
      console.log('[Webhook] No sender handle or conversation ID found');
      return res.status(400).json({ error: 'Cannot identify lead' });
    }

    // Match to lead by instagram handle or conversation ID
    let lead;
    if (senderHandle) {
      const result = await pool.query(
        'SELECT * FROM leads WHERE instagram_handle = $1',
        [senderHandle.toLowerCase()]
      );
      lead = result.rows[0];
    }
    if (!lead && conversationId) {
      const result = await pool.query(
        'SELECT * FROM leads WHERE missive_conversation_id = $1',
        [conversationId]
      );
      lead = result.rows[0];
    }

    if (!lead) {
      console.log(`[Webhook] No matching lead for handle=${senderHandle}, conv=${conversationId}`);
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Auto-advance NOT_CONTACTED/FOLLOWED leads to DM_SENT
    const preAutomationStages = ['NOT_CONTACTED', 'FOLLOWED'];
    if (preAutomationStages.includes(lead.pipeline_stage)) {
      console.log(`[Webhook] Lead ${lead.id} is at ${lead.pipeline_stage} but replied. Auto-advancing to DM_SENT.`);
      await pool.query(
        `UPDATE leads SET pipeline_stage = 'DM_SENT', last_activity_at = NOW(), updated_at = NOW(),
         activity_log = activity_log || $1::jsonb WHERE id = $2`,
        [JSON.stringify([{
          action: 'stage_change', old_value: lead.pipeline_stage, new_value: 'DM_SENT',
          created_at: new Date().toISOString()
        }]), lead.id]
      );
      lead.pipeline_stage = 'DM_SENT';
    }

    // Skip automation for flagged leads (team handles manually)
    if (lead.flag) {
      console.log(`[Webhook] Lead ${lead.id} is flagged (${lead.flag}). Skipping automation — manual handling.`);
      return res.json({ status: 'skipped', reason: `Lead is flagged: ${lead.flag}` });
    }

    // Store conversation ID and contact ID if not already set
    const contactId = payload.message?.from_field?.id || payload.message?.account_author?.id;
    const updates: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    if (conversationId && !lead.missive_conversation_id) {
      updates.push(`missive_conversation_id = $${paramIdx++}`);
      values.push(conversationId);
    }
    if (contactId && !lead.missive_contact_id) {
      updates.push(`missive_contact_id = $${paramIdx++}`);
      values.push(contactId);
    }
    if (updates.length > 0) {
      values.push(lead.id);
      await pool.query(
        `UPDATE leads SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
        values
      );
    }

    // Add message to batch (starts/resets timer)
    await addMessageToBatch(lead.id, {
      text: messageText,
      sender: 'lead',
      timestamp,
      messageId,
    });

    res.json({ status: 'ok', lead_id: lead.id });
  } catch (err) {
    console.error('[Webhook] Error processing:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * POST /api/shark-tank/webhook/simulate — Test endpoint for simulating an incoming message
 */
router.post('/simulate', async (req: Request, res: Response) => {
  try {
    const pool = getLocalPool();
    const { lead_id, message } = req.body;

    if (!lead_id || !message) {
      return res.status(400).json({ error: 'lead_id and message required' });
    }

    const leadResult = await pool.query('SELECT * FROM leads WHERE id = $1', [lead_id]);
    if (leadResult.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const lead = leadResult.rows[0];
    const preAutomationStages = ['NOT_CONTACTED', 'FOLLOWED'];
    if (preAutomationStages.includes(lead.pipeline_stage)) {
      return res.json({ status: 'skipped', reason: `Lead is at ${lead.pipeline_stage}. Set to DM_SENT first.` });
    }

    await addMessageToBatch(lead_id, {
      text: message,
      sender: 'lead',
      timestamp: new Date().toISOString(),
    });

    res.json({ status: 'ok', message: 'Message added to batch. Will process after 1.5 min of silence.' });
  } catch (err) {
    console.error('[Simulate] Error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

function extractSenderHandle(payload: any): string | null {
  const handle = payload.message?.from_field?.username
    || payload.message?.account_author?.username
    || payload.message?.from?.username
    || payload.from?.username
    || payload.sender?.username
    || payload.contact?.instagram;

  if (!handle) return null;
  return handle.replace('@', '').toLowerCase();
}

export default router;
