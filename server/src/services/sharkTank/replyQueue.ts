import { getLocalPool } from '../database';
import { broadcast } from './sseManager';

const SEND_DELAY_MS = 0; // Send immediately after AI processes

// In-memory send timers
const sendTimers = new Map<number, NodeJS.Timeout>();

/**
 * Create a pending reply and schedule it for auto-send.
 */
export async function createPendingReply(leadId: number, replyText: string): Promise<number> {
  const pool = getLocalPool();
  const sendAt = new Date(Date.now() + SEND_DELAY_MS);

  // Cancel any existing pending reply for this lead (edge case: new message while reply queued)
  await cancelPendingRepliesForLead(leadId);

  const result = await pool.query(
    `INSERT INTO pending_replies (lead_id, reply_text, send_at, status) VALUES ($1, $2, $3, 'pending') RETURNING id`,
    [leadId, replyText, sendAt.toISOString()]
  );

  const replyId = result.rows[0].id;

  // Schedule auto-send
  const timer = setTimeout(async () => {
    sendTimers.delete(replyId);
    await autoSendReply(replyId);
  }, SEND_DELAY_MS);

  sendTimers.set(replyId, timer);
  console.log(`[ReplyQueue] Pending reply ${replyId} created for lead ${leadId}. Auto-sends at ${sendAt.toISOString()}`);

  broadcast('reply_created', { reply_id: replyId, lead_id: leadId, send_at: sendAt.toISOString() });

  return replyId;
}

/**
 * Schedule a reply to be sent after a delay (e.g. 10hr reminder).
 * Unlike createPendingReply, this does NOT cancel existing pending replies.
 * Gets auto-cancelled when createPendingReply runs (lead replies before timer).
 */
export async function createScheduledReply(leadId: number, replyText: string, delayMs: number): Promise<number> {
  const pool = getLocalPool();
  const sendAt = new Date(Date.now() + delayMs);

  const result = await pool.query(
    `INSERT INTO pending_replies (lead_id, reply_text, send_at, status) VALUES ($1, $2, $3, 'pending') RETURNING id`,
    [leadId, replyText, sendAt.toISOString()]
  );

  const replyId = result.rows[0].id;

  const timer = setTimeout(async () => {
    sendTimers.delete(replyId);
    await autoSendReply(replyId);
  }, delayMs);

  sendTimers.set(replyId, timer);
  console.log(`[ReplyQueue] Scheduled reply ${replyId} for lead ${leadId}. Sends at ${sendAt.toISOString()} (${Math.round(delayMs / 3600000)}h delay)`);

  return replyId;
}

/**
 * Cancel all pending replies for a lead (when new message comes in while reply is queued)
 */
export async function cancelPendingRepliesForLead(leadId: number) {
  const pool = getLocalPool();
  const existing = await pool.query(
    `SELECT id FROM pending_replies WHERE lead_id = $1 AND status = 'pending'`,
    [leadId]
  );

  for (const row of existing.rows) {
    if (sendTimers.has(row.id)) {
      clearTimeout(sendTimers.get(row.id)!);
      sendTimers.delete(row.id);
    }
    await pool.query(`UPDATE pending_replies SET status = 'cancelled' WHERE id = $1`, [row.id]);
    console.log(`[ReplyQueue] Cancelled pending reply ${row.id} for lead ${leadId}`);
  }
}

/**
 * Auto-send a reply when the timer fires.
 */
async function autoSendReply(replyId: number) {
  const pool = getLocalPool();
  try {
    const result = await pool.query(
      `SELECT pr.*, l.missive_conversation_id, l.missive_contact_id, l.name as lead_name
       FROM pending_replies pr
       JOIN leads l ON l.id = pr.lead_id
       WHERE pr.id = $1 AND pr.status = 'pending'`,
      [replyId]
    );

    if (result.rows.length === 0) {
      console.log(`[ReplyQueue] Reply ${replyId} already handled (not pending)`);
      return;
    }

    const reply = result.rows[0];

    // Send via Missive API
    const sent = await sendViaMissive(reply.missive_conversation_id, reply.reply_text, reply.missive_contact_id);

    if (sent) {
      await pool.query(`UPDATE pending_replies SET status = 'sent' WHERE id = $1`, [replyId]);
      console.log(`[ReplyQueue] Reply ${replyId} sent to lead ${reply.lead_id}`);
      broadcast('reply_sent', { reply_id: replyId, lead_id: reply.lead_id });
    } else {
      console.error(`[ReplyQueue] Failed to send reply ${replyId} via Missive`);
      // Keep as pending — user can manually send
    }
  } catch (err) {
    console.error(`[ReplyQueue] Error auto-sending reply ${replyId}:`, err);
  }
}

/**
 * Manually send a reply immediately (user clicks "Send Now")
 */
export async function sendReplyNow(replyId: number): Promise<boolean> {
  const pool = getLocalPool();
  // Cancel the auto-send timer
  if (sendTimers.has(replyId)) {
    clearTimeout(sendTimers.get(replyId)!);
    sendTimers.delete(replyId);
  }

  const result = await pool.query(
    `SELECT pr.*, l.missive_conversation_id, l.missive_contact_id
     FROM pending_replies pr JOIN leads l ON l.id = pr.lead_id
     WHERE pr.id = $1 AND pr.status = 'pending'`,
    [replyId]
  );

  if (result.rows.length === 0) return false;

  const reply = result.rows[0];
  const sent = await sendViaMissive(reply.missive_conversation_id, reply.reply_text, reply.missive_contact_id);

  if (sent) {
    await pool.query(`UPDATE pending_replies SET status = 'sent' WHERE id = $1`, [replyId]);
    return true;
  }
  return false;
}

/**
 * Cancel a pending reply (user clicks "Cancel")
 */
export async function cancelReply(replyId: number): Promise<boolean> {
  const pool = getLocalPool();
  if (sendTimers.has(replyId)) {
    clearTimeout(sendTimers.get(replyId)!);
    sendTimers.delete(replyId);
  }
  const result = await pool.query(
    `UPDATE pending_replies SET status = 'cancelled' WHERE id = $1 AND status = 'pending' RETURNING id`,
    [replyId]
  );
  return result.rows.length > 0;
}

/**
 * Edit a pending reply text
 */
export async function editReply(replyId: number, newText: string): Promise<boolean> {
  const pool = getLocalPool();
  const result = await pool.query(
    `UPDATE pending_replies SET reply_text = $1, status = 'edited' WHERE id = $2 AND status IN ('pending', 'edited') RETURNING id`,
    [newText, replyId]
  );
  if (result.rows.length > 0) {
    // Reset status back to pending so auto-send still works
    await pool.query(`UPDATE pending_replies SET status = 'pending' WHERE id = $1`, [replyId]);
    return true;
  }
  return false;
}

/**
 * Send a message via Missive API
 */
async function sendViaMissive(conversationId: string | null, text: string, contactId: string | null): Promise<boolean> {
  const token = process.env.MISSIVE_API_TOKEN;
  const accountId = process.env.MISSIVE_INSTAGRAM_ACCOUNT_ID || 'ba10d543-d027-4633-a652-1e7b30858a37';

  if (!token || !conversationId) {
    console.log(`[Missive] No token or conversation ID. Would send: "${text.substring(0, 50)}..."`);
    // In dev mode, just mark as sent
    return true;
  }

  try {
    const draft: any = {
      body: text,
      conversation: conversationId,
      account: accountId,
      send: true,
    };

    // Instagram requires to_fields with the recipient's IG user ID
    if (contactId) {
      draft.to_fields = [{ id: contactId }];
    }

    const response = await fetch('https://public.missiveapp.com/v1/drafts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ drafts: draft }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error(`[Missive] Send failed: ${response.status} — ${errBody}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[Missive] Send error:', err);
    return false;
  }
}
