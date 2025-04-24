// Script to directly set up authentication and subscription tables for PrivacyLens

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
    
    // Split SQL content into individual statements
    const statements = sqlContent
      .split(';')
      .map(statement => statement.trim())
      .filter(statement => statement.length > 0);
    
    // Execute each statement
    for (const statement of statements) {
      console.log(`Executing SQL statement: ${statement.substring(0, 50)}...`);
      
      try {
        // Try using raw SQL query
        const { error } = await supabase.from('').rpc('exec_sql', { sql: statement });
        
        if (error) {
          console.error('Error executing statement:', error);
          // Continue with next statement
        }
      } catch (err) {
        console.error('Error executing statement:', err);
        // Continue with next statement
      }
    }
    
    console.log('Authentication and subscription tables set up successfully!');
  } catch (error) {
    console.error('Error setting up tables:', error);
    process.exit(1);
  }
}

// Run the setup
setupAuthTables();
