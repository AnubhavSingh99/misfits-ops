import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { queryProduction, queryProductionWrite } from '../services/database';
import { logger } from '../utils/logger';
import { runVmsSync } from './venueRepository';

// Store uploads in server/public/uploads
const uploadsDir = path.join(__dirname, '../../public/uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `venue-${Date.now()}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

const router = Router();

const VALID_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];

function getVenueLeadWriteError(action: string, error: any): { status: number; message: string } {
  const message = String(error?.message || '').trim();
  if (error?.code === '42501' || /not configured/i.test(message)) {
    return {
      status: 503,
      message: message || `Venue lead ${action} is not configured on this server.`,
    };
  }
  return {
    status: 500,
    message: message || `Failed to ${action} venue lead`,
  };
}

function getVenueLeadApiBaseUrl(): string {
  const configured = (process.env.MISFITS_API_URL || 'https://prod.misfits.net.in/api/v1').trim();
  return configured.replace(/\/api\/v1\/?$/, '');
}

async function parseProxyResponseBody(res: Response): Promise<any> {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return await res.json().catch(() => null);
  }
  const text = await res.text().catch(() => '');
  return text ? { error: text } : null;
}

function getProxyErrorMessage(payload: any, fallback: string): string {
  if (typeof payload?.error === 'string' && payload.error.trim()) return payload.error.trim();
  if (typeof payload?.message === 'string' && payload.message.trim()) return payload.message.trim();
  return fallback;
}

async function proxyVenueLeadWrite(method: string, path: string, body?: Record<string, any>) {
  const apiToken = (process.env.MISFITS_API_TOKEN || '').trim();
  if (!apiToken) {
    return {
      ok: false,
      status: 500,
      data: null,
      error: 'MISFITS_API_TOKEN is not configured. Add MISFITS_API_TOKEN in .env to use venue lead write APIs.',
    };
  }

  const url = `${getVenueLeadApiBaseUrl()}${path}`;
  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await parseProxyResponseBody(res);
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        data,
        error: getProxyErrorMessage(data, `Venue lead write failed with HTTP ${res.status}`),
      };
    }
    return { ok: true, status: res.status, data };
  } catch (error: any) {
    return {
      ok: false,
      status: 500,
      data: null,
      error: error?.message || 'Failed to reach venue lead write API',
    };
  }
}

// GET /api/venue-leads - List all venue leads from production DB
router.get('/', async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const baseQuery = `
      SELECT vl.*, f.s3_url AS image_url
      FROM venue_lead vl
      LEFT JOIN file f ON f.id = vl.image
    `;
    let result;

    if (status) {
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
      }
      result = await queryProduction(`${baseQuery} WHERE vl.status = $1 ORDER BY vl.created_at DESC`, [status]);
    } else {
      result = await queryProduction(`${baseQuery} ORDER BY vl.created_at DESC`);
    }

    res.json({ success: true, leads: result.rows });
  } catch (error: any) {
    logger.error('Error fetching venue leads:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch venue leads' });
  }
});

// GET /api/venue-leads/stats - Get lead counts by status
router.get('/stats', async (req, res) => {
  try {
    const result = await queryProduction(
      `SELECT status, COUNT(*)::int as count FROM venue_lead GROUP BY status`
    );
    const stats: Record<string, number> = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
    for (const row of result.rows) {
      stats[row.status] = row.count;
    }
    stats.total = Object.values(stats).reduce((a, b) => a + b, 0);
    res.json({ success: true, stats });
  } catch (error: any) {
    logger.error('Error fetching venue lead stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
});

// GET /api/venue-leads/cities - List all cities
router.get('/cities', async (_req, res) => {
  try {
    const result = await queryProduction(
      `SELECT id, name FROM city ORDER BY name ASC`
    );
    res.json({ success: true, cities: result.rows });
  } catch (error: any) {
    logger.error('Error fetching cities:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch cities' });
  }
});

// GET /api/venue-leads/areas?city=CityName - List areas for a city
router.get('/areas', async (req, res) => {
  const { city } = req.query as { city?: string };
  if (!city) return res.status(400).json({ success: false, error: 'city query param required' });
  try {
    const result = await queryProduction(
      `SELECT a.id, a.name FROM area a
       JOIN city c ON a.city_id = c.id
       WHERE LOWER(c.name) = LOWER($1)
       ORDER BY a.name ASC`,
      [city]
    );
    res.json({ success: true, areas: result.rows });
  } catch (error: any) {
    logger.error('Error fetching areas:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch areas' });
  }
});

// POST /api/venue-leads/:id/approve - Approve a venue lead
router.post('/:id/approve', async (req, res) => {
  const { id } = req.params;
  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ success: false, error: 'Invalid lead ID' });
  }
  try {
    // Fetch the lead
    const leadResult = await queryProduction(
      `SELECT * FROM venue_lead WHERE id = $1`,
      [id]
    );
    if (leadResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Venue lead not found' });
    }

    const lead = leadResult.rows[0];
    if (lead.status !== 'PENDING') {
      return res.status(400).json({ success: false, error: 'Lead is not in PENDING status' });
    }

    const proxyResult = await proxyVenueLeadWrite('POST', `/api/venue-lead/${id}/approve`);
    if (!proxyResult.ok) {
      return res.status(proxyResult.status).json({ success: false, error: proxyResult.error });
    }

    const locationId = proxyResult.data?.location_id;

    // Sync new location into venue_repository immediately (fire-and-forget)
    runVmsSync().catch(err => logger.warn('Post-approval VMS sync failed:', err));

    logger.info(`Venue lead ${id} approved, location ${locationId} created`);
    res.json({
      success: true,
      location_id: locationId,
      message: proxyResult.data?.message || 'Venue lead approved and location created',
    });
  } catch (error: any) {
    logger.error(`Error approving venue lead ${id}:`, error);
    const writeError = getVenueLeadWriteError('approve', error);
    res.status(writeError.status).json({ success: false, error: writeError.message });
  }
});

// POST /api/venue-leads - Create a new venue lead
router.post('/', async (req, res) => {
  const {
    venue_name, address, city, area, google_maps_link,
    lat, lng, contact_name, contact_phone, notes, venue_info
  } = req.body;

  if (!venue_name) {
    return res.status(400).json({ success: false, error: 'venue_name is required' });
  }

  try {
    const proxyPayload = {
      venue_name,
      venue_type: venue_info?.venue_category || '',
      address: address || '',
      city: city || '',
      area: area || '',
      google_maps_link: google_maps_link || '',
      lat: lat ?? 0,
      lng: lng ?? 0,
      contact_name: contact_name || '',
      contact_phone: contact_phone || '',
      amenities: Array.isArray(venue_info?.amenities) ? venue_info.amenities : [],
      sitting_size: venue_info?.sitting_size || '',
      notes: notes || '',
      image_file_id: 0,
      submitted_by: 0,
    };

    const proxyResult = await proxyVenueLeadWrite('POST', '/api/venue-lead', proxyPayload);
    if (!proxyResult.ok) {
      return res.status(proxyResult.status).json({ success: false, error: proxyResult.error });
    }

    const createdId = proxyResult.data?.id;
    if (!createdId) {
      return res.status(502).json({ success: false, error: 'Venue lead API did not return a lead ID' });
    }

    const result = await queryProduction(
      `SELECT vl.*, f.s3_url AS image_url
       FROM venue_lead vl
       LEFT JOIN file f ON f.id = vl.image
       WHERE vl.id = $1`,
      [createdId]
    );

    logger.info(`Venue lead created: ${venue_name}`);
    res.json({ success: true, lead: result.rows[0] });
  } catch (error: any) {
    logger.error('Error creating venue lead:', error);
    const writeError = getVenueLeadWriteError('create', error);
    res.status(writeError.status).json({ success: false, error: writeError.message });
  }
});

// PATCH /api/venue-leads/:id - Update a venue lead
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ success: false, error: 'Invalid lead ID' });
  }

  const {
    venue_name, address, city, area, google_maps_link,
    lat, lng, contact_name, contact_phone, notes, venue_info
  } = req.body;

  try {
    const result = await queryProductionWrite(
      `UPDATE venue_lead
       SET venue_name = COALESCE($2, venue_name),
           address = COALESCE($3, address),
           city = COALESCE($4, city),
           area = COALESCE($5, area),
           google_maps_link = COALESCE($6, google_maps_link),
           lat = $7,
           lng = $8,
           contact_name = COALESCE($9, contact_name),
           contact_phone = COALESCE($10, contact_phone),
           notes = $11,
           venue_info = COALESCE($12, venue_info),
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [id, venue_name, address, city, area, google_maps_link,
       lat ?? null, lng ?? null, contact_name, contact_phone,
       notes ?? null, venue_info ? JSON.stringify(venue_info) : null]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Venue lead not found' });
    }

    logger.info(`Venue lead ${id} updated`);
    res.json({ success: true, lead: result.rows[0] });
  } catch (error: any) {
    logger.error(`Error updating venue lead ${id}:`, error);
    const writeError = getVenueLeadWriteError('update', error);
    res.status(writeError.status).json({ success: false, error: writeError.message });
  }
});

// POST /api/venue-leads/:id/image - Upload image for a venue lead
router.post('/:id/image', upload.single('image'), async (req, res) => {
  const { id } = req.params;
  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ success: false, error: 'Invalid lead ID' });
  }
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded' });
  }

  try {
    const fileName = req.file.filename;
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5001';
    const s3Url = `${baseUrl}/uploads/${fileName}`;

    // Insert into file table
    const fileResult = await queryProductionWrite(
      `INSERT INTO file (file_name, content_type, s3_url) VALUES ($1, $2, $3) RETURNING id`,
      [fileName, req.file.mimetype, s3Url]
    );
    const fileId = fileResult.rows[0].id;

    // Update venue_lead image
    await queryProductionWrite(
      `UPDATE venue_lead SET image = $1, updated_at = now() WHERE id = $2`,
      [fileId, id]
    );

    logger.info(`Image uploaded for venue lead ${id}: file ${fileId}`);
    res.json({ success: true, file_id: fileId, image_url: s3Url });
  } catch (error: any) {
    logger.error(`Error uploading image for venue lead ${id}:`, error);
    const writeError = getVenueLeadWriteError('upload image for', error);
    res.status(writeError.status).json({ success: false, error: writeError.message });
  }
});

// POST /api/venue-leads/:id/reject - Reject a venue lead
router.post('/:id/reject', async (req, res) => {
  const { id } = req.params;
  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ success: false, error: 'Invalid lead ID' });
  }
  const { reason } = req.body;

  try {
    const leadResult = await queryProduction(
      `SELECT * FROM venue_lead WHERE id = $1`,
      [id]
    );
    if (leadResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Venue lead not found' });
    }

    const lead = leadResult.rows[0];
    if (lead.status !== 'PENDING') {
      return res.status(400).json({ success: false, error: 'Lead is not in PENDING status' });
    }

    const proxyResult = await proxyVenueLeadWrite('POST', `/api/venue-lead/${id}/reject`, { reason: reason || '' });
    if (!proxyResult.ok) {
      return res.status(proxyResult.status).json({ success: false, error: proxyResult.error });
    }

    logger.info(`Venue lead ${id} rejected`);
    res.json({ success: true, message: proxyResult.data?.message || 'Venue lead rejected' });
  } catch (error: any) {
    logger.error(`Error rejecting venue lead ${id}:`, error);
    const writeError = getVenueLeadWriteError('reject', error);
    res.status(writeError.status).json({ success: false, error: writeError.message });
  }
});

export default router;
