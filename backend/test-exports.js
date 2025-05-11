// Simple test script to check if getUnassessedEntryByUrl exists in db.cjs exports

import * as db from './src/utils/db.cjs';

console.log('Checking db.cjs exports...');
console.log('Available functions in db.cjs:');
console.log(Object.keys(db));

// Check if getUnassessedEntryByUrl exists
if (db.getUnassessedEntryByUrl) {
  console.log('✅ getUnassessedEntryByUrl function exists in exports!');
} else {
  console.log('❌ getUnassessedEntryByUrl function does NOT exist in exports!');
}

// Exit the process after checking
process.exit(0);
