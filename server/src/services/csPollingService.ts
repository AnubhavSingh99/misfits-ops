import { Pool } from 'pg';
import { logger } from '../utils/logger';
import { fetchSheetData, filterNewRows, SheetRow, parseSheetDate } from './googleSheetsService';
import { processSheetRows, initCSService } from './csService';

let pool: Pool;
let pollingInterval: NodeJS.Timeout | null = null;
let lastProcessedDate: Date | null = null;
let isPolling = false;

// Polling configuration
const POLL_INTERVAL_MS = 30000; // 30 seconds

/**
 * Initialize the polling service
 */
export function initCSPolling(dbPool: Pool) {
  pool = dbPool;
  initCSService(dbPool);
  loadLastProcessedDate();
}

/**
 * Load the last processed date from database
 */
async function loadLastProcessedDate() {
  try {
    const result = await pool.query(`
      SELECT MAX(created_at) as last_date
      FROM cs_queries
      WHERE source != 'manual'
    `);

    if (result.rows[0]?.last_date) {
      lastProcessedDate = new Date(result.rows[0].last_date);
      logger.info(`Loaded last processed date: ${lastProcessedDate.toISOString()}`);
    } else {
      // If no records, start from 24 hours ago to avoid processing entire sheet
      lastProcessedDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      logger.info(`No existing records, starting from: ${lastProcessedDate.toISOString()}`);
    }
  } catch (error) {
    logger.error('Error loading last processed date:', error);
    lastProcessedDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
  }
}

/**
 * Start the polling job
 */
export function startPolling() {
  if (pollingInterval) {
    logger.warn('Polling already started');
    return;
  }

  logger.info(`Starting CS sheet polling (every ${POLL_INTERVAL_MS / 1000} seconds)`);

  // Run immediately on start
  pollSheetData();

  // Then run every interval
  pollingInterval = setInterval(pollSheetData, POLL_INTERVAL_MS);
}

/**
 * Stop the polling job
 */
export function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    logger.info('CS sheet polling stopped');
  }
}

/**
 * Check if polling is running
 */
export function isPollingActive(): boolean {
  return pollingInterval !== null;
}

/**
 * Get polling status
 */
export function getPollingStatus(): {
  active: boolean;
  lastProcessedDate: string | null;
  intervalMs: number;
} {
  return {
    active: isPollingActive(),
    lastProcessedDate: lastProcessedDate?.toISOString() || null,
    intervalMs: POLL_INTERVAL_MS
  };
}

/**
 * Poll the sheet for new data
 */
async function pollSheetData() {
  // Prevent concurrent polling
  if (isPolling) {
    logger.debug('Polling already in progress, skipping');
    return;
  }

  isPolling = true;

  try {
    logger.debug('Polling Google Sheet for new entries...');

    // Fetch all data from sheet
    const allRows = await fetchSheetData();

    // Filter to only new rows
    const newRows = filterNewRows(allRows, lastProcessedDate);

    if (newRows.length === 0) {
      logger.debug('No new entries found');
      return;
    }

    logger.info(`Found ${newRows.length} new entries to process`);

    // Process the rows
    const stats = await processSheetRows(newRows);

    logger.info(`Polling complete: ${stats.created} created, ${stats.skipped} skipped, ${stats.errors} errors`);

    // Update last processed date to the latest row
    updateLastProcessedDate(newRows);

  } catch (error) {
    logger.error('Error during sheet polling:', error);
  } finally {
    isPolling = false;
  }
}

/**
 * Update the last processed date based on processed rows
 */
function updateLastProcessedDate(rows: SheetRow[]) {
  let latestDate = lastProcessedDate;

  for (const row of rows) {
    const rowDate = parseSheetDate(row.date || row.dateTime);
    if (rowDate && (!latestDate || rowDate > latestDate)) {
      latestDate = rowDate;
    }
  }

  if (latestDate && latestDate !== lastProcessedDate) {
    lastProcessedDate = latestDate;
    logger.debug(`Updated last processed date to: ${lastProcessedDate.toISOString()}`);
  }
}

/**
 * Manually trigger a poll (for testing or manual refresh)
 */
export async function triggerManualPoll(): Promise<{
  success: boolean;
  stats?: { processed: number; created: number; skipped: number; errors: number };
  error?: string;
}> {
  if (isPolling) {
    return { success: false, error: 'Polling already in progress' };
  }

  try {
    isPolling = true;

    const allRows = await fetchSheetData();
    const newRows = filterNewRows(allRows, lastProcessedDate);

    if (newRows.length === 0) {
      return { success: true, stats: { processed: 0, created: 0, skipped: 0, errors: 0 } };
    }

    const stats = await processSheetRows(newRows);
    updateLastProcessedDate(newRows);

    return { success: true, stats };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  } finally {
    isPolling = false;
  }
}

/**
 * Reprocess all data from a specific date (for backfilling)
 */
export async function reprocessFromDate(fromDate: Date): Promise<{
  success: boolean;
  stats?: { processed: number; created: number; skipped: number; errors: number };
  error?: string;
}> {
  if (isPolling) {
    return { success: false, error: 'Polling in progress' };
  }

  try {
    isPolling = true;

    const allRows = await fetchSheetData();
    const rowsToProcess = filterNewRows(allRows, fromDate);

    if (rowsToProcess.length === 0) {
      return { success: true, stats: { processed: 0, created: 0, skipped: 0, errors: 0 } };
    }

    const stats = await processSheetRows(rowsToProcess);

    return { success: true, stats };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  } finally {
    isPolling = false;
  }
}
