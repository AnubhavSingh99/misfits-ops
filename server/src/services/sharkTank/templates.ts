export interface MessageTemplate {
  id: number;
  name: string;
  body: string; // Use {{name}} as placeholder for lead name
}

// Manual DM templates (copy-paste into Instagram)
export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  // Templates to be defined by user
  // { id: 1, name: "Template 1 — General", body: "Hey {{name}}, ..." },
];

export function renderTemplate(templateId: number, leadName: string): string | null {
  const template = MESSAGE_TEMPLATES.find(t => t.id === templateId);
  if (!template) return null;
  return template.body.replace(/\{\{name\}\}/g, leadName);
}

// ── Auto-reply templates (system-generated responses) ──

export const AUTO_REPLIES = {
  // First reply from lead (always asks for phone + schedule)
  FIRST_REPLY:
    `Hey! Glad you connected :)\nHonestly, easier to talk about over a call than type out. There's a lot I'd love to hear from you too. Got 15 mins sometime this week? Drop your number and a day/time that works 😊`,

  // Lead gave phone number only, need schedule
  PHONE_ONLY:
    `Got it! Also, it would be great if you can give me a tentative day, date and time?`,

  // Lead gave schedule only, still need phone
  SCHEDULE_ONLY_NEED_PHONE:
    `{{time}}, locked in! Drop your number too so I can call you.`,

  // Lead gave both phone + schedule (or schedule when we already have phone)
  GOT_BOTH:
    `Perfect, {{time}} it is! Talk soon 🙌`,

  // Lead is chatting/asking questions, no phone or time given
  CHATTING_QUESTIONS:
    `Haha valid questions! Trust me it'll make way more sense on a quick call. 15 mins max. When are you free?`,

  // Lead asks to be contacted via email/mail
  MAIL_REQUEST:
    `Hey! I'll mail you for sure, but I humbly request — can we also get on a very short call?`,

  // Vague time ("sometime next week", "later this week")
  VAGUE_TIME:
    `Hey! Sure, can you tell me when exactly we should connect? Or should I reconnect early next week to check?`,

  // Lead wants to reschedule but no clear new time
  RESCHEDULE_VAGUE:
    `Hey! Sure, when can we do it at your convenience?`,

  // Lead wants to reschedule with a clear new time
  RESCHEDULE_CLEAR:
    `Done, moved to {{time}}! Talk soon 🙌`,

  // Lead confirms scheduled call (thanks, looking forward, etc.)
  CALL_CONFIRMED:
    `See you then! 🙌`,

  // Lead is not interested
  NOT_INTERESTED:
    `No worries! I hope we cross paths in the future.`,

  // Lead defers ("you reconnect later", "check back next week")
  DEFER_RECONNECT:
    null as unknown as string, // No reply — flagged for manual handling
};

/**
 * Format an ISO datetime into a friendly string like "Thursday 4pm" or "Friday 5:30pm"
 */
export function formatTimeSlot(isoDatetime: string): string {
  const date = new Date(isoDatetime);
  const day = date.toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'Asia/Kolkata' });
  const hours = date.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  }).replace(':00', '').replace(' ', '').toLowerCase();
  return `${day} ${hours}`;
}

/**
 * Pick the right auto-reply based on context.
 * Returns null if no reply should be sent.
 */
export function pickAutoReply({
  isFirstReply,
  hasPhoneAlready,
  extractedPhone,
  extractedDatetime,
  classification,
}: {
  isFirstReply: boolean;
  hasPhoneAlready: boolean;
  extractedPhone: string | null;
  extractedDatetime: string | null;
  classification: string;
}): string | null {
  // No reply for these
  if (['weird_spam', 'media_only', 'defer_reconnect'].includes(classification)) {
    return null;
  }

  // Not interested — send farewell
  if (classification === 'not_interested') {
    return AUTO_REPLIES.NOT_INTERESTED;
  }

  // Vague time — ask for specifics
  if (classification === 'vague_time') {
    return AUTO_REPLIES.VAGUE_TIME;
  }

  // Mail/email request
  if (classification === 'mail_request') {
    return AUTO_REPLIES.MAIL_REQUEST;
  }

  // Call confirmed (thanks, looking forward, etc.)
  if (classification === 'call_confirmed') {
    return AUTO_REPLIES.CALL_CONFIRMED;
  }

  // Reschedule
  if (classification === 'reschedule_vague') {
    return AUTO_REPLIES.RESCHEDULE_VAGUE;
  }
  if (classification === 'reschedule_clear' && extractedDatetime) {
    return AUTO_REPLIES.RESCHEDULE_CLEAR.replace('{{time}}', formatTimeSlot(extractedDatetime));
  }

  // First reply always gets the same message
  if (isFirstReply) {
    return AUTO_REPLIES.FIRST_REPLY;
  }

  const hasPhone = hasPhoneAlready || !!extractedPhone;
  const hasTime = !!extractedDatetime;

  // Got both phone and schedule
  if (hasPhone && hasTime) {
    return AUTO_REPLIES.GOT_BOTH.replace('{{time}}', formatTimeSlot(extractedDatetime!));
  }

  // Got phone only
  if (hasPhone && !hasTime) {
    return AUTO_REPLIES.PHONE_ONLY;
  }

  // Got schedule only, still need phone
  if (!hasPhone && hasTime) {
    return AUTO_REPLIES.SCHEDULE_ONLY_NEED_PHONE.replace('{{time}}', formatTimeSlot(extractedDatetime!));
  }

  // Chatting, no phone or time
  return AUTO_REPLIES.CHATTING_QUESTIONS;
}
