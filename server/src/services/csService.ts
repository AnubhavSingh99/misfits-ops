import { Pool } from 'pg';
import { logger } from '../utils/logger';
import { SheetRow, getRowIdentifier, parseSheetDate } from './googleSheetsService';

let pool: Pool;

export function initCSService(dbPool: Pool) {
  pool = dbPool;
}

// ============================================
// NORMALIZATION LOGIC
// ============================================

/**
 * Normalize category/subcategory names for consistency
 * Converts various formats to a clean, readable format
 */
export function normalizeTypeName(rawName: string): string {
  if (!rawName || rawName.trim() === '') return '';

  let normalized = rawName.trim();

  // Common mappings
  const mappings: Record<string, string> = {
    // App Issues variations
    'appissues': 'App Issues',
    'app_issues': 'App Issues',
    'app-issues': 'App Issues',
    'app issues': 'App Issues',
    'app-related issues': 'App Issues',

    // Other Issues variations
    'otherissues': 'Other Issues',
    'other_issues': 'Other Issues',
    'other-issues': 'Other Issues',
    'other issues': 'Other Issues',
    'other': 'Other Issues',

    // Safety Concerns variations
    'safetyconcerns': 'Safety Concerns',
    'safety_concerns': 'Safety Concerns',
    'safety-concerns': 'Safety Concerns',
    'safety concerns': 'Safety Concerns',

    // Pre-registration - Phone Number Entry
    'phonenumberentry_appissues': 'Phone Entry - App Issues',
    'phonenumberentry_safetyconcerns': 'Phone Entry - Safety Concerns',
    'phonenumberentry_otherissues': 'Phone Entry - Other Issues',

    // Pre-registration - OTP Verification
    'otpverification_appissues': 'OTP Verification - App Issues',
    'otpverification_safetyconcerns': 'OTP Verification - Safety Concerns',
    'otpverification_otherissues': 'OTP Verification - Other Issues',

    // Subcategories
    'meetup/booking issues': 'Meetup/Booking Issues',
    'meetup_booking_issues': 'Meetup/Booking Issues',
    'payments issues': 'Payments Issues',
    'payment_issues': 'Payments Issues',
    'chat issues': 'Chat Issues',
    'chat_issues': 'Chat Issues',
    'club/group approval issues': 'Club/Group Approval Issues',
    'club_group_approval_issues': 'Club/Group Approval Issues',
    'app use issues': 'App Use Issues',
    'app_use_issues': 'App Use Issues',
    'app not working issues': 'App Not Working Issues',
    'app_not_working_issues': 'App Not Working Issues',
    'activity/location issues': 'Activity/Location Issues',
    'activity_location_issues': 'Activity/Location Issues',

    // From sheet data
    'app-related issues page': 'App Issues',
    'app-related issues:payments': 'Payments Issues',
  };

  // Check direct mapping first
  const lowerName = normalized.toLowerCase().replace(/\s+/g, ' ');
  if (mappings[lowerName]) {
    return mappings[lowerName];
  }

  // Try without spaces
  const noSpaces = lowerName.replace(/\s+/g, '');
  if (mappings[noSpaces]) {
    return mappings[noSpaces];
  }

  // If no mapping found, convert to Title Case
  return normalized
    .replace(/([a-z])([A-Z])/g, '$1 $2')  // camelCase to spaces
    .replace(/_/g, ' ')                     // underscores to spaces
    .replace(/-/g, ' ')                     // dashes to spaces
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Determine source from page column
 */
export function normalizeSource(page: string): string {
  if (!page) return 'app';

  const lowerPage = page.toLowerCase();

  if (lowerPage.includes('website')) return 'website';
  if (lowerPage.includes('playstore')) return 'playstore';
  if (lowerPage.includes('appstore')) return 'appstore';
  if (lowerPage.includes('whatsapp')) return 'whatsapp';

  return 'app';
}

/**
 * Determine stakeholder type from the data
 * For now, all sheet data is from users
 */
export function determineStakeholderType(row: SheetRow): 'user' | 'leader' | 'venue' {
  // Future: Add logic to determine if it's a leader or venue query
  return 'user';
}

// ============================================
// QUERY TYPE MANAGEMENT
// ============================================

interface QueryType {
  id: number;
  stakeholder_type: string;
  name: string;
  parent_id: number | null;
  default_sla_hours: number;
}

/**
 * Get or create a query type
 */
export async function getOrCreateQueryType(
  stakeholderType: string,
  name: string,
  parentId: number | null = null,
  defaultSlaHours: number = 24
): Promise<QueryType> {
  const normalizedName = normalizeTypeName(name);

  if (!normalizedName) {
    throw new Error('Query type name cannot be empty');
  }

  // Try to find existing
  const findQuery = `
    SELECT id, stakeholder_type, name, parent_id, default_sla_hours
    FROM cs_query_types
    WHERE stakeholder_type = $1
      AND name = $2
      AND ${parentId ? 'parent_id = $3' : 'parent_id IS NULL'}
  `;
  const findParams = parentId
    ? [stakeholderType, normalizedName, parentId]
    : [stakeholderType, normalizedName];

  const existing = await pool.query(findQuery, findParams);

  if (existing.rows.length > 0) {
    return existing.rows[0];
  }

  // Create new
  const insertQuery = `
    INSERT INTO cs_query_types (stakeholder_type, name, parent_id, default_sla_hours)
    VALUES ($1, $2, $3, $4)
    RETURNING id, stakeholder_type, name, parent_id, default_sla_hours
  `;
  const insertParams = [stakeholderType, normalizedName, parentId, defaultSlaHours];

  const result = await pool.query(insertQuery, insertParams);
  logger.info(`Created new query type: ${normalizedName} (${stakeholderType})`);

  return result.rows[0];
}

// ============================================
// QUERY MANAGEMENT
// ============================================

interface CSQuery {
  id: number;
  ticket_number: string;
  stakeholder_type: string;
  query_type_id: number;
  query_subtype_id: number | null;
  source: string;
  user_id: number;
  user_name: string;
  user_contact: string;
  subject: string;
  description: string;
  priority: string;
  status: string;
}

/**
 * Check if a query already exists
 * For entries with phone: match by phone + date (within 1 minute)
 * For entries without phone: match by date + helpPage (within 1 minute)
 */
export async function queryExists(phone: string, dateStr: string, helpPage?: string): Promise<boolean> {
  const date = parseSheetDate(dateStr);
  if (!date) return false;

  let query: string;
  let params: (string | Date)[];

  if (phone && phone.trim() !== '') {
    // Has phone - match by phone + date
    query = `
      SELECT id FROM cs_queries
      WHERE user_contact = $1
        AND created_at >= ($2::timestamp - INTERVAL '1 minute')
        AND created_at <= ($2::timestamp + INTERVAL '1 minute')
    `;
    params = [phone, date];
  } else {
    // No phone - match by date + subject (which contains helpPage info)
    query = `
      SELECT id FROM cs_queries
      WHERE (user_contact IS NULL OR user_contact = '')
        AND created_at >= ($1::timestamp - INTERVAL '1 minute')
        AND created_at <= ($1::timestamp + INTERVAL '1 minute')
        AND subject ILIKE $2
    `;
    params = [date, `%${helpPage || ''}%`];
  }

  const result = await pool.query(query, params);
  return result.rows.length > 0;
}

/**
 * Create a new CS query from sheet row
 */
export async function createQueryFromSheetRow(row: SheetRow): Promise<CSQuery | null> {
  try {
    // Check for duplicate
    const exists = await queryExists(row.phone, row.date || row.dateTime, row.helpPage);
    if (exists) {
      logger.debug(`Skipping duplicate query for phone ${row.phone || '(no phone)'}`);
      return null;
    }

    // Determine if entry has contact info
    const hasContactInfo = !!(row.phone && row.phone.trim() !== '');

    const stakeholderType = determineStakeholderType(row);
    const source = normalizeSource(row.page);

    // Get or create query type (category)
    let queryType: QueryType | null = null;
    let querySubtype: QueryType | null = null;

    if (row.helpPage) {
      queryType = await getOrCreateQueryType(stakeholderType, row.helpPage);

      // Get or create subtype if exists
      if (row.helpSection) {
        querySubtype = await getOrCreateQueryType(
          stakeholderType,
          row.helpSection,
          queryType.id
        );
      }
    } else {
      // Default to "Other Issues" if no category
      queryType = await getOrCreateQueryType(stakeholderType, 'Other Issues');
    }

    // Parse date
    const createdAt = parseSheetDate(row.date || row.dateTime) || new Date();

    // Create subject from available info
    const subject = row.helpSection
      ? `${normalizeTypeName(row.helpPage)} - ${normalizeTypeName(row.helpSection)}`
      : normalizeTypeName(row.helpPage) || 'User Query';

    // Insert query
    const insertQuery = `
      INSERT INTO cs_queries (
        stakeholder_type,
        query_type_id,
        query_subtype_id,
        source,
        user_id,
        user_name,
        user_contact,
        user_email,
        subject,
        description,
        priority,
        status,
        sla_hours,
        created_at,
        has_contact_info
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `;

    const params = [
      stakeholderType,
      queryType.id,
      querySubtype?.id || null,
      source,
      row.userId || 0,
      row.name || '',
      row.phone || '',
      row.email || '',
      subject,
      row.feedback || '',
      'normal',  // Initial priority, will be recalculated based on SLA
      'created',  // Initial status
      queryType.default_sla_hours,
      createdAt,
      hasContactInfo
    ];

    const result = await pool.query(insertQuery, params);
    logger.info(`Created CS query: ${result.rows[0].ticket_number} for ${row.phone || '(no contact)'}${!hasContactInfo ? ' [NO CONTACT]' : ''}`);

    return result.rows[0];
  } catch (error) {
    logger.error(`Error creating query from sheet row:`, error);
    return null;
  }
}

/**
 * Process multiple sheet rows
 */
export async function processSheetRows(rows: SheetRow[]): Promise<{
  processed: number;
  created: number;
  skipped: number;
  errors: number;
}> {
  const stats = { processed: 0, created: 0, skipped: 0, errors: 0 };

  for (const row of rows) {
    stats.processed++;

    try {
      const query = await createQueryFromSheetRow(row);
      if (query) {
        stats.created++;
      } else {
        stats.skipped++;
      }
    } catch (error) {
      stats.errors++;
      logger.error(`Error processing row for ${row.phone}:`, error);
    }
  }

  return stats;
}

// ============================================
// DASHBOARD QUERIES
// ============================================

/**
 * Get all CS queries with filters
 */
export async function getQueries(filters: {
  stakeholder_type?: string;
  status?: string;
  priority?: string;
  query_type_id?: number;
  assigned_to?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{ queries: CSQuery[]; total: number }> {
  let whereClause = 'WHERE 1=1';
  const params: (string | number)[] = [];
  let paramIndex = 1;

  if (filters.stakeholder_type) {
    whereClause += ` AND q.stakeholder_type = $${paramIndex++}`;
    params.push(filters.stakeholder_type);
  }
  if (filters.status) {
    whereClause += ` AND q.status = $${paramIndex++}`;
    params.push(filters.status);
  }
  if (filters.priority) {
    whereClause += ` AND q.priority = $${paramIndex++}`;
    params.push(filters.priority);
  }
  if (filters.query_type_id) {
    whereClause += ` AND q.query_type_id = $${paramIndex++}`;
    params.push(filters.query_type_id);
  }
  if (filters.assigned_to) {
    whereClause += ` AND q.assigned_to = $${paramIndex++}`;
    params.push(filters.assigned_to);
  }

  // Get total count
  const countQuery = `SELECT COUNT(*) FROM cs_queries q ${whereClause}`;
  const countResult = await pool.query(countQuery, params);
  const total = parseInt(countResult.rows[0].count);

  // Get queries with pagination
  const limit = filters.limit || 50;
  const offset = filters.offset || 0;

  // Order: Open tickets by oldest first (longest TAT), closed by newest first
  const query = `
    SELECT
      q.*,
      qt.name as query_type_name,
      qst.name as query_subtype_name
    FROM cs_queries q
    LEFT JOIN cs_query_types qt ON q.query_type_id = qt.id
    LEFT JOIN cs_query_types qst ON q.query_subtype_id = qst.id
    ${whereClause}
    ORDER BY
      CASE WHEN q.status IN ('resolved', 'resolution_communicated') THEN 1 ELSE 0 END,
      CASE WHEN q.status IN ('resolved', 'resolution_communicated') THEN q.created_at END DESC,
      q.created_at ASC
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}
  `;
  params.push(limit, offset);

  const result = await pool.query(query, params);

  return { queries: result.rows, total };
}

/**
 * Get query types for dropdown
 */
export async function getQueryTypes(stakeholderType?: string): Promise<QueryType[]> {
  let query = `
    SELECT id, stakeholder_type, name, parent_id, default_sla_hours
    FROM cs_query_types
    WHERE is_active = true
  `;
  const params: string[] = [];

  if (stakeholderType) {
    query += ' AND stakeholder_type = $1';
    params.push(stakeholderType);
  }

  query += ' ORDER BY stakeholder_type, parent_id NULLS FIRST, name';

  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Update query status
 */
export async function updateQueryStatus(
  id: number,
  status: string,
  assignedTo?: string,
  resolutionNotes?: string
): Promise<CSQuery | null> {
  const updates: string[] = ['status = $2'];
  const params: (string | number | Date)[] = [id, status];
  let paramIndex = 3;

  if (assignedTo !== undefined) {
    updates.push(`assigned_to = $${paramIndex++}`);
    params.push(assignedTo);
  }

  if (status === 'resolved' || status === 'resolution_communicated') {
    if (status === 'resolved') {
      updates.push(`resolved_at = $${paramIndex++}`);
      params.push(new Date());
    }
    if (status === 'resolution_communicated') {
      updates.push(`closed_at = $${paramIndex++}`);
      params.push(new Date());
    }
    if (resolutionNotes) {
      updates.push(`resolution_notes = $${paramIndex++}`);
      params.push(resolutionNotes);
    }
  }

  if (status === 'in_progress' || status === 'ticket_communicated') {
    // Track first response
    updates.push(`first_response_at = COALESCE(first_response_at, $${paramIndex++})`);
    params.push(new Date());
  }

  const query = `
    UPDATE cs_queries
    SET ${updates.join(', ')}
    WHERE id = $1
    RETURNING *
  `;

  const result = await pool.query(query, params);
  return result.rows[0] || null;
}

/**
 * Get dashboard stats
 * Status workflow: created → in_progress → ticket_communicated → resolved → resolution_communicated
 */
export async function getDashboardStats(): Promise<{
  total: number;
  open: number;
  in_progress: number;
  pending: number;
  resolved: number;
  closed: number;
  no_contact: number;
  by_stakeholder: Record<string, number>;
  by_priority: Record<string, number>;
}> {
  const statsQuery = `
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'created') as created,
      COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
      COUNT(*) FILTER (WHERE status = 'ticket_communicated') as ticket_communicated,
      COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
      COUNT(*) FILTER (WHERE status = 'resolution_communicated') as resolution_communicated,
      COUNT(*) FILTER (WHERE has_contact_info = false AND status NOT IN ('resolved', 'resolution_communicated')) as no_contact
    FROM cs_queries
  `;

  const byStakeholderQuery = `
    SELECT stakeholder_type, COUNT(*) as count
    FROM cs_queries
    WHERE status NOT IN ('resolved', 'resolution_communicated')
    GROUP BY stakeholder_type
  `;

  const byPriorityQuery = `
    SELECT priority, COUNT(*) as count
    FROM cs_queries
    WHERE status NOT IN ('resolved', 'resolution_communicated')
    GROUP BY priority
  `;

  const [statsResult, stakeholderResult, priorityResult] = await Promise.all([
    pool.query(statsQuery),
    pool.query(byStakeholderQuery),
    pool.query(byPriorityQuery)
  ]);

  const stats = statsResult.rows[0];
  const byStakeholder: Record<string, number> = {};
  const byPriority: Record<string, number> = {};

  stakeholderResult.rows.forEach(row => {
    byStakeholder[row.stakeholder_type] = parseInt(row.count);
  });

  priorityResult.rows.forEach(row => {
    byPriority[row.priority] = parseInt(row.count);
  });

  return {
    total: parseInt(stats.total),
    open: parseInt(stats.created),  // Map to old field name for compatibility
    in_progress: parseInt(stats.in_progress),
    pending: parseInt(stats.ticket_communicated),  // Map to old field name
    resolved: parseInt(stats.resolved),
    closed: parseInt(stats.resolution_communicated),  // Map to old field name
    no_contact: parseInt(stats.no_contact || '0'),
    by_stakeholder: byStakeholder,
    by_priority: byPriority
  };
}
