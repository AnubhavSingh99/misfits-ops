import { Router } from 'express';
import { queryProduction } from '../services/database';
import { logger } from '../utils/logger';

const router = Router();

const VALID_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];

// GET /api/venue-leads - List all venue leads from production DB
router.get('/', async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    let result;

    if (status) {
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
      }
      result = await queryProduction(
        `SELECT * FROM venue_lead WHERE status = $1 ORDER BY created_at DESC`,
        [status]
      );
    } else {
      result = await queryProduction(
        `SELECT * FROM venue_lead ORDER BY created_at DESC`
      );
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

    // Resolve area_id from coordinates
    let areaId: number | null = null;

    if (lead.lat && lead.lng) {
      // Find nearest city
      const cityResult = await queryProduction(
        `SELECT id FROM city
         WHERE lat IS NOT NULL AND lng IS NOT NULL
         ORDER BY (lat - $1)*(lat - $1) + (lng - $2)*(lng - $2)
         LIMIT 1`,
        [lead.lat, lead.lng]
      );

      if (cityResult.rows.length > 0) {
        const cityId = cityResult.rows[0].id;
        // Try exact area name match first
        const areaNameResult = await queryProduction(
          `SELECT id FROM area WHERE city_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
          [cityId, lead.area]
        );

        if (areaNameResult.rows.length > 0) {
          areaId = areaNameResult.rows[0].id;
        } else {
          // Fallback to nearest area by coordinates
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

    if (!areaId) {
      // Try text-based matching as fallback
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

    // Create location
    const locationResult = await queryProduction(
      `INSERT INTO location (name, url, image, area_id, lat, lng, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [lead.venue_name, lead.google_maps_link, imageFileId, areaId, lead.lat, lead.lng, lead.submitted_by]
    );

    const locationId = locationResult.rows[0].id;

    // Update venue lead status
    await queryProduction(
      `UPDATE venue_lead SET status = 'APPROVED', location_id = $2, updated_at = now() WHERE id = $1 AND status = 'PENDING'`,
      [id, locationId]
    );

    logger.info(`Venue lead ${id} approved, location ${locationId} created`);
    res.json({ success: true, location_id: locationId, message: 'Venue lead approved and location created' });
  } catch (error: any) {
    logger.error(`Error approving venue lead ${id}:`, error);
    res.status(500).json({ success: false, error: 'Failed to approve venue lead' });
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
