import { google } from 'googleapis';
import { getLocalPool } from '../database';

const calendar = google.calendar('v3');

function getAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

/**
 * Create a 30-minute Google Calendar event with a Google Meet link.
 * Saves the Meet link and event ID to the lead.
 */
export async function createCalendarEvent(
  leadId: number,
  leadName: string,
  city: string | null,
  scheduledAt: string // ISO datetime string
): Promise<{ meetLink: string; eventId: string } | null> {
  const pool = getLocalPool();
  const auth = getAuthClient();
  if (!auth) {
    console.log(`[Calendar] No Google credentials configured. Would create event for lead ${leadId} at ${scheduledAt}`);
    // Dev mode: generate a placeholder
    const placeholderLink = `https://meet.google.com/placeholder-${leadId}`;
    await pool.query(
      `UPDATE leads SET call_link = $1, google_calendar_event_id = $2 WHERE id = $3`,
      [placeholderLink, `dev-event-${leadId}`, leadId]
    );
    return { meetLink: placeholderLink, eventId: `dev-event-${leadId}` };
  }

  try {
    const startTime = new Date(scheduledAt);
    const endTime = new Date(startTime.getTime() + 30 * 60 * 1000); // 30 minutes
    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

    const event = await calendar.events.insert({
      auth,
      calendarId,
      conferenceDataVersion: 1,
      requestBody: {
        summary: `Misfits Call — ${leadName}${city ? ` (${city})` : ''}`,
        description: `Outreach call with ${leadName}.\nManaged by Misfits CRM.`,
        start: {
          dateTime: startTime.toISOString(),
          timeZone: 'Asia/Kolkata',
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: 'Asia/Kolkata',
        },
        conferenceData: {
          createRequest: {
            requestId: `misfits-crm-${leadId}-${Date.now()}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 30 },
            { method: 'popup', minutes: 10 },
          ],
        },
      },
    });

    const meetLink = event.data.conferenceData?.entryPoints?.find(
      (ep) => ep.entryPointType === 'video'
    )?.uri || event.data.hangoutLink || null;

    const eventId = event.data.id || null;

    if (meetLink && eventId) {
      await pool.query(
        `UPDATE leads SET call_link = $1, google_calendar_event_id = $2 WHERE id = $3`,
        [meetLink, eventId, leadId]
      );
      console.log(`[Calendar] Event created for lead ${leadId}: ${meetLink}`);
      return { meetLink, eventId };
    }

    console.warn(`[Calendar] Event created but no Meet link found for lead ${leadId}`);
    return null;
  } catch (err) {
    console.error(`[Calendar] Error creating event for lead ${leadId}:`, err);
    return null;
  }
}

/**
 * Update an existing Google Calendar event (for reschedule).
 * Updates the time and keeps the same Meet link.
 */
export async function updateCalendarEvent(
  leadId: number,
  eventId: string,
  newScheduledAt: string
): Promise<boolean> {
  const pool = getLocalPool();
  const auth = getAuthClient();
  if (!auth) {
    console.log(`[Calendar] No Google credentials. Would update event ${eventId} for lead ${leadId} to ${newScheduledAt}`);
    return true;
  }

  try {
    const startTime = new Date(newScheduledAt);
    const endTime = new Date(startTime.getTime() + 30 * 60 * 1000);
    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

    await calendar.events.patch({
      auth,
      calendarId,
      eventId,
      requestBody: {
        start: {
          dateTime: startTime.toISOString(),
          timeZone: 'Asia/Kolkata',
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: 'Asia/Kolkata',
        },
      },
    });

    // Update call_scheduled_at in DB
    await pool.query(
      `UPDATE leads SET call_scheduled_at = $1 WHERE id = $2`,
      [newScheduledAt, leadId]
    );

    console.log(`[Calendar] Event ${eventId} updated for lead ${leadId} to ${newScheduledAt}`);
    return true;
  } catch (err) {
    console.error(`[Calendar] Error updating event ${eventId} for lead ${leadId}:`, err);
    return false;
  }
}
