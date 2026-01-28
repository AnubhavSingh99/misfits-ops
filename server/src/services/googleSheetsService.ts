import { logger } from '../utils/logger';

// Sheet configuration
const SHEET_ID = '17Ahh0jWqq1C_YasGA0Htx15lS3FYqLCalp7RVXYkiYo';
const SHEET_GID = '489504241'; // "final data" tab

export interface SheetRow {
  userId: number;        // Not in sheet, default 0
  name: string;          // Column B
  phone: string;         // Column C
  email: string;         // Column D
  dateTime: string;      // Column A - Date with time
  page: string;          // Derived from source (app)
  clubNameEventId: string; // Not in sheet
  helpPage: string;      // Column E - Help Page (Category)
  helpSection: string;   // Column F - Help section (Subcategory)
  feedback: string;      // Column G - Feedback/Description
  rowId: string;         // Not in sheet
  helper: string;        // Not in sheet
  date: string;          // Same as Column A
}

/**
 * Fetch data from Google Sheet via CSV export
 */
export async function fetchSheetData(): Promise<SheetRow[]> {
  const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`;

  try {
    const response = await fetch(csvUrl, {
      redirect: 'follow',
      headers: {
        'Accept': 'text/csv'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch sheet: ${response.status} ${response.statusText}`);
    }

    const csvText = await response.text();
    const rows = parseCSV(csvText);

    logger.info(`Fetched ${rows.length} rows from Google Sheet`);
    return rows;
  } catch (error) {
    logger.error('Error fetching Google Sheet:', error);
    throw error;
  }
}

/**
 * Parse CSV text into structured rows
 * Columns: A=Date, B=Name, C=Phone, D=Email, E=HelpPage, F=HelpSection, G=Feedback
 */
function parseCSV(csvText: string): SheetRow[] {
  const lines = csvText.split('\n');
  const rows: SheetRow[] = [];

  // Skip header row (index 0)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const columns = parseCSVLine(line);

    // Note: We no longer skip entries without phone numbers
    // They are tracked as "no contact" entries for visibility

    const dateTime = columns[0] || '';  // Column A - Date

    rows.push({
      userId: 0,
      name: columns[1] || '',           // Column B - Name
      phone: columns[2] || '',          // Column C - Phone
      email: columns[3] || '',          // Column D - Email
      dateTime: dateTime,               // Column A
      page: 'app',                      // Default source
      clubNameEventId: '',
      helpPage: columns[4] || '',       // Column E - Help Page (Category)
      helpSection: columns[5] || '',    // Column F - Help section (Subcategory)
      feedback: columns[6] || '',       // Column G - Feedback/Description
      rowId: '',
      helper: '',
      date: dateTime                    // Same as Column A
    });
  }

  return rows;
}

/**
 * Parse a single CSV line handling quoted fields
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  // Add last field
  result.push(current.trim());

  return result;
}

/**
 * Get rows newer than a specific date
 */
export function filterNewRows(rows: SheetRow[], lastProcessedDate: Date | null): SheetRow[] {
  if (!lastProcessedDate) {
    return rows; // Process all if no last date
  }

  return rows.filter(row => {
    const rowDate = parseSheetDate(row.date || row.dateTime);
    return rowDate && rowDate > lastProcessedDate;
  });
}

/**
 * Parse date from sheet format
 * Supports: "2023-12-19 18:57:03" (YYYY-MM-DD HH:MM:SS) or "2025/3/11 14:3:19"
 */
export function parseSheetDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  try {
    // Try ISO-like format first: 2023-12-19 18:57:03
    if (dateStr.includes('-')) {
      const parts = dateStr.split(' ');
      const dateParts = parts[0].split('-');

      if (dateParts.length !== 3) return null;

      const year = parseInt(dateParts[0]);
      const month = parseInt(dateParts[1]) - 1; // JS months are 0-indexed
      const day = parseInt(dateParts[2]);

      let hours = 0, minutes = 0, seconds = 0;

      if (parts[1]) {
        const timeParts = parts[1].split(':');
        hours = parseInt(timeParts[0]) || 0;
        minutes = parseInt(timeParts[1]) || 0;
        seconds = parseInt(timeParts[2]) || 0;
      }

      return new Date(year, month, day, hours, minutes, seconds);
    }

    // Fallback: Handle format 2025/3/11 14:3:19
    const parts = dateStr.split(' ');
    const dateParts = parts[0].split('/');

    if (dateParts.length !== 3) return null;

    const year = parseInt(dateParts[0]);
    const month = parseInt(dateParts[1]) - 1;
    const day = parseInt(dateParts[2]);

    let hours = 0, minutes = 0, seconds = 0;

    if (parts[1]) {
      const timeParts = parts[1].split(':');
      hours = parseInt(timeParts[0]) || 0;
      minutes = parseInt(timeParts[1]) || 0;
      seconds = parseInt(timeParts[2]) || 0;
    }

    return new Date(year, month, day, hours, minutes, seconds);
  } catch {
    return null;
  }
}

/**
 * Create unique identifier for a row (phone + date)
 */
export function getRowIdentifier(row: SheetRow): string {
  return `${row.phone}_${row.date || row.dateTime}`;
}
