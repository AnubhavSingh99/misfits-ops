import { Router, Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger';
import { queryLocal, queryProduction } from '../services/database';

const execAsync = promisify(exec);

const router = Router();

// URL validation helper - must be Google Maps, not share.google
function validateMapsUrl(url: string): { valid: boolean; error?: string } {
  if (!url) return { valid: true }; // URL is optional
  const validPatterns = [
    'maps.google.com',
    'maps.app.goo.gl',
    'www.google.com/maps',
    'google.com/maps',
    'goo.gl/maps'
  ];
  const isValid = validPatterns.some(pattern => url.includes(pattern));
  if (!isValid) {
    if (url.includes('share.google')) {
      return { valid: false, error: 'Please use a Google Maps URL, not a share.google link. Open the link in Maps first and copy the URL from the address bar.' };
    }
    return { valid: false, error: 'URL must be a Google Maps link (maps.google.com or maps.app.goo.gl)' };
  }
  return { valid: true };
}

// Check URL duplicate across ops DB and production location table
async function checkUrlDuplicate(url: string, excludeId?: number): Promise<{ duplicate: boolean; source?: string; existingName?: string }> {
  if (!url) return { duplicate: false };

  // Check ops DB
  const opsQuery = excludeId
    ? 'SELECT id, name FROM venue_repository WHERE url = $1 AND id != $2 LIMIT 1'
    : 'SELECT id, name FROM venue_repository WHERE url = $1 LIMIT 1';
  const opsParams = excludeId ? [url, excludeId] : [url];
  const opsResult = await queryLocal(opsQuery, opsParams);
  if (opsResult.rows.length > 0) {
    return { duplicate: true, source: 'Venue Repository', existingName: opsResult.rows[0].name };
  }

  // Check production location table
  const prodResult = await queryProduction(
    'SELECT id, name FROM location WHERE url = $1 AND is_deleted = false LIMIT 1',
    [url]
  );
  if (prodResult.rows.length > 0) {
    return { duplicate: true, source: 'VMS (Production)', existingName: prodResult.rows[0].name };
  }

  return { duplicate: false };
}

// Status flow options
const VALID_STATUSES = ['new', 'contacted', 'interested', 'negotiating', 'rejected', 'onboarded', 'inactive'];

// Dropdown values from VMS
const VENUE_CATEGORIES = ['CAFE', 'PUB_AND_BAR', 'STUDIO'];
const SEATING_CATEGORIES = ['INDOOR', 'OUTDOOR', 'BOTH'];
const CAPACITY_CATEGORIES = ['LESS_THAN_25', 'CAPACITY_25_TO_50', 'CAPACITY_50_PLUS'];
const AMENITIES = [
  'Alcohol Served',
  'Big Tables',
  'Clean Washrooms',
  'Comfortable Seating',
  'Disable Friendly',
  'First-aid facilities',
  'Free Drinking Water',
  'Free Wifi',
  'Good Lighting',
  'Indoor seating',
  'Music System',
  'Outdoor seating',
  'Smoking Area'
];

// ============================================
// DROPDOWN OPTIONS
// ============================================

/**
 * GET /api/venue-repository/options
 * Get dropdown options for forms
 */
router.get('/options', async (req: Request, res: Response) => {
  try {
    // Get all cities and areas from production
    const areasQuery = `
      SELECT
        a.id as area_id,
        a.name as area_name,
        c.id as city_id,
        c.name as city_name
      FROM area a
      JOIN city c ON a.city_id = c.id
      ORDER BY c.name, a.name
    `;
    const areasResult = await queryProduction(areasQuery);

    // Group areas by city
    const citiesMap = new Map<string, { id: number; name: string; areas: { id: number; name: string }[] }>();
    for (const row of areasResult.rows) {
      if (!citiesMap.has(row.city_name)) {
        citiesMap.set(row.city_name, {
          id: row.city_id,
          name: row.city_name,
          areas: []
        });
      }
      citiesMap.get(row.city_name)!.areas.push({
        id: row.area_id,
        name: row.area_name
      });
    }

    res.json({
      success: true,
      options: {
        statuses: VALID_STATUSES,
        venueCategories: VENUE_CATEGORIES,
        seatingCategories: SEATING_CATEGORIES,
        capacityCategories: CAPACITY_CATEGORIES,
        amenities: AMENITIES,
        cities: Array.from(citiesMap.values())
      }
    });
  } catch (error) {
    logger.error('Error fetching venue repository options:', error);
    res.status(500).json({ error: 'Failed to fetch options' });
  }
});

// ============================================
// FILTER OPTIONS
// ============================================

/**
 * GET /api/venue-repository/filter-options
 * Get distinct filter values from venue_repository data
 */
router.get('/filter-options', async (req: Request, res: Response) => {
  try {
    // 1. Get ALL cities and areas from production app
    const prodResult = await queryProduction(`
      SELECT a.id as area_id, a.name as area_name, c.id as city_id, c.name as city_name
      FROM area a
      JOIN city c ON a.city_id = c.id
      ORDER BY c.name, a.name
    `);

    const cityMap = new Map<number, string>();
    const prodAreas: { id: number; name: string; city_id: number }[] = [];
    for (const row of prodResult.rows) {
      const cityId = parseInt(row.city_id);
      const areaId = parseInt(row.area_id);
      cityMap.set(cityId, row.city_name);
      prodAreas.push({ id: areaId, name: row.area_name, city_id: cityId });
    }
    const prodCities = Array.from(cityMap.entries()).map(([id, name]) => ({ id, name }));

    // 2. Get custom cities and areas from venue_repository (ones not in production)
    const customCitiesResult = await queryLocal(`
      SELECT DISTINCT custom_city FROM venue_repository
      WHERE custom_city IS NOT NULL AND custom_city != '' AND area_id IS NULL
      ORDER BY custom_city
    `);
    const customAreasResult = await queryLocal(`
      SELECT DISTINCT custom_area, custom_city FROM venue_repository
      WHERE custom_area IS NOT NULL AND custom_area != '' AND area_id IS NULL
      ORDER BY custom_area
    `);

    // Assign negative IDs to custom values
    let customCityId = -1;
    const customCityMap = new Map<string, number>();
    const customCities = customCitiesResult.rows.map(r => {
      const id = customCityId--;
      customCityMap.set((r.custom_city || '').toLowerCase(), id);
      return { id, name: r.custom_city };
    });

    let customAreaId = -1;
    const customAreas = customAreasResult.rows.map(r => {
      const cityId = customCityMap.get((r.custom_city || '').toLowerCase()) || 0;
      return { id: customAreaId--, name: r.custom_area, city_id: cityId };
    });

    // 3. Get ALL activities from production app
    const activitiesResult = await queryProduction(`
      SELECT id, name FROM activity WHERE is_active = true ORDER BY name
    `);
    const activities = activitiesResult.rows.map(r => ({
      id: parseInt(r.id),
      name: r.name
    }));

    // 4. Capacity categories (fixed set)
    const capacities = [
      { id: 1, name: 'LESS_THAN_25', label: '<25' },
      { id: 2, name: 'CAPACITY_25_TO_50', label: '25-50' },
      { id: 3, name: 'CAPACITY_50_PLUS', label: '50+' }
    ];

    res.json({
      success: true,
      options: {
        cities: [...prodCities, ...customCities].sort((a, b) => a.name.localeCompare(b.name)),
        areas: [...prodAreas, ...customAreas].sort((a, b) => a.name.localeCompare(b.name)),
        activities,
        capacities
      }
    });
  } catch (error) {
    logger.error('Error fetching venue repository filter options:', error);
    res.status(500).json({ error: 'Failed to fetch filter options' });
  }
});

// ============================================
// VENUE REPOSITORY CRUD
// ============================================

/**
 * Build filter clauses for venue queries
 * Returns { clauses, params, nextIndex } to be appended to WHERE 1=1
 */
async function buildFilterClauses(query: Record<string, any>, startIndex: number) {
  const clauses: string[] = [];
  const params: any[] = [];
  let idx = startIndex;

  const { status, statuses, area_id, search, city_names, area_names, activities, capacity_categories, not_transferred } = query;

  if (statuses) {
    const statusList = (statuses as string).split(',').filter(s => VALID_STATUSES.includes(s));
    if (statusList.length > 0) {
      clauses.push(`vr.status = ANY($${idx++})`);
      params.push(statusList);
    }
  } else if (status) {
    clauses.push(`vr.status = $${idx++}`);
    params.push(status);
  }

  if (area_id) {
    clauses.push(`vr.area_id = $${idx++}`);
    params.push(area_id);
  }

  if (search) {
    clauses.push(`(vr.name ILIKE $${idx} OR vr.contact_name ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }

  if (city_names) {
    const names = (city_names as string).split(',');
    // Get area IDs from production for matching cities
    const cityAreasResult = await queryProduction(
      `SELECT a.id FROM area a JOIN city c ON a.city_id = c.id WHERE c.name = ANY($1)`,
      [names]
    );
    const matchingAreaIds = cityAreasResult.rows.map(r => r.id);

    const conditions: string[] = [];
    if (matchingAreaIds.length > 0) {
      conditions.push(`vr.area_id = ANY($${idx++})`);
      params.push(matchingAreaIds);
    }
    conditions.push(`vr.custom_city = ANY($${idx++})`);
    params.push(names);

    clauses.push(`(${conditions.join(' OR ')})`);
  }

  if (area_names) {
    const names = (area_names as string).split(',');
    const areaResult = await queryProduction(
      `SELECT id FROM area WHERE name = ANY($1)`, [names]
    );
    const matchingAreaIds = areaResult.rows.map(r => r.id);

    const conditions: string[] = [];
    if (matchingAreaIds.length > 0) {
      conditions.push(`vr.area_id = ANY($${idx++})`);
      params.push(matchingAreaIds);
    }
    conditions.push(`vr.custom_area = ANY($${idx++})`);
    params.push(names);

    clauses.push(`(${conditions.join(' OR ')})`);
  }

  if (activities) {
    const actList = (activities as string).split(',');
    clauses.push(`EXISTS (
      SELECT 1 FROM jsonb_array_elements(vr.venue_info->'preferred_schedules') AS ps
      WHERE ps->>'preferred_activity' = ANY($${idx++})
    )`);
    params.push(actList);
  }

  if (capacity_categories) {
    const capList = (capacity_categories as string).split(',');
    clauses.push(`vr.venue_info->>'capacity_category' = ANY($${idx++})`);
    params.push(capList);
  }

  if (not_transferred === 'true') {
    clauses.push(`(vr.transferred_to_vms IS NULL OR vr.transferred_to_vms = false)`);
    clauses.push(`vr.status = 'onboarded'`);
  }

  return { clauses, params, nextIndex: idx };
}

/**
 * GET /api/venue-repository
 * Get all venues with optional filters
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    // Build filter clauses (shared between main and count queries)
    const { clauses, params, nextIndex } = await buildFilterClauses(req.query, 1);

    let query = `SELECT vr.* FROM venue_repository vr WHERE 1=1`;
    if (clauses.length > 0) {
      query += ' AND ' + clauses.join(' AND ');
    }
    query += ` ORDER BY vr.created_at DESC LIMIT $${nextIndex} OFFSET $${nextIndex + 1}`;
    params.push(limit, offset);

    const result = await queryLocal(query, params);

    // Get area/city info from production for the venues
    const venueAreaIds = [...new Set(result.rows.filter(r => r.area_id).map(r => r.area_id))];
    let areaMap = new Map<number, { area_name: string; city_name: string }>();

    if (venueAreaIds.length > 0) {
      const areaQuery = `
        SELECT a.id, a.name as area_name, c.name as city_name
        FROM area a
        JOIN city c ON a.city_id = c.id
        WHERE a.id = ANY($1)
      `;
      const areaResult = await queryProduction(areaQuery, [venueAreaIds]);
      for (const row of areaResult.rows) {
        areaMap.set(row.id, { area_name: row.area_name, city_name: row.city_name });
      }
    }

    // Enrich venues with area/city names (use custom values if no area_id)
    const venues = result.rows.map(venue => ({
      ...venue,
      area_name: venue.area_id ? areaMap.get(venue.area_id)?.area_name : venue.custom_area || null,
      city_name: venue.area_id ? areaMap.get(venue.area_id)?.city_name : venue.custom_city || null
    }));

    // Get total count with same filters
    const countFilter = await buildFilterClauses(req.query, 1);
    let countQuery = `SELECT COUNT(*) FROM venue_repository vr WHERE 1=1`;
    if (countFilter.clauses.length > 0) {
      countQuery += ' AND ' + countFilter.clauses.join(' AND ');
    }
    const countResult = await queryLocal(countQuery, countFilter.params);

    res.json({
      success: true,
      venues,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    });
  } catch (error) {
    logger.error('Error fetching venue repository:', error);
    res.status(500).json({ error: 'Failed to fetch venues' });
  }
});

/**
 * GET /api/venue-repository/vms-sync
 * Reverse sync: import venues from VMS that aren't in ops DB
 * NOTE: Must be defined before /:id to avoid being caught by the param route
 */
router.get('/vms-sync', async (req: Request, res: Response) => {
  try {
    const result = await runVmsSync();
    res.json({
      success: true,
      ...result,
      message: `Synced ${result.synced_count} venues from VMS`
    });
  } catch (error) {
    logger.error('Error syncing from VMS:', error);
    res.status(500).json({ error: 'Failed to sync from VMS' });
  }
});

/**
 * GET /api/venue-repository/:id
 * Get single venue by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await queryLocal(
      'SELECT * FROM venue_repository WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Venue not found' });
    }

    const venue = result.rows[0];

    // Get area/city info
    if (venue.area_id) {
      const areaResult = await queryProduction(
        `SELECT a.name as area_name, c.name as city_name
         FROM area a JOIN city c ON a.city_id = c.id
         WHERE a.id = $1`,
        [venue.area_id]
      );
      if (areaResult.rows.length > 0) {
        venue.area_name = areaResult.rows[0].area_name;
        venue.city_name = areaResult.rows[0].city_name;
      }
    }

    res.json({ success: true, venue });
  } catch (error) {
    logger.error('Error fetching venue:', error);
    res.status(500).json({ error: 'Failed to fetch venue' });
  }
});

/**
 * POST /api/venue-repository
 * Create a new venue
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      name,
      url,
      area_id,
      custom_city,
      custom_area,
      venue_info,
      status = 'new',
      contact_name,
      contact_phone,
      contacted_by,
      notes
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    // Validate URL format (must be Google Maps, not share.google)
    if (url) {
      const urlValidation = validateMapsUrl(url);
      if (!urlValidation.valid) {
        return res.status(400).json({ error: urlValidation.error });
      }

      // Check for duplicate URL
      const dupCheck = await checkUrlDuplicate(url);
      if (dupCheck.duplicate) {
        return res.status(400).json({
          error: `This URL already exists in ${dupCheck.source} (venue: "${dupCheck.existingName}"). Each venue must have a unique Google Maps URL.`
        });
      }
    }

    const query = `
      INSERT INTO venue_repository (
        name, url, area_id, custom_city, custom_area, venue_info, status,
        contact_name, contact_phone, contacted_by, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const result = await queryLocal(query, [
      name,
      url || null,
      area_id || null,
      custom_city || null,
      custom_area || null,
      JSON.stringify(venue_info || {}),
      status,
      contact_name || null,
      contact_phone || null,
      contacted_by || null,
      notes || null
    ]);

    logger.info(`Created venue in repository: ${name}${custom_city ? ` (custom city: ${custom_city})` : ''}`);
    res.status(201).json({ success: true, venue: result.rows[0] });
  } catch (error) {
    logger.error('Error creating venue:', error);
    res.status(500).json({ error: 'Failed to create venue' });
  }
});

/**
 * PATCH /api/venue-repository/:id
 * Update a venue
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Check venue exists
    const existingResult = await queryLocal(
      'SELECT * FROM venue_repository WHERE id = $1',
      [id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Venue not found' });
    }

    // Validate status if provided
    if (updates.status && !VALID_STATUSES.includes(updates.status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    // Validate URL format if being updated and actually changed
    if (updates.url && updates.url !== existingResult.rows[0].url) {
      const urlValidation = validateMapsUrl(updates.url);
      if (!urlValidation.valid) {
        return res.status(400).json({ error: urlValidation.error });
      }

      // Check for duplicate URL (exclude current venue)
      const dupCheck = await checkUrlDuplicate(updates.url, parseInt(id));
      if (dupCheck.duplicate) {
        return res.status(400).json({
          error: `This URL already exists in ${dupCheck.source} (venue: "${dupCheck.existingName}"). Each venue must have a unique Google Maps URL.`
        });
      }
    }

    // Build update query dynamically
    const allowedFields = [
      'name', 'url', 'area_id', 'custom_city', 'custom_area', 'venue_info', 'status',
      'contact_name', 'contact_phone', 'contacted_by', 'closed_by',
      'rejection_reason', 'notes', 'vms_location_id',
      'transferred_to_vms', 'transferred_at', 'venue_manager_phone'
    ];

    const setClauses: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        setClauses.push(`${field} = $${paramIndex++}`);
        if (field === 'venue_info') {
          params.push(JSON.stringify(updates[field]));
        } else {
          params.push(updates[field]);
        }
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    params.push(id);
    const query = `
      UPDATE venue_repository
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await queryLocal(query, params);
    logger.info(`Updated venue in repository: ${id}`);

    res.json({ success: true, venue: result.rows[0] });
  } catch (error) {
    logger.error('Error updating venue:', error);
    res.status(500).json({ error: 'Failed to update venue' });
  }
});

/**
 * DELETE /api/venue-repository/:id
 * Delete a venue
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if venue is onboarded — block deletion
    const check = await queryLocal(
      'SELECT status, transferred_to_vms FROM venue_repository WHERE id = $1',
      [id]
    );
    if (check.rows.length > 0 && (check.rows[0].status === 'onboarded' || check.rows[0].transferred_to_vms)) {
      return res.status(400).json({ error: 'Cannot delete an onboarded venue. It will reappear on next VMS sync.' });
    }

    const result = await queryLocal(
      'DELETE FROM venue_repository WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Venue not found' });
    }

    logger.info(`Deleted venue from repository: ${id}`);
    res.json({ success: true, message: 'Venue deleted' });
  } catch (error) {
    logger.error('Error deleting venue:', error);
    res.status(500).json({ error: 'Failed to delete venue' });
  }
});

/**
 * PATCH /api/venue-repository/:id/status
 * Update venue status (with workflow validation)
 */
router.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, closed_by, rejection_reason, contacted_by } = req.body;

    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    // If rejected, require rejection_reason
    if (status === 'rejected' && !rejection_reason) {
      return res.status(400).json({ error: 'rejection_reason is required when marking as rejected' });
    }

    const updates: any = { status };
    if (closed_by) updates.closed_by = closed_by;
    if (rejection_reason) updates.rejection_reason = rejection_reason;
    if (contacted_by) updates.contacted_by = contacted_by;

    const setClauses = Object.keys(updates).map((key, idx) => `${key} = $${idx + 1}`);
    const params = [...Object.values(updates), id];

    const query = `
      UPDATE venue_repository
      SET ${setClauses.join(', ')}
      WHERE id = $${params.length}
      RETURNING *
    `;

    const result = await queryLocal(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Venue not found' });
    }

    logger.info(`Updated venue status: ${id} -> ${status}`);
    res.json({ success: true, venue: result.rows[0] });
  } catch (error) {
    logger.error('Error updating venue status:', error);
    res.status(500).json({ error: 'Failed to update venue status' });
  }
});

// ============================================
// SUGGESTION MATCHING HELPERS
// ============================================

/**
 * Convert a day_type name (from dim_day_types) to VMS-compatible day names
 * e.g. "weekday" -> ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY']
 */
function dayTypeToVmsDays(dayType: string): string[] {
  if (!dayType) return [];
  const lower = dayType.toLowerCase();
  switch (lower) {
    case 'weekday':
      return ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
    case 'weekend':
      return ['SATURDAY', 'SUNDAY'];
    case 'monday': return ['MONDAY'];
    case 'tuesday': return ['TUESDAY'];
    case 'wednesday': return ['WEDNESDAY'];
    case 'thursday': return ['THURSDAY'];
    case 'friday': return ['FRIDAY'];
    case 'saturday': return ['SATURDAY'];
    case 'sunday': return ['SUNDAY'];
    default: return [];
  }
}

/**
 * Convert time_of_day array (e.g. ['evening','night']) to hour range
 * Returns { minHour, maxHour } for overlap checking with preferred_schedules
 */
function timeOfDayToHourRange(slots: string[]): { minHour: number; maxHour: number } | null {
  if (!slots || slots.length === 0) return null;
  const slotRanges: Record<string, { start: number; end: number }> = {
    early_morning: { start: 5, end: 8 },
    morning:       { start: 8, end: 12 },
    afternoon:     { start: 12, end: 16 },
    evening:       { start: 16, end: 20 },
    night:         { start: 20, end: 24 },
    all_nighter:   { start: 0, end: 5 }
  };
  let minHour = 24;
  let maxHour = 0;
  for (const slot of slots) {
    const range = slotRanges[slot.toLowerCase()];
    if (range) {
      minHour = Math.min(minHour, range.start);
      maxHour = Math.max(maxHour, range.end);
    }
  }
  return minHour < maxHour ? { minHour, maxHour } : null;
}

// ============================================
// VENUE SUGGESTIONS FOR REQUIREMENTS
// ============================================

/**
 * GET /api/venue-repository/suggestions/:requirementId
 * Get venue suggestions for a requirement based on city, area, capacity, activity
 */
router.get('/suggestions/:requirementId', async (req: Request, res: Response) => {
  try {
    const { requirementId } = req.params;

    // Get requirement details with day_type joined
    const reqResult = await queryLocal(
      `SELECT vr.*, dt.day_type as day_type_name
       FROM venue_requirements vr
       LEFT JOIN dim_day_types dt ON vr.day_type_id = dt.id
       WHERE vr.id = $1`,
      [requirementId]
    );

    if (reqResult.rows.length === 0) {
      return res.status(404).json({ error: 'Requirement not found' });
    }

    const requirement = reqResult.rows[0];
    const city = requirement.city_name || requirement.city;
    const area = requirement.area_name || requirement.area;
    const activity = requirement.activity_name || requirement.activity;
    const capacity = requirement.capacity;
    const dayTypeName = requirement.day_type_name;
    const timeOfDay: string[] = requirement.time_of_day || [];

    // Convert requirement day/time to VMS-compatible formats for scoring
    const vmsDays = dayTypeToVmsDays(dayTypeName);
    const hourRange = timeOfDayToHourRange(timeOfDay);

    // Build expanded day match values (include WEEKDAY/WEEKEND group labels for matching venue schedules)
    const dayMatchValues = [...vmsDays];
    if (vmsDays.some(d => ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'].includes(d))) {
      dayMatchValues.push('WEEKDAY');
    }
    if (vmsDays.some(d => ['SATURDAY', 'SUNDAY'].includes(d))) {
      dayMatchValues.push('WEEKEND');
    }

    // Sports activities - these need sports venues
    const SPORTS_ACTIVITIES = ['Badminton', 'Basketball', 'Box Cricket', 'Football', 'Pickleball', 'Table Tennis', 'Volleyball', 'Cycling', 'Running', 'Cricket'];
    const isSportsActivity = activity && SPORTS_ACTIVITIES.some(s => activity.toLowerCase().includes(s.toLowerCase()));

    // Get city_id from production (REQUIRED for suggestions)
    let cityId: number | null = null;
    let areaId: number | null = null;

    if (city) {
      const cityQuery = `SELECT id FROM city WHERE name ILIKE $1`;
      const cityResult = await queryProduction(cityQuery, [city]);
      if (cityResult.rows.length > 0) {
        cityId = cityResult.rows[0].id;
      }
    }

    // If we can't match the city, don't show any suggestions
    if (!cityId) {
      return res.json({
        success: true,
        requirement: { id: requirement.id, city, area, activity, capacity },
        suggestions: [],
        message: 'City not found in database'
      });
    }

    // Get area_id if area is specified
    if (area && cityId) {
      const areaQuery = `
        SELECT a.id FROM area a
        WHERE a.name ILIKE $1 AND a.city_id = $2
      `;
      const areaResult = await queryProduction(areaQuery, [area, cityId]);
      if (areaResult.rows.length > 0) {
        areaId = areaResult.rows[0].id;
      }
    }

    // Map capacity bucket (e.g. '30-50', '<10', '>500') to VMS capacity category
    let capacityCategory: string | null = null;
    if (capacity) {
      const bucketToVms: Record<string, string> = {
        '<10': 'LESS_THAN_25',
        '10-20': 'LESS_THAN_25',
        '20-30': 'CAPACITY_25_TO_50',
        '30-50': 'CAPACITY_25_TO_50',
        '50-100': 'CAPACITY_50_PLUS',
        '100-200': 'CAPACITY_50_PLUS',
        '200-500': 'CAPACITY_50_PLUS',
        '>500': 'CAPACITY_50_PLUS'
      };
      capacityCategory = bucketToVms[capacity] || null;
    }

    const suggestions: any[] = [];

    // 1. Search in venue_repository (local) - MUST match city
    let repoQuery = `
      SELECT vr.*, 'repository' as source
      FROM venue_repository vr
      WHERE vr.status NOT IN ('rejected', 'onboarded')
    `;
    const repoParams: any[] = [];
    let paramIdx = 1;

    // Get all area IDs in this city to filter repository venues
    const cityAreasQuery = `SELECT id FROM area WHERE city_id = $1`;
    const cityAreasResult = await queryProduction(cityAreasQuery, [cityId]);
    const cityAreaIds = cityAreasResult.rows.map(r => r.id);

    if (cityAreaIds.length > 0) {
      if (areaId) {
        // If specific area, filter by area
        repoQuery += ` AND vr.area_id = $${paramIdx++}`;
        repoParams.push(areaId);
      } else {
        // Otherwise, filter by any area in the city
        repoQuery += ` AND vr.area_id = ANY($${paramIdx++})`;
        repoParams.push(cityAreaIds);
      }
    }

    if (capacityCategory) {
      repoQuery += ` AND vr.venue_info->>'capacity_category' = $${paramIdx++}`;
      repoParams.push(capacityCategory);
    }

    // Score and sort: activity match > day match > no match
    // Activity field may be comma-separated (multi-select), so use string_to_array for exact matching
    const repoScoreClauses: string[] = [];
    if (activity) {
      repoScoreClauses.push(`CASE WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(vr.venue_info->'preferred_schedules') AS ps
        WHERE $${paramIdx} = ANY(string_to_array(ps->>'preferred_activity', ', '))
      ) THEN 0 ELSE 2 END`);
      repoParams.push(activity);
      paramIdx++;
    }
    if (dayMatchValues.length > 0) {
      repoScoreClauses.push(`CASE WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(vr.venue_info->'preferred_schedules') AS ps
        WHERE ps->>'day' = ANY($${paramIdx})
      ) THEN 0 ELSE 1 END`);
      repoParams.push(dayMatchValues);
      paramIdx++;
    }

    if (repoScoreClauses.length > 0) {
      repoQuery += ` ORDER BY (${repoScoreClauses.join(' + ')}), vr.name`;
    } else {
      repoQuery += ` ORDER BY vr.name`;
    }
    repoQuery += ` LIMIT 10`;
    const repoResult = await queryLocal(repoQuery, repoParams);
    suggestions.push(...repoResult.rows);

    // 2. Search in VMS (production location table with venue_info) - MUST match city
    let vmsQuery = `
      SELECT
        l.id as vms_id,
        l.name,
        l.url,
        l.area_id,
        l.venue_info,
        a.name as area_name,
        c.name as city_name,
        'vms' as source
      FROM location l
      JOIN area a ON l.area_id = a.id
      JOIN city c ON a.city_id = c.id
      WHERE l.is_deleted = false
        AND l.venue_info IS NOT NULL
        AND l.venue_info != '{}'::jsonb
        AND c.id = $1
    `;
    const vmsParams: any[] = [cityId];
    let vmsParamIdx = 2;

    // Filter by specific area if provided
    if (areaId) {
      vmsQuery += ` AND l.area_id = $${vmsParamIdx++}`;
      vmsParams.push(areaId);
    }

    if (capacityCategory) {
      vmsQuery += ` AND l.venue_info->>'capacity_category' = $${vmsParamIdx++}`;
      vmsParams.push(capacityCategory);
    }

    // Filter by activity - only show venues that support this activity
    // For non-sports activities, exclude sports venues (check venue name for sports keywords)
    if (!isSportsActivity) {
      // Exclude venues with sports-related names
      vmsQuery += ` AND l.name !~* '(sport|badminton|cricket|football|basketball|tennis|volleyball|gym|fitness)'`;
    }

    // Multi-factor scoring: activity match (weight 3) + day match (weight 1)
    // Venues without schedules still show, just ranked lower
    // Activity field may be comma-separated (multi-select), so use string_to_array for exact matching
    const vmsScoreClauses: string[] = [];
    if (activity) {
      vmsScoreClauses.push(`CASE WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(l.venue_info->'preferred_schedules') = 'array'
               THEN l.venue_info->'preferred_schedules' ELSE '[]'::jsonb END
        ) AS ps WHERE $${vmsParamIdx} = ANY(string_to_array(ps->>'preferred_activity', ', '))
      ) THEN 0 ELSE 3 END`);
      vmsParams.push(activity);
      vmsParamIdx++;
    }
    if (dayMatchValues.length > 0) {
      vmsScoreClauses.push(`CASE WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(l.venue_info->'preferred_schedules') = 'array'
               THEN l.venue_info->'preferred_schedules' ELSE '[]'::jsonb END
        ) AS ps WHERE ps->>'day' = ANY($${vmsParamIdx})
      ) THEN 0 ELSE 1 END`);
      vmsParams.push(dayMatchValues);
      vmsParamIdx++;
    }

    if (vmsScoreClauses.length > 0) {
      vmsQuery += ` ORDER BY (${vmsScoreClauses.join(' + ')}), l.name`;
    } else {
      vmsQuery += ` ORDER BY l.name`;
    }
    vmsQuery += ` LIMIT 10`;

    const vmsResult = await queryProduction(vmsQuery, vmsParams);
    suggestions.push(...vmsResult.rows);

    // Enrich repository venues with area/city names
    const areaIds = [...new Set(suggestions.filter(s => s.area_id && s.source === 'repository').map(s => s.area_id))];
    if (areaIds.length > 0) {
      const areaInfoQuery = `
        SELECT a.id, a.name as area_name, c.name as city_name
        FROM area a JOIN city c ON a.city_id = c.id
        WHERE a.id = ANY($1)
      `;
      const areaInfo = await queryProduction(areaInfoQuery, [areaIds]);
      const areaMap = new Map(areaInfo.rows.map(r => [r.id, { area_name: r.area_name, city_name: r.city_name }]));

      for (const s of suggestions) {
        if (s.source === 'repository' && s.area_id) {
          const info = areaMap.get(s.area_id);
          if (info) {
            s.area_name = info.area_name;
            s.city_name = info.city_name;
          }
        }
      }
    }

    // Deduplicate: if a venue appears in both repository and VMS, keep the VMS one
    // Match by vms_location_id <-> vms_id, or by URL
    const vmsIds = new Set(suggestions.filter(s => s.source === 'vms').map(s => parseInt(s.vms_id)));
    const vmsUrls = new Set(suggestions.filter(s => s.source === 'vms' && s.url).map(s => s.url));

    const deduped = suggestions.filter(s => {
      if (s.source !== 'repository') return true;
      // Remove repo venue if its vms_location_id matches a VMS suggestion
      if (s.vms_location_id && vmsIds.has(parseInt(s.vms_location_id))) return false;
      // Remove repo venue if its URL matches a VMS suggestion
      if (s.url && vmsUrls.has(s.url)) return false;
      return true;
    });

    res.json({
      success: true,
      requirement: { id: requirement.id, city, area, activity, capacity, day_type: dayTypeName, time_of_day: timeOfDay },
      suggestions: deduped
    });
  } catch (error) {
    logger.error('Error fetching venue suggestions:', error);
    res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

/**
 * GET /api/venue-repository/stats
 * Get pipeline statistics
 */
router.get('/stats/summary', async (req: Request, res: Response) => {
  try {
    const query = `
      SELECT
        status,
        COUNT(*) as count
      FROM venue_repository
      GROUP BY status
    `;
    const result = await queryLocal(query);

    const stats: Record<string, number> = {
      new: 0,
      contacted: 0,
      interested: 0,
      negotiating: 0,
      rejected: 0,
      onboarded: 0,
      inactive: 0,
      total: 0
    };

    for (const row of result.rows) {
      stats[row.status] = parseInt(row.count);
      stats.total += parseInt(row.count);
    }

    res.json({ success: true, stats });
  } catch (error) {
    logger.error('Error fetching venue repository stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ============================================
// VMS TRANSFER
// ============================================

/**
 * POST /api/venue-repository/:id/transfer-to-vms
 * Transfer a venue to VMS (production location table) via gRPC
 */
router.post('/:id/transfer-to-vms', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { venue_manager_phone } = req.body;

    // Get venue from ops DB
    const venueResult = await queryLocal('SELECT * FROM venue_repository WHERE id = $1', [id]);
    if (venueResult.rows.length === 0) {
      return res.status(404).json({ error: 'Venue not found' });
    }

    const venue = venueResult.rows[0];

    if (venue.status !== 'onboarded') {
      return res.status(400).json({ error: 'Venue must be in onboarded status to transfer to VMS' });
    }

    if (venue.transferred_to_vms) {
      return res.status(400).json({ error: 'Venue has already been transferred to VMS' });
    }

    if (!venue.area_id) {
      return res.status(400).json({ error: 'Venue must have an area (area_id) to transfer to VMS' });
    }

    if (!venue.url) {
      return res.status(400).json({ error: 'Venue must have a Google Maps URL to transfer to VMS' });
    }

    if (!venue.contact_name) {
      return res.status(400).json({ error: 'Venue must have a contact name to transfer to VMS' });
    }

    if (!venue.contact_phone) {
      return res.status(400).json({ error: 'Venue must have a contact phone to transfer to VMS' });
    }

    // Parse venue_info
    const venueInfo = typeof venue.venue_info === 'string' ? JSON.parse(venue.venue_info) : (venue.venue_info || {});

    if (!venueInfo.venue_category) {
      return res.status(400).json({ error: 'Venue must have a venue category to transfer to VMS' });
    }

    if (!venueInfo.capacity_category) {
      return res.status(400).json({ error: 'Venue must have a capacity category to transfer to VMS' });
    }

    // Build gRPC CreateVenue request
    const grpcRequest: any = {
      name: venue.name,
      area_id: venue.area_id,
      venue_info: {}
    };

    if (venue.url) grpcRequest.url = venue.url;

    // Map venue_info fields
    if (venueInfo.venue_category) grpcRequest.venue_info.venue_category = venueInfo.venue_category;
    if (venueInfo.seating_category) grpcRequest.venue_info.seating_category = venueInfo.seating_category;
    if (venueInfo.capacity_category) grpcRequest.venue_info.capacity_category = venueInfo.capacity_category;
    if (venueInfo.amenities && venueInfo.amenities.length > 0) grpcRequest.venue_info.amenities = venueInfo.amenities;
    if (venueInfo.full_address) grpcRequest.venue_info.full_address = venueInfo.full_address;
    if (venueInfo.chargeable !== undefined) grpcRequest.venue_info.chargeable = venueInfo.chargeable;
    if (venueInfo.reason_for_charge) grpcRequest.venue_info.reason_for_charge = venueInfo.reason_for_charge;
    if (venueInfo.preferred_schedules && venueInfo.preferred_schedules.length > 0) {
      // Expand WEEKDAY/WEEKEND and comma-separated activities into individual VMS-compatible entries
      const expandedSchedules: any[] = [];
      for (const sched of venueInfo.preferred_schedules) {
        const days = sched.day === 'WEEKDAY' ? ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']
                   : sched.day === 'WEEKEND' ? ['SATURDAY', 'SUNDAY']
                   : [sched.day];
        const activities = sched.preferred_activity
          ? sched.preferred_activity.split(', ').filter((a: string) => a)
          : [''];
        for (const day of days) {
          for (const act of activities) {
            expandedSchedules.push({
              day,
              preferred_activity: act,
              ...(sched.start_time ? { start_time: sched.start_time } : {}),
              ...(sched.end_time ? { end_time: sched.end_time } : {}),
              ...(sched.notes ? { notes: sched.notes } : {})
            });
          }
        }
      }
      grpcRequest.venue_info.preferred_schedules = expandedSchedules;
    }

    // Call gRPC CreateVenue
    const grpcData = JSON.stringify(grpcRequest);
    const escapedData = grpcData.replace(/'/g, "'\\''");
    const grpcCmd = `grpcurl -plaintext -d '${escapedData}' 15.207.255.212:8001 LocationService.CreateVenue`;

    logger.info(`Calling gRPC CreateVenue for venue ${id}: ${venue.name}`);

    let grpcOutput: string;
    try {
      const { stdout, stderr } = await execAsync(grpcCmd, { timeout: 30000 });
      grpcOutput = stdout;
      if (stderr) logger.warn(`gRPC stderr: ${stderr}`);
    } catch (grpcError: any) {
      logger.error('gRPC CreateVenue failed:', grpcError);
      return res.status(500).json({
        error: 'Failed to create venue in VMS',
        details: grpcError.stderr || grpcError.message
      });
    }

    logger.info(`gRPC CreateVenue response: ${grpcOutput}`);

    // Query production DB for the newly created venue (match by name + area_id)
    let vmsLocationId: number | null = null;
    try {
      const findQuery = `
        SELECT id FROM location
        WHERE name = $1 AND area_id = $2 AND is_deleted = false
        ORDER BY id DESC LIMIT 1
      `;
      const findResult = await queryProduction(findQuery, [venue.name, venue.area_id]);
      if (findResult.rows.length > 0) {
        vmsLocationId = parseInt(findResult.rows[0].id);
      }
    } catch (findError) {
      logger.warn('Could not find newly created venue in VMS:', findError);
    }

    // Update ops DB with transfer info
    const updateQuery = `
      UPDATE venue_repository
      SET transferred_to_vms = true,
          transferred_at = NOW(),
          venue_manager_phone = $1
          ${vmsLocationId ? ', vms_location_id = ' + vmsLocationId : ''}
      WHERE id = $2
      RETURNING *
    `;
    const updateResult = await queryLocal(updateQuery, [venue_manager_phone || null, id]);

    // If venue_manager_phone is provided, assign venue manager
    if (venue_manager_phone && vmsLocationId) {
      try {
        // Step 1: Mark user as venue manager
        const markCmd = `grpcurl -plaintext -d '{"phone_number": "${venue_manager_phone}"}' 15.207.255.212:8001 LocationService.MarkUserAsVenueManager`;
        await execAsync(markCmd, { timeout: 15000 });
        logger.info(`Marked user ${venue_manager_phone} as venue manager`);

        // Step 2: Add venue manager to venue
        const addCmd = `grpcurl -plaintext -d '{"venue_id": ${vmsLocationId}, "phone_number": "${venue_manager_phone}"}' 15.207.255.212:8001 LocationService.AddVenueManager`;
        await execAsync(addCmd, { timeout: 15000 });
        logger.info(`Added venue manager ${venue_manager_phone} to venue ${vmsLocationId}`);
      } catch (managerError: any) {
        logger.warn('Failed to assign venue manager (venue was still created):', managerError.message);
      }
    }

    logger.info(`Transferred venue ${id} to VMS. VMS Location ID: ${vmsLocationId || 'unknown'}`);

    res.json({
      success: true,
      venue: updateResult.rows[0],
      vms_location_id: vmsLocationId,
      message: `Venue transferred to VMS${vmsLocationId ? ` (ID: ${vmsLocationId})` : ''}`
    });
  } catch (error) {
    logger.error('Error transferring venue to VMS:', error);
    res.status(500).json({ error: 'Failed to transfer venue to VMS' });
  }
});

/**
 * Core VMS sync logic - reusable by both API endpoint and scheduled job
 * Imports venues from production VMS that aren't in ops DB (excludes test venues)
 */
export async function runVmsSync(): Promise<{ synced_count: number; total_in_vms: number; already_tracked: number }> {
  // Get all venues from production location table (with venue_info, excluding test venues)
  const prodQuery = `
    SELECT l.id, l.name, l.url, l.area_id, l.venue_info,
           a.name as area_name, c.name as city_name
    FROM location l
    JOIN area a ON l.area_id = a.id
    JOIN city c ON a.city_id = c.id
    WHERE l.is_deleted = false
      AND l.venue_info IS NOT NULL
      AND l.venue_info != '{}'::jsonb
      AND l.name NOT ILIKE '%test%'
  `;
  const prodResult = await queryProduction(prodQuery);

  // Get all vms_location_id values from ops DB
  const opsResult = await queryLocal(
    'SELECT vms_location_id FROM venue_repository WHERE vms_location_id IS NOT NULL'
  );
  const existingVmsIds = new Set(opsResult.rows.map(r => parseInt(r.vms_location_id)));

  // Find venues in production that have no matching entry in ops DB
  const missingVenues = prodResult.rows.filter(v => !existingVmsIds.has(parseInt(v.id)));

  let syncedCount = 0;
  for (const venue of missingVenues) {
    try {
      await queryLocal(`
        INSERT INTO venue_repository (
          name, url, area_id, venue_info, status,
          transferred_to_vms, vms_location_id, transferred_at
        ) VALUES ($1, $2, $3, $4, 'onboarded', true, $5, NOW())
      `, [
        venue.name,
        venue.url || null,
        venue.area_id,
        JSON.stringify(venue.venue_info || {}),
        parseInt(venue.id)
      ]);
      syncedCount++;
    } catch (insertError) {
      logger.warn(`Failed to sync venue ${venue.id} (${venue.name}):`, insertError);
    }
  }

  logger.info(`VMS sync completed: ${syncedCount} venues imported from ${missingVenues.length} missing`);
  return { synced_count: syncedCount, total_in_vms: prodResult.rows.length, already_tracked: existingVmsIds.size };
}

export default router;
