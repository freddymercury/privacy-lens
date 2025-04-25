// Script to add email column to users table in Supabase

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

async function addEmailColumn() {
  try {
    console.log('Attempting to add email column to users table...');
    
    // First, let's check if the users table exists
    const { data: userExists, error: userCheckError } = await supabase
      .from('users')
      .select('id')
      .limit(1);
    
    if (userCheckError) {
      console.error('Error checking users table:', userCheckError);
      console.log('This could mean the table does not exist or has a different structure.');
    } else {
      console.log('Users table exists.');
    }
    
    // Let's try to insert a test user with an email field
    const testUser = {
      email: 'test@example.com',
      password_hash: 'test_hash',
      name: 'Test User',
      role: 'user'
    };
    
    const { data: insertResult, error: insertError } = await supabase
      .from('users')
      .insert(testUser)
      .select();
    
    if (insertError) {
      console.error('Error inserting test user:', insertError);
      
      if (insertError.message.includes('email') && insertError.message.includes('does not exist')) {
        console.log('Confirmed: email column does not exist in users table.');
        console.log('Please use the Supabase dashboard to add the email column:');
        console.log('1. Go to your Supabase project');
        console.log('2. Navigate to the SQL Editor');
        console.log('3. Run the following SQL:');
        console.log('   ALTER TABLE users ADD COLUMN email VARCHAR(255) NOT NULL UNIQUE;');
      }
    } else {
      console.log('Test user inserted successfully with email field.');
      console.log('This suggests the email column already exists.');
      
      // Clean up the test user
      const { error: deleteError } = await supabase
        .from('users')
        .delete()
        .eq('email', 'test@example.com');
      
      if (deleteError) {
        console.error('Error deleting test user:', deleteError);
      } else {
        console.log('Test user deleted successfully.');
      }
    }
  } catch (error) {
    console.error('Error adding email column:', error);
  }
}

// Run the script
addEmailColumn();
