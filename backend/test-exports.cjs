
// Simple test script to check if getUnassessedEntryByUrl exists in db.cjs exports
const fs = require('fs');
const path = require('path');

// Create a log file
const logFile = path.join(__dirname, 'test-output.log');
const writeLog = (message) => {
  fs.appendFileSync(logFile, message + '\n');
};

// Clear previous log
if (fs.existsSync(logFile)) {
  fs.unlinkSync(logFile);
}

writeLog('Starting test at ' + new Date().toISOString());

try {
  writeLog('Loading db.cjs module...');
  const db = require('./src/utils/db.cjs');
  
  writeLog('Checking db.cjs exports...');
  writeLog('Available functions in db.cjs:');
  writeLog(JSON.stringify(Object.keys(db), null, 2));
  
  // Check if getUnassessedEntryByUrl exists
  if (db.getUnassessedEntryByUrl) {
    writeLog('✅ getUnassessedEntryByUrl function exists in exports!');
  } else {
    writeLog('❌ getUnassessedEntryByUrl function does NOT exist in exports!');
  }
  
  // Wait for initialization to complete before exiting
  writeLog('Waiting for DB initialization to complete...');
  db.initializationPromise
    .then(() => {
      writeLog('DB initialization completed successfully.');
      writeLog('Test completed at ' + new Date().toISOString());
      process.exit(0);
    })
    .catch(error => {
      writeLog('Error during DB initialization: ' + error.message);
      writeLog(error.stack);
      process.exit(1);
    });
} catch (error) {
  writeLog('Unexpected error: ' + error.message);
  writeLog(error.stack);
  process.exit(1);
}
