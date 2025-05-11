import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { supabaseServiceRole } from '../src/utils/supabaseClient.js';

// Get the directory name of the current module
const __dirname = dirname(fileURLToPath(import.meta.url));

async function addNotesColumnToScanEvents() {
  try {
    console.log('Adding notes column to scan_events table...');
    
    // Read the SQL file
    const sqlFilePath = join(__dirname, 'add-notes-column-to-scan-events.sql');
    const sqlContent = readFileSync(sqlFilePath, 'utf8');
    
    // Execute the SQL
    const { error } = await supabaseServiceRole.rpc('exec_sql', { sql_query: sqlContent });
    
    if (error) {
      console.error('Error executing SQL:', error);
      return;
    }
    
    console.log('Successfully added notes column to scan_events table (if it didn\'t exist already)');
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the function
addNotesColumnToScanEvents();
