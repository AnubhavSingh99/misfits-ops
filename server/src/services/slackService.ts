import { Pool } from 'pg';
import { logger } from '../utils/logger';

// Get token lazily to ensure dotenv has loaded
const getSlackBotToken = () => process.env.SLACK_BOT_TOKEN || '';
const SLACK_API_URL = 'https://slack.com/api';

// User IDs to tag on SLA breach
const SLA_BREACH_NOTIFY_USERS = [
  'U0979N8FA10', // Saurabh
  'U09TGNUB2N7', // Kuldeep
];

// Channel mappings
export const SLACK_CHANNELS = {
  bugs: { id: 'C0974HE5D0T', name: '#bugs' },
  marketing: { id: 'C0979NWV7NW', name: '#marketing' },
  finance: { id: 'C09G0376DU4', name: '#finance' },
  ops: { id: 'C0974GFH275', name: '#quality-ops-external' },
  safety: { id: 'C09778605DH', name: '#safety-concerns' },
  random: { id: 'C0A141Y2ZJQ', name: '#customer-support' },
  sla_breach: { id: 'C0A1UDAGY48', name: '#quality-leader-issues' }
} as const;

export type SlackChannelType = keyof typeof SLACK_CHANNELS;

let pool: Pool;

export function initSlackService(dbPool: Pool) {
  pool = dbPool;
}

interface SlackResponse {
  ok: boolean;
  error?: string;
  ts?: string;
  channel?: string;
}

/**
 * Post a message to Slack
 */
async function postMessage(channel: string, text: string, blocks?: any[]): Promise<SlackResponse> {
  try {
    const response = await fetch(`${SLACK_API_URL}/chat.postMessage`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getSlackBotToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        channel,
        text,
        blocks
      })
    });

    const data = await response.json() as SlackResponse;

    if (!data.ok) {
      logger.error(`Slack API error: ${data.error}`);
    }

    return data;
  } catch (error) {
    logger.error('Failed to post to Slack:', error);
    return { ok: false, error: 'Network error' };
  }
}

/**
 * Post a reply in a thread
 */
async function postThreadReply(channel: string, threadTs: string, text: string): Promise<SlackResponse> {
  try {
    const response = await fetch(`${SLACK_API_URL}/chat.postMessage`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getSlackBotToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        channel,
        thread_ts: threadTs,
        text
      })
    });

    return await response.json() as SlackResponse;
  } catch (error) {
    logger.error('Failed to post thread reply:', error);
    return { ok: false, error: 'Network error' };
  }
}

/**
 * Send a direct message to a user
 * Opens a DM conversation first, then sends the message
 */
async function sendDirectMessage(userId: string, text: string): Promise<SlackResponse> {
  try {
    // First, open a DM conversation with the user
    const openResponse = await fetch(`${SLACK_API_URL}/conversations.open`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getSlackBotToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        users: userId
      })
    });

    const openData = await openResponse.json() as { ok: boolean; channel?: { id: string }; error?: string };

    if (!openData.ok || !openData.channel) {
      logger.error(`Failed to open DM conversation: ${openData.error}`);
      return { ok: false, error: openData.error || 'Failed to open DM' };
    }

    const dmChannelId = openData.channel.id;

    // Now send the message to the DM channel
    const response = await fetch(`${SLACK_API_URL}/chat.postMessage`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getSlackBotToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        channel: dmChannelId,
        text
      })
    });

    const data = await response.json() as SlackResponse;

    if (!data.ok) {
      logger.error(`Slack DM API error: ${data.error}`);
    }

    return data;
  } catch (error) {
    logger.error('Failed to send DM:', error);
    return { ok: false, error: 'Network error' };
  }
}

/**
 * Format ticket for Slack message
 */
function formatTicketMessage(ticket: any): { text: string; blocks: any[] } {
  const priorityEmoji = {
    critical: '🔴',
    high: '🟠',
    normal: '🟢'
  }[ticket.priority] || '⚪';

  const text = `New CS Ticket: ${ticket.ticket_number} - ${ticket.subject}`;

  const blocks: any[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `🎫 Ticket: ${ticket.ticket_number}`,
        emoji: true
      }
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Subject:*\n${ticket.subject}`
        },
        {
          type: 'mrkdwn',
          text: `*Priority:* ${priorityEmoji} ${ticket.priority}`
        },
        {
          type: 'mrkdwn',
          text: `*Stakeholder:*\n${ticket.stakeholder_type}`
        },
        {
          type: 'mrkdwn',
          text: `*Status:*\n${ticket.status}`
        },
        {
          type: 'mrkdwn',
          text: `*Contact:*\n${ticket.user_contact || 'N/A'}`
        },
        {
          type: 'mrkdwn',
          text: `*Name:*\n${ticket.user_name || 'N/A'}`
        },
        ...(ticket.stakeholder_type === 'leader' && ticket.club_name ? [{
          type: 'mrkdwn',
          text: `*Club:*\n${ticket.club_name}`
        }] : [])
      ]
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Description:*\n${ticket.description || 'No description'}`
      }
    }
  ];

  // Add attachments if present
  const attachments = ticket.attachments || [];
  if (attachments.length > 0) {
    const images: string[] = [];
    const pdfs: string[] = [];
    const links: string[] = [];

    // Categorize attachments
    for (const url of attachments) {
      if (typeof url !== 'string') continue;
      if (/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url) || url.includes('image')) {
        images.push(url);
      } else if (/\.pdf$/i.test(url)) {
        pdfs.push(url);
      } else {
        links.push(url);
      }
    }

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Attachments:* ${attachments.length} file(s)`
      }
    });

    // Add images (max 3)
    for (const url of images.slice(0, 3)) {
      blocks.push({
        type: 'image',
        image_url: url,
        alt_text: 'Image attachment'
      });
    }

    // Add PDFs and links as text
    if (pdfs.length > 0 || links.length > 0) {
      const linksList = [
        ...pdfs.map((url, i) => `📄 <${url}|PDF ${i + 1}>`),
        ...links.map((url, i) => `🔗 <${url}|Link ${i + 1}>`)
      ].join('\n');

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: linksList
        }
      });
    }

    // Note if more images exist
    if (images.length > 3) {
      blocks.push({
        type: 'context',
        elements: [{
          type: 'mrkdwn',
          text: `_+${images.length - 3} more image(s)_`
        }]
      });
    }
  }

  blocks.push(
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Created: ${new Date(ticket.created_at).toLocaleString('en-IN')} | Reply with \`@Miffy resolved\` to close`
        }
      ]
    },
    {
      type: 'divider'
    }
  );

  return { text, blocks };
}

/**
 * Send a ticket to Slack channel
 */
export async function sendTicketToSlack(
  ticketId: number,
  channelType: SlackChannelType
): Promise<{ success: boolean; error?: string; messageTs?: string }> {
  try {
    // Get ticket details
    const ticketResult = await pool.query(`
      SELECT q.*, qt.name as query_type_name, qst.name as query_subtype_name
      FROM cs_queries q
      LEFT JOIN cs_query_types qt ON q.query_type_id = qt.id
      LEFT JOIN cs_query_types qst ON q.query_subtype_id = qst.id
      WHERE q.id = $1
    `, [ticketId]);

    if (ticketResult.rows.length === 0) {
      return { success: false, error: 'Ticket not found' };
    }

    const ticket = ticketResult.rows[0];
    const channel = SLACK_CHANNELS[channelType];

    // Check if already sent to this channel
    if (ticket.slack_channel === channel.id) {
      return { success: false, error: 'Ticket already sent to this channel' };
    }

    // Format and send message
    const { text, blocks } = formatTicketMessage(ticket);
    const response = await postMessage(channel.id, text, blocks);

    if (!response.ok) {
      return { success: false, error: response.error || 'Failed to send message' };
    }

    // Update ticket with Slack info
    await pool.query(`
      UPDATE cs_queries
      SET slack_channel = $1,
          slack_channel_name = $2,
          slack_message_ts = $3,
          slack_sent_at = NOW()
      WHERE id = $4
    `, [channel.id, channel.name, response.ts, ticketId]);

    logger.info(`Ticket ${ticket.ticket_number} sent to ${channel.name}`);

    return { success: true, messageTs: response.ts };
  } catch (error) {
    logger.error('Error sending ticket to Slack:', error);
    return { success: false, error: 'Internal error' };
  }
}

/**
 * Send SLA breach notification
 *
 * Flow:
 * 1. First SLA breach → New message in #quality-leader-issues (NO tags)
 * 2. 24 hours later (if still open) → Thread reply WITH @Saurabh @Kuldeep tags
 */
export async function sendSLABreachNotification(ticketId: number, isFirstNotification: boolean = true): Promise<{ success: boolean; error?: string }> {
  try {
    const ticketResult = await pool.query(`
      SELECT q.*, qt.name as query_type_name
      FROM cs_queries q
      LEFT JOIN cs_query_types qt ON q.query_type_id = qt.id
      WHERE q.id = $1
    `, [ticketId]);

    if (ticketResult.rows.length === 0) {
      return { success: false, error: 'Ticket not found' };
    }

    const ticket = ticketResult.rows[0];

    // Guard: don't send for closed tickets (double-check in case status changed between query and send)
    if (['resolved', 'resolution_communicated'].includes(ticket.status)) {
      logger.info(`Skipping SLA breach notification for ${ticket.ticket_number} - already ${ticket.status}`);
      return { success: false, error: 'Ticket already closed' };
    }

    const channel = SLACK_CHANNELS.sla_breach;

    // Calculate hours since creation
    const hoursElapsed = Math.round((Date.now() - new Date(ticket.created_at).getTime()) / (1000 * 60 * 60));

    // Build user mentions - for both first notification and escalation
    const userMentions = SLA_BREACH_NOTIFY_USERS.length > 0
      ? SLA_BREACH_NOTIFY_USERS.map(id => `<@${id}>`).join(' ') + ' '
      : '';

    if (isFirstNotification) {
      // FIRST NOTIFICATION: New message WITH tags
      const text = `${userMentions}⚠️ SLA BREACH: Ticket ${ticket.ticket_number} has exceeded ${ticket.sla_hours}h SLA (${hoursElapsed}h elapsed)`;

      const blocks: any[] = [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '⚠️ SLA BREACH ALERT',
            emoji: true
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `🔔 ${userMentions}Please review this ticket.`
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Ticket:*\n${ticket.ticket_number}`
            },
            {
              type: 'mrkdwn',
              text: `*Subject:*\n${ticket.subject}`
            },
            {
              type: 'mrkdwn',
              text: `*SLA:*\n${ticket.sla_hours}h`
            },
            {
              type: 'mrkdwn',
              text: `*Elapsed:*\n${hoursElapsed}h ⏰`
            },
            {
              type: 'mrkdwn',
              text: `*Contact:*\n${ticket.user_contact || 'N/A'}`
            },
            {
              type: 'mrkdwn',
              text: `*Status:*\n${ticket.status}`
            }
          ]
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Created: ${new Date(ticket.created_at).toLocaleString('en-IN')}`
            }
          ]
        }
      ];

      // Post new message
      const response = await postMessage(channel.id, text, blocks);

      // Save the message timestamp for future thread replies
      if (response.ok && response.ts) {
        await pool.query(`
          UPDATE cs_queries
          SET sla_breach_notified = TRUE,
              sla_breach_notified_at = NOW(),
              sla_breach_message_ts = $2
          WHERE id = $1
        `, [ticketId, response.ts]);
      } else {
        await pool.query(`
          UPDATE cs_queries
          SET sla_breach_notified = TRUE,
              sla_breach_notified_at = NOW()
          WHERE id = $1
        `, [ticketId]);
      }

      logger.info(`SLA breach notification sent for ticket ${ticket.ticket_number} (first notification)`);

    } else {
      // ESCALATION: Thread reply WITH tags
      const text = `${userMentions}🚨 ESCALATION: Ticket ${ticket.ticket_number} still unresolved after ${hoursElapsed}h! Please take immediate action.`;

      // Post as thread reply to the original SLA breach message
      if (ticket.sla_breach_message_ts) {
        await postThreadReply(channel.id, ticket.sla_breach_message_ts, text);

        // Update notification timestamp
        await pool.query(`
          UPDATE cs_queries
          SET sla_breach_notified_at = NOW()
          WHERE id = $1
        `, [ticketId]);

        logger.info(`SLA breach escalation sent for ticket ${ticket.ticket_number} (thread reply)`);
      } else {
        // No message_ts saved from first notification - send new message and save ts for future
        const response = await postMessage(channel.id, text);

        if (response.ok && response.ts) {
          await pool.query(`
            UPDATE cs_queries
            SET sla_breach_notified_at = NOW(),
                sla_breach_message_ts = $2
            WHERE id = $1
          `, [ticketId, response.ts]);
          logger.info(`SLA breach escalation sent for ticket ${ticket.ticket_number} (new message - ts was missing, now saved)`);
        } else {
          await pool.query(`
            UPDATE cs_queries
            SET sla_breach_notified_at = NOW()
            WHERE id = $1
          `, [ticketId]);
          logger.info(`SLA breach escalation sent for ticket ${ticket.ticket_number} (new message - ts still missing)`);
        }
      }
    }

    return { success: true };
  } catch (error) {
    logger.error('Error sending SLA breach notification:', error);
    return { success: false, error: 'Internal error' };
  }
}

/**
 * Get available channel types for dropdown
 */
export function getChannelTypes(): Array<{ value: SlackChannelType; label: string; channel: string }> {
  return [
    { value: 'bugs', label: 'Tech/Bugs', channel: '#bugs' },
    { value: 'marketing', label: 'Marketing', channel: '#marketing' },
    { value: 'finance', label: 'Finance', channel: '#finance' },
    { value: 'ops', label: 'Ops', channel: '#quality-ops-external' },
    { value: 'safety', label: 'Safety', channel: '#safety-concerns' },
    { value: 'random', label: 'General', channel: '#customer-support' }
  ];
}

/**
 * Check for SLA breaches and send notifications
 * This should be called periodically (e.g., every hour)
 *
 * Logic:
 * - First breach: New message in #quality-leader-issues
 * - Every 24 hours after: Thread reply to that message until closed
 */
export async function checkSLABreaches(): Promise<{ checked: number; notified: number }> {
  try {
    // Find tickets that have breached SLA and need notification:
    // 1. Never notified yet, OR
    // 2. Last notified 24+ hours ago (for escalating reminders)
    const result = await pool.query(`
      SELECT id, ticket_number, sla_hours, created_at, sla_breach_notified, sla_breach_notified_at, sla_breach_message_ts
      FROM cs_queries
      WHERE status NOT IN ('resolved', 'resolution_communicated')
        AND created_at + (sla_hours || ' hours')::interval < NOW()
        AND (
          sla_breach_notified = FALSE
          OR (sla_breach_notified = TRUE AND sla_breach_notified_at < NOW() - INTERVAL '24 hours')
        )
    `);

    let notified = 0;
    for (const ticket of result.rows) {
      // Use sla_breach_notified as the reliable indicator for first notification
      // (sla_breach_message_ts might be missing if Slack API had issues saving the ts)
      const isFirstNotification = !ticket.sla_breach_notified;
      const response = await sendSLABreachNotification(ticket.id, isFirstNotification);
      if (response.success) {
        notified++;
      }
    }

    logger.info(`SLA breach check: ${result.rows.length} breached, ${notified} notified`);

    return { checked: result.rows.length, notified };
  } catch (error) {
    logger.error('Error checking SLA breaches:', error);
    return { checked: 0, notified: 0 };
  }
}

/**
 * Slack user IDs for leader requirement closure notifications
 */
const LEADER_REQ_SLACK_USERS = {
  // Growth team closure notification
  growth_team: 'U09PA2G5V6C', // Saumya

  // Platform team closure notifications by team
  platform_blue: 'U0979N4LYHG', // Shashwat
  platform_yellow: 'U0974R1UMMH', // Kriti

  // Green team - split by activity
  platform_green_riya: 'U096UE9DNK1', // Riya (Music, Basketball, Dance, Pickleball)
  platform_green_tanya: 'U09S8TM73TJ', // Tanya (Other activities in green)
};

// Activities that go to Riya in green team
const RIYA_ACTIVITIES = ['Music', 'Basketball', 'Dance', 'Pickleball'];

/**
 * Send notification when a leader requirement is closed
 *
 * @param requirement - The leader requirement that was closed
 * @param closedBy - 'growth_team' or 'platform_team'
 */
export async function sendLeaderRequirementClosureNotification(
  requirement: {
    id: number;
    name: string;
    activity_name?: string;
    city_name?: string;
    area_name?: string;
    team?: string;
  },
  closedBy: 'growth_team' | 'platform_team'
): Promise<{ success: boolean; error?: string }> {
  try {
    let slackUserId: string;
    let recipientName: string;

    if (closedBy === 'growth_team') {
      slackUserId = LEADER_REQ_SLACK_USERS.growth_team;
      recipientName = 'Saumya';
    } else {
      // Platform team - determine by team color and activity
      const team = requirement.team?.toLowerCase();

      if (team === 'blue') {
        slackUserId = LEADER_REQ_SLACK_USERS.platform_blue;
        recipientName = 'Shashwat';
      } else if (team === 'yellow') {
        slackUserId = LEADER_REQ_SLACK_USERS.platform_yellow;
        recipientName = 'Kriti';
      } else {
        // Green team - check activity
        const activityName = requirement.activity_name || '';
        if (RIYA_ACTIVITIES.some(a => activityName.toLowerCase().includes(a.toLowerCase()))) {
          slackUserId = LEADER_REQ_SLACK_USERS.platform_green_riya;
          recipientName = 'Riya';
        } else {
          slackUserId = LEADER_REQ_SLACK_USERS.platform_green_tanya;
          recipientName = 'Tanya';
        }
      }
    }

    // Build location string
    const location = [requirement.activity_name, requirement.city_name, requirement.area_name]
      .filter(Boolean)
      .join(' > ');

    const closedByLabel = closedBy === 'growth_team' ? 'Growth Team' : 'Platform Team';

    const text = `Leader requirement closed by ${closedByLabel}:\n*${requirement.name}*\n${location ? `📍 ${location}` : ''}`;

    // Send DM to the user
    const response = await sendDirectMessage(slackUserId, text);

    if (response.ok) {
      logger.info(`Leader requirement closure notification sent to ${recipientName} for requirement ${requirement.id}`);
      return { success: true };
    } else {
      logger.error(`Failed to send leader requirement closure notification: ${response.error}`);
      return { success: false, error: response.error };
    }
  } catch (error) {
    logger.error('Error sending leader requirement closure notification:', error);
    return { success: false, error: 'Internal error' };
  }
}
