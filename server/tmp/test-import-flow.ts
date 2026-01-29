import { fetchSheetData, filterNewRows, parseSheetDate } from '../src/services/googleSheetsService';

async function test() {
  console.log('Testing import flow...\n');

  // Fetch all rows
  const allRows = await fetchSheetData();
  console.log('Total rows fetched:', allRows.length);

  // Simulate the filter used for reimport from 27th Jan
  const fromDate = new Date('2026-01-27T00:00:00');
  console.log('\nFiltering from date:', fromDate.toISOString());

  // Filter using the same logic as filterNewRows
  const filteredRows = allRows.filter(row => {
    const rowDate = parseSheetDate(row.date || row.dateTime);
    if (!rowDate) {
      return false;
    }
    return rowDate > fromDate;
  });

  console.log('Rows after filter (date > fromDate):', filteredRows.length);
  console.log('\nFiltered rows:');
  filteredRows.forEach(r => {
    const parsed = parseSheetDate(r.date || r.dateTime);
    console.log('  ' + r.dateTime + ' | ' + (r.name || '(empty)') + ' | ' + r.phone + ' | parsed=' + (parsed ? parsed.toISOString() : 'null'));
  });

  // Now test with >= comparison
  console.log('\n\n--- Testing with >= comparison ---');
  const filteredRowsGte = allRows.filter(row => {
    const rowDate = parseSheetDate(row.date || row.dateTime);
    if (!rowDate) {
      return false;
    }
    return rowDate >= fromDate;
  });

  console.log('Rows after filter (date >= fromDate):', filteredRowsGte.length);

  // Check specific entries
  console.log('\n--- Checking specific phones ---');
  const targetPhones = ['7982604518', '7597665166', '9958003076'];
  for (const phone of targetPhones) {
    const row = allRows.find(r => r.phone === phone);
    if (row) {
      const parsed = parseSheetDate(row.date || row.dateTime);
      const inFiltered = filteredRows.some(r => r.phone === phone);
      const inFilteredGte = filteredRowsGte.some(r => r.phone === phone);
      console.log('\nPhone:', phone, 'Name:', row.name);
      console.log('  dateTime:', row.dateTime);
      console.log('  parsed:', parsed ? parsed.toISOString() : 'null');
      console.log('  fromDate:', fromDate.toISOString());
      console.log('  parsed > fromDate:', parsed && parsed > fromDate);
      console.log('  in filtered (>):', inFiltered);
      console.log('  in filteredGte (>=):', inFilteredGte);
    }
  }
}

test().catch(console.error);
