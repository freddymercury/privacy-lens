// Script to set up authentication and subscription tables for PrivacyLens

require('dotenv').config({ path: './src/.env' });
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables must be set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function setupAuthTables() {
  try {
    console.log('Setting up authentication and subscription tables...');
    
    // Read SQL file
    const sqlFilePath = path.join(__dirname, 'create-auth-tables.sql');
    const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
    
    // Execute SQL
    const { error } = await supabase.rpc('exec_sql', { sql: sqlContent });
    
    if (error) {
      throw error;
    }
    
    console.log('Authentication and subscription tables set up successfully!');
  } catch (error) {
    console.error('Error setting up tables:', error);
    process.exit(1);
  }
}

// Run the setup
setupAuthTables();
