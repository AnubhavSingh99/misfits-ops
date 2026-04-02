import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { queryProduction } from '../services/database';
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

    // Resolve area_id — use text-based matching (city/area tables may not have lat/lng)
    let areaId: number | null = null;

    if (lead.lat && lead.lng) {
      // Check if city table has lat/lng columns before attempting coordinate lookup
      const hasLatLng = await queryProduction(
        `SELECT 1 FROM information_schema.columns
         WHERE table_name = 'city' AND column_name = 'lat' LIMIT 1`
      );

      if (hasLatLng.rows.length > 0) {
        // Find nearest city by coordinates
        const cityResult = await queryProduction(
          `SELECT id FROM city
           WHERE lat IS NOT NULL AND lng IS NOT NULL
           ORDER BY (lat - $1)*(lat - $1) + (lng - $2)*(lng - $2)
           LIMIT 1`,
          [lead.lat, lead.lng]
        );

        if (cityResult.rows.length > 0) {
          const cityId = cityResult.rows[0].id;
          const areaNameResult = await queryProduction(
            `SELECT id FROM area WHERE city_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
            [cityId, lead.area]
          );

          if (areaNameResult.rows.length > 0) {
            areaId = areaNameResult.rows[0].id;
          } else {
            const areaResult = await queryProduction(
              `SELECT id FROM area
               WHERE city_id = $1 AND lat IS NOT NULL AND lng IS NOT NULL
               ORDER BY (lat - $2)*(lat - $2) + (lng - $3)*(lng - $3)
               LIMIT 1`,
              [cityId, lead.lat, lead.lng]
            );
            if (areaResult.rows.length > 0) {
              areaId = areaResult.rows[0].id;
            }
          }
        }
      }
    }

    if (!areaId) {
      // Text-based matching (primary path when city table has no lat/lng)
      const textResult = await queryProduction(
        `SELECT a.id FROM area a
         JOIN city c ON a.city_id = c.id
         WHERE LOWER(c.name) = LOWER($1) AND LOWER(a.name) = LOWER($2)
         LIMIT 1`,
        [lead.city, lead.area]
      );
      if (textResult.rows.length > 0) {
        areaId = textResult.rows[0].id;
      }
    }

    if (!areaId) {
      return res.status(400).json({
        success: false,
        error: `Could not resolve area for city "${lead.city}", area "${lead.area}". Please check the lead data.`
      });
    }

    // Use lead image or default placeholder (file_id 350)
    const imageFileId = lead.image || 350;

    // Build venue_info with source tag
    const venueInfo = { ...(lead.venue_info ?? {}), source: 'venue_lead', venue_lead_id: parseInt(id) };

    // Create location
    const locationResult = await queryProduction(
      `INSERT INTO location (name, url, image, area_id, lat, lng, created_by, venue_info)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [lead.venue_name, lead.google_maps_link, imageFileId, areaId, lead.lat, lead.lng, lead.submitted_by, venueInfo]
    );

    const locationId = locationResult.rows[0].id;

    // Update venue lead status
    await queryProduction(
      `UPDATE venue_lead SET status = 'APPROVED', location_id = $2, updated_at = now() WHERE id = $1 AND status = 'PENDING'`,
      [id, locationId]
    );

    // Sync new location into venue_repository immediately (fire-and-forget)
    runVmsSync().catch(err => logger.warn('Post-approval VMS sync failed:', err));

    logger.info(`Venue lead ${id} approved, location ${locationId} created`);
    res.json({ success: true, location_id: locationId, message: 'Venue lead approved and location created' });
  } catch (error: any) {
    logger.error(`Error approving venue lead ${id}:`, error);
    res.status(500).json({ success: false, error: 'Failed to approve venue lead' });
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
    const result = await queryProduction(
      `INSERT INTO venue_lead (venue_name, address, city, area, google_maps_link, lat, lng, contact_name, contact_phone, notes, venue_info, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'PENDING')
       RETURNING *`,
      [venue_name, address || null, city || null, area || null, google_maps_link || null,
       lat ?? null, lng ?? null, contact_name || null, contact_phone || null,
       notes ?? null, venue_info ? JSON.stringify(venue_info) : null]
    );

    logger.info(`Venue lead created: ${venue_name}`);
    res.json({ success: true, lead: result.rows[0] });
  } catch (error: any) {
    logger.error('Error creating venue lead:', error);
    res.status(500).json({ success: false, error: 'Failed to create venue lead' });
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
    const result = await queryProduction(
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
    res.status(500).json({ success: false, error: 'Failed to update venue lead' });
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
    const fileResult = await queryProduction(
      `INSERT INTO file (file_name, content_type, s3_url) VALUES ($1, $2, $3) RETURNING id`,
      [fileName, req.file.mimetype, s3Url]
    );
    const fileId = fileResult.rows[0].id;

    // Update venue_lead image
    await queryProduction(
      `UPDATE venue_lead SET image = $1, updated_at = now() WHERE id = $2`,
      [fileId, id]
    );

    logger.info(`Image uploaded for venue lead ${id}: file ${fileId}`);
    res.json({ success: true, file_id: fileId, image_url: s3Url });
  } catch (error: any) {
    logger.error(`Error uploading image for venue lead ${id}:`, error);
    res.status(500).json({ success: false, error: 'Failed to upload image' });
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

    await queryProduction(
      `UPDATE venue_lead SET status = 'REJECTED', rejection_reason = $2, updated_at = now() WHERE id = $1 AND status = 'PENDING'`,
      [id, reason || null]
    );

    logger.info(`Venue lead ${id} rejected`);
    res.json({ success: true, message: 'Venue lead rejected' });
  } catch (error: any) {
    logger.error(`Error rejecting venue lead ${id}:`, error);
    res.status(500).json({ success: false, error: 'Failed to reject venue lead' });
  }
});

export default router;
