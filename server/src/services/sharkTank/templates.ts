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

  // Lead asks to be contacted via email/mail (first time)
  MAIL_REQUEST:
    `Hey! I'll mail you for sure, but I humbly request — can we also get on a very short call?`,

  // Lead insists on mail again (second time) — accept + flag
  MAIL_ACCEPT:
    `Sure, will do! :)`,

  // Vague time, truly vague ("sometime next week", "later")
  VAGUE_TIME:
    `Hey! Sure, can you tell me when exactly we should connect? Or should I reconnect early next week to check?`,

  // Day mentioned but no time, and we have phone
  VAGUE_DAY_WITH_PHONE:
    `Got it! What time on {{day}} works?`,

  // Day mentioned but no time, and we don't have phone
  VAGUE_DAY_NO_PHONE:
    `{{day}} works! What time? And drop your number too :)`,

  // Lead defers ("will get back", "busy", "later") — short acknowledgment
  DEFER_REPLY:
    `Sure`,

  // 10hr reminders (contextual)
  DEFER_REMINDER_GENERIC:
    `Hey! Just a gentle nudge. Whenever you have 15 mins free, let me know a day/time that works :)`,

  DEFER_REMINDER_NEED_TIME:
    `Hey! Just a gentle nudge — when works for a quick call?`,

  DEFER_REMINDER_NEED_TIME_AND_PHONE:
    `Hey! Just a gentle nudge — what time works and drop your number too :)`,

  // Phone given after call already scheduled
  PHONE_AFTER_SCHEDULED:
    `Got it, talk soon! 🙌`,

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
 * Extract just the day name from an ISO datetime
 */
export function formatDayOnly(isoDatetime: string): string {
  const date = new Date(isoDatetime);
  return date.toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'Asia/Kolkata' });
}

/**
 * Check if an extracted datetime is a day-only extraction (time set to 00:00)
 */
export function isDayOnly(isoDatetime: string): boolean {
  const date = new Date(isoDatetime);
  const hours = date.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  });
  return hours === '0:00' || hours === '00:00';
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
  isPostSchedule,
  mailNudgeSent,
}: {
  isFirstReply: boolean;
  hasPhoneAlready: boolean;
  extractedPhone: string | null;
  extractedDatetime: string | null;
  classification: string;
  isPostSchedule?: boolean;
  mailNudgeSent?: boolean;
}): string | null {
  // No reply for these
  if (['weird_spam', 'media_only'].includes(classification)) {
    return null;
  }

  // Defer — send "Sure" (reminder is scheduled separately in aiProcessor)
  if (classification === 'defer_reconnect') {
    return AUTO_REPLIES.DEFER_REPLY;
  }

  // Not interested — send farewell
  if (classification === 'not_interested') {
    return AUTO_REPLIES.NOT_INTERESTED;
  }

  // Vague time — check if day is known or truly vague
  if (classification === 'vague_time') {
    const hasPhone = hasPhoneAlready || !!extractedPhone;
    if (extractedDatetime && isDayOnly(extractedDatetime)) {
      const day = formatDayOnly(extractedDatetime);
      if (hasPhone) {
        return AUTO_REPLIES.VAGUE_DAY_WITH_PHONE.replace('{{day}}', day);
      } else {
        return AUTO_REPLIES.VAGUE_DAY_NO_PHONE.replace('{{day}}', day);
      }
    }
    return AUTO_REPLIES.VAGUE_TIME;
  }

  // Mail/email request — nudge first time, accept second time
  if (classification === 'mail_request') {
    if (mailNudgeSent) {
      return AUTO_REPLIES.MAIL_ACCEPT;
    }
    return AUTO_REPLIES.MAIL_REQUEST;
  }

  // Call confirmed (thanks, looking forward, etc.)
  if (classification === 'call_confirmed') {
    return null; // No reply needed
  }

  // Reschedule
  if (classification === 'reschedule_vague') {
    return AUTO_REPLIES.RESCHEDULE_VAGUE;
  }
  if (classification === 'reschedule_clear' && extractedDatetime) {
    return AUTO_REPLIES.RESCHEDULE_CLEAR.replace('{{time}}', formatTimeSlot(extractedDatetime));
  }

  // First reply with no useful data gets the standard message
  // If they gave phone/time in their first message, skip to Batch 2 logic below
  if (isFirstReply && !extractedPhone && !extractedDatetime && !hasPhoneAlready) {
    return AUTO_REPLIES.FIRST_REPLY;
  }

  const hasPhone = hasPhoneAlready || !!extractedPhone;
  const hasTime = !!extractedDatetime;

  // Phone given after call already scheduled — just acknowledge
  if (hasPhone && !hasTime && isPostSchedule) {
    return AUTO_REPLIES.PHONE_AFTER_SCHEDULED;
  }

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
