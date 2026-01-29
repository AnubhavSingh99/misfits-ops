import { Pool } from 'pg';
import { fetchSheetData, filterNewRows, parseSheetDate, SheetRow } from '../src/services/googleSheetsService';

// Create a test pool with the same config
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'misfits_ops',
  user: 'retalplaza',
});

async function queryExists(phone: string, dateStr: string): Promise<boolean> {
  const date = parseSheetDate(dateStr);
  if (!date) return false;

  const query = `
    SELECT id, ticket_number, user_contact, created_at FROM cs_queries
    WHERE user_contact = $1
      AND created_at >= ($2::timestamp - INTERVAL '1 minute')
      AND created_at <= ($2::timestamp + INTERVAL '1 minute')
  `;

  const result = await pool.query(query, [phone, date]);
  console.log('  queryExists query:', phone, date.toISOString());
  console.log('  result rows:', result.rows.length);
  if (result.rows.length > 0) {
    console.log('  existing:', result.rows[0]);
  }
  return result.rows.length > 0;
}

async function test() {
  console.log('Testing createQueryFromSheetRow logic...\n');

  // Fetch and filter rows
  const allRows = await fetchSheetData();
  const fromDate = new Date('2026-01-26T00:00:00');
  const filteredRows = allRows.filter(row => {
    const rowDate = parseSheetDate(row.date || row.dateTime);
    return rowDate && rowDate > fromDate;
  });

  console.log('Filtered rows to process:', filteredRows.length);

  // Test each row
  for (const row of filteredRows) {
    console.log('\n--- Processing:', row.phone, '|', row.name, '|', row.dateTime);

    // Check duplicate
    const exists = await queryExists(row.phone, row.date || row.dateTime);
    if (exists) {
      console.log('  WOULD SKIP: Duplicate found');
    } else {
      console.log('  WOULD CREATE: No duplicate');
    }
  }

  await pool.end();
}

test().catch(e => {
  console.error(e);
  pool.end();
});
