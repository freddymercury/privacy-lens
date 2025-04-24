// Script to add email column to users table using Supabase REST API

require('dotenv').config({ path: './src/.env' });
// Use dynamic import for node-fetch (ES module)

// Get Supabase credentials
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables must be set');
  process.exit(1);
}

async function addEmailColumn() {
  try {
    console.log('Adding email column to users table using REST API...');
    
    // Import fetch dynamically
    const { default: fetch } = await import('node-fetch');
    
    // SQL query to add email column
    const sql = 'ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);';
    
    // Encode the SQL query
    const encodedSql = encodeURIComponent(sql);
    
    // Construct the URL
    const url = `${supabaseUrl}/rest/v1/rpc/exec_sql?sql=${encodedSql}`;
    
    // Make the request
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });
    
    // Parse the response
    const result = await response.json();
    
    if (response.ok) {
      console.log('Email column added successfully!');
    } else {
      console.error('Error adding email column:', result);
      
      // If exec_sql function doesn't exist, provide instructions
      if (result.message && result.message.includes('exec_sql')) {
        console.log('\nThe exec_sql function does not exist in your Supabase project.');
        console.log('Please use the Supabase dashboard to add the email column:');
        console.log('1. Go to your Supabase project at', supabaseUrl);
        console.log('2. Navigate to the SQL Editor');
        console.log('3. Run the following SQL:');
        console.log('   ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);');
        console.log('\nAlternatively, you can create the exec_sql function first:');
        console.log('CREATE OR REPLACE FUNCTION exec_sql(sql text) RETURNS void AS $$');
        console.log('BEGIN');
        console.log('  EXECUTE sql;');
        console.log('END;');
        console.log('$$ LANGUAGE plpgsql SECURITY DEFINER;');
      }
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the script
addEmailColumn();
