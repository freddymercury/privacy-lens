// Very simple test script to check if getUnassessedEntryByUrl exists in db.cjs exports
const fs = require('fs');

// Load the db module
const db = require('./src/utils/db.cjs');

// Write results to a file
fs.writeFileSync('simple-test-output.txt', 
  'DB module exports: ' + JSON.stringify(Object.keys(db)) + '\n\n' +
  'getUnassessedEntryByUrl exists: ' + (db.getUnassessedEntryByUrl !== undefined)
);

console.log('Test completed. Check simple-test-output.txt for results.');
