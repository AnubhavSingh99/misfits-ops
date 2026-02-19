import { getLocalPool } from '../database';
import { createPendingReply } from './replyQueue';
import { createCalendarEvent, updateCalendarEvent } from './calendarService';
import { broadcast } from './sseManager';
import { pickAutoReply } from './templates';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

interface AIClassification {
  classification: 'weird_spam' | 'normal_first_reply' | 'normal_chatting_no_time' | 'vague_time' | 'clear_datetime' | 'reschedule_clear' | 'reschedule_vague' | 'not_interested' | 'media_only' | 'call_confirmed';
  extracted_phone: string | null;
  extracted_datetime: string | null; // ISO string
  summary: string;
}

/**
 * Process a batch of messages for a lead using Claude AI.
 * This is the core intelligence layer.
 */
export async function processMessageBatch(leadId: number, messages: any[]) {
  const pool = getLocalPool();
  try {
    // Get the lead
    const leadResult = await pool.query('SELECT * FROM leads WHERE id = $1', [leadId]);
    if (leadResult.rows.length === 0) {
      console.error(`[AI] Lead ${leadId} not found`);
      return;
    }
    const lead = leadResult.rows[0];

    // Manual mode — skip all automation, just update last_activity_at
    if (lead.manual_mode) {
      await pool.query(`UPDATE leads SET last_activity_at = NOW() WHERE id = $1`, [leadId]);
      console.log(`[AI] Lead ${leadId} is in manual mode. Skipping automation.`);
      broadcast('lead_updated', { lead_id: leadId, classification: 'manual_mode' });
      return;
    }

    // Check edge cases before processing
    // 1. Converted/Onboarded -> flag, don't auto-reply
    if (['CONVERTED', 'ONBOARDED'].includes(lead.pipeline_stage)) {
      await pool.query(
        `UPDATE leads SET flag = 'weird_message', last_activity_at = NOW(), updated_at = NOW(),
         activity_log = activity_log || $1::jsonb WHERE id = $2`,
        [JSON.stringify([{
          action: 'flag_change', old_value: lead.flag || 'none', new_value: 'post_conversion_message',
          created_at: new Date().toISOString()
        }]), leadId]
      );
      console.log(`[AI] Lead ${leadId} is ${lead.pipeline_stage}. Flagged, no auto-reply.`);
      return;
    }

    // 2. Ghosted/Not Interested -> reactivate to IN_CONVERSATION
    //    BUT if they have a future call scheduled, don't reactivate (treat as post-schedule)
    const hasFutureCallEarly = lead.call_scheduled_at && new Date(lead.call_scheduled_at) > new Date();
    if (['GHOSTED', 'NOT_INTERESTED'].includes(lead.pipeline_stage) && !hasFutureCallEarly) {
      await pool.query(
        `UPDATE leads SET pipeline_stage = 'IN_CONVERSATION', flag = NULL, last_activity_at = NOW(), updated_at = NOW(),
         activity_log = activity_log || $1::jsonb WHERE id = $2`,
        [JSON.stringify([{
          action: 'stage_change', old_value: lead.pipeline_stage, new_value: 'IN_CONVERSATION',
          created_at: new Date().toISOString()
        }]), leadId]
      );
      console.log(`[AI] Lead ${leadId} reactivated from ${lead.pipeline_stage} to IN_CONVERSATION`);
    } else if (['GHOSTED', 'NOT_INTERESTED'].includes(lead.pipeline_stage) && hasFutureCallEarly) {
      console.log(`[AI] Lead ${leadId} is ${lead.pipeline_stage} but has future call scheduled. Treating as post-schedule, not reactivating.`);
    }

    // Determine context
    const isFirstReply = lead.pipeline_stage === 'DM_SENT';
    // Treat as post-schedule if stage is CALL_SCHEDULED OR there's an active future call
    const hasFutureCall = lead.call_scheduled_at && new Date(lead.call_scheduled_at) > new Date();
    const isPostSchedule = lead.pipeline_stage === 'CALL_SCHEDULED' || hasFutureCall;
    const hasPhoneAlready = !!lead.whatsapp_number;

    // Call Claude API for classification
    const classification = await classifyWithClaude(lead, messages, isFirstReply, isPostSchedule);

    if (!classification) {
      console.error(`[AI] Classification failed for lead ${leadId}`);
      await flagLead(leadId, lead, 'weird_message', 'AI classification failed');
      return;
    }

    console.log(`[AI] Lead ${leadId} classified as: ${classification.classification}`);

    // Extract phone number if found (always, regardless of classification)
    if (classification.extracted_phone && !lead.whatsapp_number) {
      await pool.query(
        `UPDATE leads SET whatsapp_number = $1, updated_at = NOW() WHERE id = $2`,
        [classification.extracted_phone, leadId]
      );
      console.log(`[AI] Phone extracted for lead ${leadId}: ${classification.extracted_phone}`);
    }

    // Handle classification results
    let skipReply = false;
    switch (classification.classification) {
      case 'weird_spam':
        await flagLead(leadId, lead, 'weird_message', classification.summary);
        skipReply = true;
        break;

      case 'media_only':
        await flagLead(leadId, lead, 'weird_message', 'Media-only message');
        skipReply = true;
        break;

      case 'not_interested':
        await pool.query(
          `UPDATE leads SET pipeline_stage = 'NOT_INTERESTED', flag = NULL, last_activity_at = NOW(), updated_at = NOW(),
           activity_log = activity_log || $1::jsonb WHERE id = $2`,
          [JSON.stringify([{
            action: 'stage_change', old_value: lead.pipeline_stage, new_value: 'NOT_INTERESTED',
            created_at: new Date().toISOString()
          }]), leadId]
        );
        break;

      case 'normal_first_reply':
      case 'normal_chatting_no_time':
        // Move to IN_CONVERSATION if needed
        if (lead.pipeline_stage === 'DM_SENT' || lead.pipeline_stage === 'FOLLOWED') {
          await pool.query(
            `UPDATE leads SET pipeline_stage = 'IN_CONVERSATION', last_activity_at = NOW(), updated_at = NOW(),
             activity_log = activity_log || $1::jsonb WHERE id = $2`,
            [JSON.stringify([{
              action: 'stage_change', old_value: lead.pipeline_stage, new_value: 'IN_CONVERSATION',
              created_at: new Date().toISOString()
            }]), leadId]
          );
        }
        break;

      case 'vague_time':
        // Reply asking for specifics (no flag — give them a chance to clarify)
        break;

      case 'defer_reconnect':
        // Lead says "reconnect later" / "check back next week" — flag for manual follow-up
        await flagLead(leadId, lead, 'vague_time', classification.summary);
        skipReply = true;
        break;

      case 'mail_request':
        // Lead asks for email — reply nudging towards a call
        break;

      case 'clear_datetime':
        if (classification.extracted_datetime) {
          // Check if date is in the past
          const extractedDate = new Date(classification.extracted_datetime);
          if (extractedDate < new Date()) {
            await flagLead(leadId, lead, 'vague_time', 'Extracted date is in the past');
            skipReply = true;
            break;
          }

          await pool.query(
            `UPDATE leads SET pipeline_stage = 'CALL_SCHEDULED', call_scheduled_at = $1,
             flag = NULL, last_activity_at = NOW(), updated_at = NOW(),
             activity_log = activity_log || $2::jsonb WHERE id = $3`,
            [
              classification.extracted_datetime,
              JSON.stringify([{
                action: 'stage_change', old_value: lead.pipeline_stage, new_value: 'CALL_SCHEDULED',
                created_at: new Date().toISOString()
              }]),
              leadId,
            ]
          );

          // Create Google Calendar event with Meet link
          await createCalendarEvent(leadId, lead.name, lead.city, classification.extracted_datetime);
        }
        break;

      case 'reschedule_clear':
        if (classification.extracted_datetime) {
          const extractedDate = new Date(classification.extracted_datetime);
          if (extractedDate < new Date()) {
            await flagLead(leadId, lead, 'vague_time', 'Reschedule date is in the past');
            skipReply = true;
            break;
          }

          await pool.query(
            `UPDATE leads SET call_scheduled_at = $1, last_activity_at = NOW(), updated_at = NOW(),
             activity_log = activity_log || $2::jsonb WHERE id = $3`,
            [
              classification.extracted_datetime,
              JSON.stringify([{
                action: 'reschedule', old_value: lead.call_scheduled_at, new_value: classification.extracted_datetime,
                created_at: new Date().toISOString()
              }]),
              leadId,
            ]
          );

          // Update Google Calendar event if one exists
          if (lead.google_calendar_event_id) {
            await updateCalendarEvent(leadId, lead.google_calendar_event_id, classification.extracted_datetime);
          } else {
            await createCalendarEvent(leadId, lead.name, lead.city, classification.extracted_datetime);
          }
        }
        break;

      case 'reschedule_vague':
        await flagLead(leadId, lead, 'vague_time', 'Reschedule request with vague time');
        skipReply = true;
        break;

      case 'call_confirmed':
        // Positive confirmation like "thanks", "ok", "looking forward", "great"
        // No reply needed — don't send anything back
        skipReply = true;
        break;
    }

    // Post-schedule: treat clear_datetime as a reschedule (AI may not always classify as reschedule_clear)
    if (isPostSchedule && classification.classification === 'clear_datetime' && classification.extracted_datetime) {
      console.log(`[AI] Lead ${leadId} is post-schedule but sent clear_datetime. Treating as reschedule.`);
      const extractedDate = new Date(classification.extracted_datetime);
      if (extractedDate > new Date()) {
        await pool.query(
          `UPDATE leads SET call_scheduled_at = $1, pipeline_stage = 'CALL_SCHEDULED', flag = NULL, last_activity_at = NOW(), updated_at = NOW(),
           activity_log = activity_log || $2::jsonb WHERE id = $3`,
          [
            classification.extracted_datetime,
            JSON.stringify([{
              action: 'reschedule', old_value: lead.call_scheduled_at, new_value: classification.extracted_datetime,
              created_at: new Date().toISOString()
            }]),
            leadId,
          ]
        );
        if (lead.google_calendar_event_id) {
          await updateCalendarEvent(leadId, lead.google_calendar_event_id, classification.extracted_datetime);
        } else {
          await createCalendarEvent(leadId, lead.name, lead.city, classification.extracted_datetime);
        }
        // Use reschedule reply
        classification.classification = 'reschedule_clear';
      } else {
        await flagLead(leadId, lead, 'vague_time', 'Reschedule date is in the past');
        skipReply = true;
      }
    }

    // Post-schedule: vague_time means they're being unhelpful after we asked — flag it
    if (isPostSchedule && classification.classification === 'vague_time') {
      console.log(`[AI] Lead ${leadId} is post-schedule with vague time. Flagging.`);
      await flagLead(leadId, lead, 'vague_time', classification.summary);
      skipReply = true;
    }

    // If lead is post-schedule and message wasn't a known action, flag for manual handling
    if (isPostSchedule && !['reschedule_clear', 'reschedule_vague', 'not_interested', 'call_confirmed', 'weird_spam', 'media_only', 'defer_reconnect', 'mail_request', 'clear_datetime', 'vague_time'].includes(classification.classification)) {
      console.log(`[AI] Lead ${leadId} is post-schedule but sent unhandled message type: ${classification.classification}. Flagging.`);
      await flagLead(leadId, lead, 'needs_attention', classification.summary);
      skipReply = true;
    }

    // Don't send auto-reply for flagged/problematic classifications
    if (skipReply) {
      console.log(`[AI] Skipping auto-reply for lead ${leadId} (flagged or problematic)`);
      broadcast('lead_updated', { lead_id: leadId, classification: classification.classification });
      return;
    }

    // Pick the right auto-reply from our templates (not AI-generated)
    const replyText = pickAutoReply({
      isFirstReply,
      hasPhoneAlready,
      extractedPhone: classification.extracted_phone,
      extractedDatetime: classification.extracted_datetime,
      classification: classification.classification,
    });

    if (replyText) {
      await createPendingReply(leadId, replyText);
      console.log(`[AI] Pending reply created for lead ${leadId}: "${replyText.substring(0, 60)}..."`);
    }

    // Update last_activity_at
    await pool.query(`UPDATE leads SET last_activity_at = NOW() WHERE id = $1`, [leadId]);

    // Broadcast real-time update to dashboard
    broadcast('lead_updated', { lead_id: leadId, classification: classification.classification });

  } catch (err) {
    console.error(`[AI] Error processing batch for lead ${leadId}:`, err);
  }
}

async function flagLead(leadId: number, lead: any, flagType: string, summary: string) {
  const pool = getLocalPool();
  await pool.query(
    `UPDATE leads SET flag = $1, last_activity_at = NOW(), updated_at = NOW(),
     activity_log = activity_log || $2::jsonb WHERE id = $3`,
    [
      flagType,
      JSON.stringify([{
        action: 'flag_change', old_value: lead.flag || 'none', new_value: flagType,
        created_at: new Date().toISOString()
      }]),
      leadId,
    ]
  );
  await pool.query(
    `UPDATE leads SET notes = notes || $1::jsonb WHERE id = $2`,
    [JSON.stringify([{
      text: `Auto-flagged: ${summary}`,
      created_by: 'system',
      created_at: new Date().toISOString(),
    }]), leadId]
  );
}

/**
 * Call Claude API to classify messages.
 * The AI only classifies and extracts data. Reply text comes from our templates.
 */
async function classifyWithClaude(
  lead: any,
  messages: any[],
  isFirstReply: boolean,
  isPostSchedule: boolean
): Promise<AIClassification | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[AI] No ANTHROPIC_API_KEY set. Using mock classification.');
    return mockClassify(messages, isFirstReply, isPostSchedule);
  }

  const now = new Date();
  const today = now.toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  const currentTime = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const messageText = messages.map((m: any) => `[${m.sender}]: ${m.text}`).join('\n');

  const systemPrompt = `You are an AI assistant for Misfits, a community platform. You analyze incoming Instagram DMs from community leads and classify them.

Today's date: ${today}
Current time: ${currentTime} IST
Tomorrow's date: ${tomorrow}
Timezone: Asia/Kolkata (IST)

The lead's current info:
- Name: ${lead.name}
- City: ${lead.city || 'Unknown'}
- Stage: ${lead.pipeline_stage}
- Has phone number on file: ${lead.whatsapp_number ? 'Yes' : 'No'}
- Has call scheduled: ${lead.call_scheduled_at ? 'Yes, at ' + lead.call_scheduled_at : 'No'}

${isFirstReply ? 'This is the FIRST reply from this lead (they were at DM_SENT stage). We already explained Misfits in the first DM.' : ''}
${isPostSchedule ? 'This lead already has a call scheduled. Check if they want to reschedule.' : ''}

Classify the message(s) into exactly ONE of these categories:
- weird_spam: Message is spam, gibberish, or completely off-topic
- media_only: Only emojis, stickers, or references to images/voice notes with no meaningful text
- not_interested: Lead explicitly says they're not interested, want to stop, or unsubscribe
- normal_first_reply: This is their first reply and it's a normal response (hey, sure, tell me more, what do you want, etc.)
- normal_chatting_no_time: Normal conversation, questions about Misfits, or just a phone number with no time mentioned
- mail_request: Lead asks to be contacted via email/mail instead of a call ("mail me", "send me an email", "can you email the details")
- vague_time: They mention a time but it's vague ("sometime next week", "morning", "later", "weekend")
- defer_reconnect: Lead asks YOU to reconnect later instead of giving a specific time ("you check back next week", "reconnect early next week", "ping me later", "let me check and get back")
- clear_datetime: They mention a specific date and time for a call ("Thursday at 4pm", "tomorrow 5:30pm", "Feb 22 3pm")
- reschedule_clear: They want to change an existing scheduled call to a clear new date and time
- reschedule_vague: They want to reschedule but the new time is vague
- call_confirmed: Lead confirms an already-scheduled call positively ("thanks", "looking forward", "great", "sure", "ok", "perfect", "see you then")

Respond in JSON format only:
{
  "classification": "one_of_the_above",
  "extracted_phone": "Phone number if found in message (Indian format, digits only), null otherwise",
  "extracted_datetime": "ISO datetime string if clear date+time found, null otherwise",
  "summary": "Brief 1-line summary of what the lead said"
}

Important:
- Do NOT include a draft_reply field. Reply text is handled separately.
- For phone numbers: look for 10-digit Indian numbers, with or without +91 prefix
- For datetime: convert to ISO format in Asia/Kolkata timezone. ALWAYS use the FUTURE date:
  - "tom", "tmrw", "tmr", "2moro", "tomorrow" = ${tomorrow}
  - "today" = ${today} (but if the time has already passed today, use tomorrow instead)
  - "day after" = the day after tomorrow
  - If only a day name is given (e.g. "Thursday"), use the NEXT upcoming occurrence
- If the message is JUST a phone number (like "9876543210"), classify as normal_chatting_no_time with extracted_phone set
- If the message has BOTH a phone number and a clear time, classify as clear_datetime with both fields set`;

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 512,
        system: systemPrompt,
        messages: [{ role: 'user', content: `New message(s) from lead:\n\n${messageText}` }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error(`[AI] Claude API error: ${response.status} ${response.statusText} — ${errBody}`);
      return null;
    }

    const data: any = await response.json();
    const text = data.content?.[0]?.text;
    if (!text) return null;

    console.log(`[AI] Raw Claude response: ${text.substring(0, 500)}`);

    // Parse JSON from response using brace-depth-counting
    const startIdx = text.indexOf('{');
    if (startIdx === -1) return null;

    let depth = 0;
    let endIdx = -1;
    for (let i = startIdx; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') {
        depth--;
        if (depth === 0) { endIdx = i; break; }
      }
    }
    if (endIdx === -1) return null;

    const jsonStr = text.substring(startIdx, endIdx + 1);
    return JSON.parse(jsonStr) as AIClassification;
  } catch (err) {
    console.error('[AI] Error calling Claude:', err);
    return null;
  }
}

/**
 * Mock classifier for testing without API key
 */
function mockClassify(messages: any[], isFirstReply: boolean, _isPostSchedule: boolean): AIClassification {
  const text = messages.map((m: any) => m.text).join(' ').toLowerCase();

  if (!text || text.match(/^[\s\p{Emoji}]*$/u)) {
    return { classification: 'media_only', extracted_phone: null, extracted_datetime: null, summary: 'Media or emoji only' };
  }
  if (text.includes('not interested') || text.includes('stop') || text.includes('unsubscribe')) {
    return { classification: 'not_interested', extracted_phone: null, extracted_datetime: null, summary: 'Lead not interested' };
  }

  // Extract phone
  const phoneMatch = text.match(/(\+?91[\s-]?\d{5}[\s-]?\d{5}|\d{10})/);
  const phone = phoneMatch ? phoneMatch[0].replace(/[\s-]/g, '') : null;

  // Extract datetime (basic patterns for mock)
  const timePatterns = [
    /(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
    /tomorrow\s+(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
  ];
  let hasTime = false;
  for (const pattern of timePatterns) {
    if (pattern.test(text)) {
      hasTime = true;
      break;
    }
  }

  if (phone && text.replace(/[\s\+\-]/g, '').match(/^\d{10,12}$/)) {
    return {
      classification: 'normal_chatting_no_time',
      extracted_phone: phone,
      extracted_datetime: null,
      summary: 'Lead shared phone number',
    };
  }

  if (hasTime && phone) {
    const mockDatetime = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    return {
      classification: 'clear_datetime',
      extracted_phone: phone,
      extracted_datetime: mockDatetime,
      summary: 'Lead shared phone and call time',
    };
  }

  if (hasTime) {
    const mockDatetime = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    return {
      classification: 'clear_datetime',
      extracted_phone: null,
      extracted_datetime: mockDatetime,
      summary: 'Lead suggested a call time',
    };
  }

  if (phone) {
    return {
      classification: 'normal_chatting_no_time',
      extracted_phone: phone,
      extracted_datetime: null,
      summary: 'Lead shared phone number',
    };
  }

  if (isFirstReply) {
    return {
      classification: 'normal_first_reply',
      extracted_phone: null,
      extracted_datetime: null,
      summary: 'First reply from lead',
    };
  }

  return {
    classification: 'normal_chatting_no_time',
    extracted_phone: null,
    extracted_datetime: null,
    summary: 'Chatting, no time mentioned',
  };
}
