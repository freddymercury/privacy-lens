// Script to execute SQL statements via Supabase REST API

require('dotenv').config({ path: './src/.env' });
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Get Supabase credentials from .env
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables must be set');
  process.exit(1);
}

// Read SQL file
const sqlFilePath = path.join(__dirname, 'create-auth-tables.sql');
const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');

// Function to execute SQL via REST API
async function executeSql(sql) {
  try {
    console.log('Executing SQL via REST API...');
    
    // Endpoint for SQL execution
    const endpoint = `${supabaseUrl}/rest/v1/rpc/exec_sql`;
    
    // Make the request
    const response = await axios({
      method: 'POST',
      url: endpoint,
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      data: {
        sql: sql
      }
    });
    
    console.log('SQL executed successfully!');
    console.log('Response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error executing SQL:', error.response ? error.response.data : error.message);
    throw error;
  }
}

// Main function
async function main() {
  try {
    // Execute the SQL
    await executeSql(sqlContent);
    console.log('Tables created successfully!');
  } catch (error) {
    console.error('Failed to create tables:', error);
    process.exit(1);
  }
}

// Run the main function
main();
