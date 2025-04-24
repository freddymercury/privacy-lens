// Script to provide instructions for fixing the users table in Supabase

require('dotenv').config({ path: './src/.env' });
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables must be set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkUsersTable() {
  try {
    console.log('Checking users table structure...');
    
    // Try to get a user with email field
    const { data, error } = await supabase
      .from('users')
      .select('email')
      .limit(1);
    
    if (error) {
      if (error.message && error.message.includes('email') && error.message.includes('does not exist')) {
        console.log('\n===== ISSUE DETECTED: Missing email column in users table =====');
        console.log('\nThe error "column users.email does not exist" indicates that the users table');
        console.log('exists but does not have an email column, which is required for authentication.');
        
        console.log('\n===== SOLUTION =====');
        console.log('\nTo fix this issue, you need to add the email column to the users table.');
        console.log('Please follow these steps:');
        console.log('\n1. Go to your Supabase project dashboard at:');
        console.log(`   ${supabaseUrl}`);
        console.log('\n2. Navigate to the SQL Editor (left sidebar)');
        console.log('\n3. Create a new query and paste the following SQL:');
        console.log('\n   ALTER TABLE users ADD COLUMN email VARCHAR(255) NOT NULL UNIQUE;');
        console.log('\n4. Run the query by clicking the "Run" button');
        console.log('\n5. Restart your backend server after making this change');
        
        console.log('\n===== VERIFICATION =====');
        console.log('\nAfter adding the column, you can verify it was added successfully by running:');
        console.log('   SELECT column_name FROM information_schema.columns WHERE table_name = \'users\';');
        console.log('\nYou should see "email" in the list of columns.');
      } else {
        console.error('Error checking users table:', error);
      }
    } else {
      console.log('Users table has the email column. No issues detected.');
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the check
checkUsersTable();
