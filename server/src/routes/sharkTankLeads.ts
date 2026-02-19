import { Router, Request, Response } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { getLocalPool } from '../services/database';
import { createCalendarEvent, updateCalendarEvent } from '../services/sharkTank/calendarService';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Extract instagram handle from URL or raw handle
function extractHandle(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/instagram\.com\/([^/?]+)/i);
  if (urlMatch) return urlMatch[1].toLowerCase();
  if (trimmed.startsWith('@')) return trimmed.slice(1).toLowerCase();
  return trimmed.toLowerCase();
}

// Build instagram URL from handle
function buildInstagramUrl(handle: string): string {
  if (!handle) return '';
  return `https://instagram.com/${handle}`;
}

// CSV column name normalization
function normalizeColumnName(col: string): string {
  return col.trim().toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

// POST /api/shark-tank/leads/upload — CSV bulk import
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const pool = getLocalPool();
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const content = req.file.buffer.toString('utf-8');
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
      delimiter: [',', '\t'],
    });

    // Column mapping: CSV column (normalized) → DB field
    const columnMap: Record<string, string> = {
      'city': 'city',
      'activity': 'activity',
      'meet_up_community_name': 'name',
      'meetup_community_name': 'name',
      'community_name': 'name',
      'name': 'name',
      'days': 'days',
      'timings': 'timings',
      'area': 'area',
      'venue': 'venue',
      'ig_handle': 'instagram_raw',
      'ig': 'instagram_raw',
      'handle': 'instagram_raw',
      'instagram': 'instagram_raw',
      'followers': 'followers',
      'club_leader_name': 'leader_name',
      'leader_name': 'leader_name',
      'contact': 'whatsapp_number',
      'phone': 'whatsapp_number',
      'whatsapp': 'whatsapp_number',
      'type': 'type',
      'lead_quality': 'lead_quality',
      'quality': 'lead_quality',
      'notes': 'csv_notes',
      'assignee': 'assigned_to',
      'assigned_to': 'assigned_to',
      'assigned': 'assigned_to',
    };

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < records.length; i++) {
      const raw = records[i] as Record<string, unknown>;
      const row: Record<string, string> = {};

      for (const [csvCol, value] of Object.entries(raw)) {
        const normalized = normalizeColumnName(csvCol);
        const dbField = columnMap[normalized];
        if (dbField) {
          row[dbField] = (value as string).trim();
        }
      }

      const handle = extractHandle(row.instagram_raw || '');
      const instagramUrl = handle ? buildInstagramUrl(handle) : row.instagram_raw || null;

      if (!row.name) {
        errors.push(`Row ${i + 2}: Missing community name`);
        skipped++;
        continue;
      }

      // Duplicate detection by handle
      if (handle) {
        const existing = await pool.query('SELECT id FROM leads WHERE instagram_handle = $1', [handle]);
        if (existing.rows.length > 0) {
          skipped++;
          continue;
        }
      }

      const notes = row.csv_notes
        ? [{ text: row.csv_notes, created_by: 'csv_import', created_at: new Date().toISOString() }]
        : [];

      const activityLog = [{
        action: 'created',
        old_value: null,
        new_value: 'NOT_CONTACTED',
        created_at: new Date().toISOString(),
      }];

      await pool.query(
        `INSERT INTO leads (
          name, instagram_url, instagram_handle, whatsapp_number, city,
          activity, days, timings, area, venue, followers, leader_name, type, lead_quality,
          assigned_to, pipeline_stage, notes, activity_log, last_activity_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10, $11, $12, $13, $14,
          $15, 'NOT_CONTACTED', $16::jsonb, $17::jsonb, NOW()
        )`,
        [
          row.name,
          instagramUrl,
          handle || null,
          row.whatsapp_number || null,
          row.city || null,
          row.activity || null,
          row.days || null,
          row.timings || null,
          row.area || null,
          row.venue || null,
          row.followers ? parseInt(row.followers.replace(/[^0-9]/g, ''), 10) || null : null,
          row.leader_name || null,
          row.type || null,
          row.lead_quality || null,
          row.assigned_to || null,
          JSON.stringify(notes),
          JSON.stringify(activityLog),
        ]
      );
      imported++;
    }

    res.json({
      success: true,
      data: { imported, skipped, total: records.length, errors },
    });
  } catch (err) {
    console.error('CSV upload error:', err);
    res.status(500).json({ success: false, error: 'Failed to process CSV' });
  }
});

// POST /api/shark-tank/leads — manual lead add
router.post('/', async (req: Request, res: Response) => {
  try {
    const pool = getLocalPool();
    const { name, instagram_handle, city, leader_name, whatsapp_number, activity, area } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    const handle = instagram_handle ? extractHandle(instagram_handle) : null;
    const instagramUrl = handle ? buildInstagramUrl(handle) : null;

    if (handle) {
      const existing = await pool.query('SELECT id FROM leads WHERE instagram_handle = $1', [handle]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ success: false, error: 'Lead with this Instagram handle already exists' });
      }
    }

    const activityLog = [{
      action: 'created',
      old_value: null,
      new_value: 'NOT_CONTACTED',
      created_at: new Date().toISOString(),
    }];

    const result = await pool.query(
      `INSERT INTO leads (
        name, instagram_url, instagram_handle, whatsapp_number, city,
        leader_name, activity, area,
        pipeline_stage, activity_log, last_activity_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'NOT_CONTACTED', $9::jsonb, NOW())
      RETURNING *`,
      [name, instagramUrl, handle, whatsapp_number || null, city || null,
       leader_name || null, activity || null, area || null,
       JSON.stringify(activityLog)]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Error creating lead:', err);
    res.status(500).json({ success: false, error: 'Failed to create lead' });
  }
});

// GET /api/shark-tank/leads — list all leads with filters
router.get('/', async (req: Request, res: Response) => {
  try {
    const pool = getLocalPool();
    const { city, pipeline_stage, assigned_to, flag, search, lead_quality, activity } = req.query;

    let query = 'SELECT * FROM leads WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (city) {
      const cities = (city as string).split(',');
      query += ` AND city = ANY($${paramIndex++})`;
      params.push(cities);
    }
    if (pipeline_stage) {
      const stages = (pipeline_stage as string).split(',');
      query += ` AND pipeline_stage = ANY($${paramIndex++})`;
      params.push(stages);
    }
    if (assigned_to) {
      query += ` AND assigned_to = $${paramIndex++}`;
      params.push(assigned_to);
    }
    if (flag) {
      if (flag === 'any') {
        query += ` AND flag IS NOT NULL`;
      } else {
        query += ` AND flag = $${paramIndex++}`;
        params.push(flag);
      }
    }
    if (lead_quality) {
      query += ` AND lead_quality = $${paramIndex++}`;
      params.push(lead_quality);
    }
    if (activity) {
      query += ` AND activity = $${paramIndex++}`;
      params.push(activity);
    }
    if (search) {
      query += ` AND (name ILIKE $${paramIndex} OR instagram_handle ILIKE $${paramIndex} OR leader_name ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ' ORDER BY last_activity_at DESC NULLS LAST';

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Error fetching leads:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch leads' });
  }
});

// GET /api/shark-tank/leads/stats — pipeline stats
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const pool = getLocalPool();
    const stageResult = await pool.query(
      `SELECT pipeline_stage, COUNT(*)::int as count FROM leads GROUP BY pipeline_stage`
    );
    const cityResult = await pool.query(
      `SELECT city, COUNT(*)::int as count,
        COUNT(*) FILTER (WHERE pipeline_stage IN ('CONVERTED', 'ONBOARDED'))::int as converted
      FROM leads WHERE city IS NOT NULL GROUP BY city ORDER BY count DESC`
    );
    const totalResult = await pool.query(`SELECT COUNT(*)::int as count FROM leads`);
    const convertedResult = await pool.query(
      `SELECT COUNT(*)::int as count FROM leads WHERE pipeline_stage IN ('CONVERTED', 'ONBOARDED')`
    );

    const total = totalResult.rows[0].count;
    const converted = convertedResult.rows[0].count;

    res.json({
      success: true,
      data: {
        by_stage: stageResult.rows,
        by_city: cityResult.rows,
        total,
        converted,
        conversion_rate: total > 0 ? ((converted / total) * 100).toFixed(1) : '0.0',
      },
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
});

// GET /api/shark-tank/leads/:id — single lead
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const pool = getLocalPool();
    const result = await pool.query('SELECT * FROM leads WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Error fetching lead:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch lead' });
  }
});

// PATCH /api/shark-tank/leads/:id — update lead
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const pool = getLocalPool();
    const leadId = req.params.id;
    const updates = req.body;

    const current = await pool.query('SELECT * FROM leads WHERE id = $1', [leadId]);
    if (current.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }
    const lead = current.rows[0];

    const setClauses: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // Stage change with activity log
    if (updates.pipeline_stage && updates.pipeline_stage !== lead.pipeline_stage) {
      const activityEntry = {
        action: 'stage_change',
        old_value: lead.pipeline_stage,
        new_value: updates.pipeline_stage,
        created_at: new Date().toISOString(),
      };
      setClauses.push(`pipeline_stage = $${paramIndex++}`);
      params.push(updates.pipeline_stage);
      setClauses.push(`activity_log = activity_log || $${paramIndex++}::jsonb`);
      params.push(JSON.stringify([activityEntry]));
    }

    // Flag change with activity log
    if (updates.flag !== undefined && updates.flag !== lead.flag) {
      const activityEntry = {
        action: 'flag_change',
        old_value: lead.flag || 'none',
        new_value: updates.flag || 'none',
        created_at: new Date().toISOString(),
      };
      setClauses.push(`flag = $${paramIndex++}`);
      params.push(updates.flag || null);
      setClauses.push(`activity_log = activity_log || $${paramIndex++}::jsonb`);
      params.push(JSON.stringify([activityEntry]));
    }

    // Add a note
    if (updates.note) {
      const noteEntry = {
        text: updates.note,
        created_by: updates.created_by || 'user',
        created_at: new Date().toISOString(),
      };
      setClauses.push(`notes = notes || $${paramIndex++}::jsonb`);
      params.push(JSON.stringify([noteEntry]));
    }

    // Simple field updates
    const simpleFields = [
      'whatsapp_number', 'call_link', 'call_scheduled_at', 'missive_conversation_id',
      'message_template_id', 'assigned_to', 'leader_name', 'name', 'city', 'area',
      'activity', 'days', 'timings', 'venue', 'type', 'lead_quality', 'manual_mode',
    ];
    for (const field of simpleFields) {
      if (updates[field] !== undefined) {
        setClauses.push(`${field} = $${paramIndex++}`);
        params.push(updates[field]);
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid fields to update' });
    }

    setClauses.push(`updated_at = NOW()`);
    setClauses.push(`last_activity_at = NOW()`);

    params.push(leadId);
    const query = `UPDATE leads SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
    const result = await pool.query(query, params);
    const updatedLead = result.rows[0];

    // Create/update Google Calendar event when call_scheduled_at is manually set
    if (updates.call_scheduled_at && updates.call_scheduled_at !== lead.call_scheduled_at) {
      try {
        if (lead.google_calendar_event_id) {
          await updateCalendarEvent(Number(leadId), lead.google_calendar_event_id, updates.call_scheduled_at);
        } else {
          await createCalendarEvent(Number(leadId), updatedLead.name, updatedLead.city, updates.call_scheduled_at);
        }
      } catch (calErr) {
        console.error(`[Leads] Calendar event creation failed for lead ${leadId}:`, calErr);
      }
    }

    res.json({ success: true, data: updatedLead });
  } catch (err) {
    console.error('Error updating lead:', err);
    res.status(500).json({ success: false, error: 'Failed to update lead' });
  }
});

// DELETE /api/shark-tank/leads/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const pool = getLocalPool();
    const result = await pool.query('DELETE FROM leads WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }
    res.json({ success: true, message: 'Lead deleted' });
  } catch (err) {
    console.error('Error deleting lead:', err);
    res.status(500).json({ success: false, error: 'Failed to delete lead' });
  }
});

export default router;
