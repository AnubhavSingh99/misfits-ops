import { fetchSheetData } from '../src/services/googleSheetsService';

async function test() {
  console.log('Fetching sheet data...');
  const rows = await fetchSheetData();
  console.log('Total rows fetched:', rows.length);

  // Find Zaid sami and Saurabh Sharma
  const targetPhones = ['7982604518', '7597665166'];

  for (const phone of targetPhones) {
    const found = rows.find(r => r.phone === phone);
    if (found) {
      console.log('\nFound phone ' + phone + ':');
      console.log(JSON.stringify(found, null, 2));
    } else {
      console.log('\nPhone ' + phone + ' NOT found in parsed rows!');
      // Check if maybe phone format is different
      const partial = rows.filter(r => r.phone && r.phone.includes(phone.slice(-6)));
      if (partial.length > 0) {
        console.log('Partial matches:');
        partial.forEach(r => console.log('  phone:', r.phone, 'name:', r.name));
      }
    }
  }

  // Check rows from Jan 27-28
  const janRows = rows.filter(r => r.dateTime && r.dateTime.startsWith('2026-01-2'));
  console.log('\n\nRows from Jan 2026 with valid phones:', janRows.length);
  janRows.forEach(r => {
    console.log('  ' + r.dateTime + ' | ' + (r.name || '(empty)') + ' | ' + r.phone);
  });
}

test().catch(console.error);
