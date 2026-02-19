import { getLocalPool } from '../database';
import { processMessageBatch } from './aiProcessor';

// In-memory timers for the batch windows
// Key: lead_id, Value: timeout handle
const batchTimers = new Map<number, NodeJS.Timeout>();

const BATCH_WINDOW_MS = 1.5 * 60 * 1000; // 1.5 minutes

/**
 * Called when a new message arrives for a lead.
 * - If no active batch: create one, start timer
 * - If active batch: append message, reset timer
 */
export async function addMessageToBatch(leadId: number, message: { text: string; sender: string; timestamp: string; messageId?: string }) {
  const pool = getLocalPool();

  // Check for existing unprocessed batch
  const existing = await pool.query(
    `SELECT id, messages FROM message_batches WHERE lead_id = $1 AND processed = false ORDER BY created_at DESC LIMIT 1`,
    [leadId]
  );

  let batchId: number;

  if (existing.rows.length > 0) {
    // Append to existing batch
    batchId = existing.rows[0].id;
    const messages = existing.rows[0].messages || [];
    messages.push(message);

    await pool.query(
      `UPDATE message_batches SET messages = $1::jsonb WHERE id = $2`,
      [JSON.stringify(messages), batchId]
    );
  } else {
    // Create new batch
    const result = await pool.query(
      `INSERT INTO message_batches (lead_id, messages, window_start) VALUES ($1, $2::jsonb, NOW()) RETURNING id`,
      [leadId, JSON.stringify([message])]
    );
    batchId = result.rows[0].id;
  }

  // Reset the timer for this lead
  if (batchTimers.has(leadId)) {
    clearTimeout(batchTimers.get(leadId)!);
  }

  const timer = setTimeout(async () => {
    batchTimers.delete(leadId);
    await finalizeBatch(batchId, leadId);
  }, BATCH_WINDOW_MS);

  batchTimers.set(leadId, timer);

  console.log(`[Batcher] Message added to batch ${batchId} for lead ${leadId}. Timer reset (1.5 min).`);
  return batchId;
}

/**
 * Called when the silence window expires.
 * Marks the batch as processed and triggers AI processing.
 */
async function finalizeBatch(batchId: number, leadId: number) {
  const pool = getLocalPool();
  try {
    // Mark batch window end
    await pool.query(
      `UPDATE message_batches SET window_end = NOW(), processed = true WHERE id = $1`,
      [batchId]
    );

    // Get the batch messages
    const batch = await pool.query(`SELECT messages FROM message_batches WHERE id = $1`, [batchId]);
    if (batch.rows.length === 0) return;

    const messages = batch.rows[0].messages;
    console.log(`[Batcher] Batch ${batchId} finalized for lead ${leadId}. ${messages.length} messages. Processing with AI...`);

    // Trigger AI processing
    await processMessageBatch(leadId, messages);
  } catch (err) {
    console.error(`[Batcher] Error finalizing batch ${batchId}:`, err);
  }
}

/**
 * Cancel any pending batch timer for a lead
 */
export function cancelBatchTimer(leadId: number) {
  if (batchTimers.has(leadId)) {
    clearTimeout(batchTimers.get(leadId)!);
    batchTimers.delete(leadId);
    console.log(`[Batcher] Timer cancelled for lead ${leadId}`);
  }
}
