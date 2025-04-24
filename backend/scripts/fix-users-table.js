// Script to fix the users table in Supabase

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

async function fixUsersTable() {
  try {
    console.log('Checking if users table exists...');
    
    // Check if users table exists
    const { data: tables, error: tablesError } = await supabase
      .from('pg_tables')
      .select('tablename')
      .eq('schemaname', 'public');
    
    if (tablesError) {
      console.error('Error checking tables:', tablesError);
      return;
    }
    
    const usersTableExists = tables.some(table => table.tablename === 'users');
    
    if (!usersTableExists) {
      console.log('Users table does not exist. Creating it...');
      
      // Create users table
      const { error: createError } = await supabase.rpc('create_users_table');
      
      if (createError) {
        console.error('Error creating users table:', createError);
        return;
      }
      
      console.log('Users table created successfully!');
    } else {
      console.log('Users table exists. Checking if email column exists...');
      
      // Check if email column exists
      const { data: columns, error: columnsError } = await supabase
        .from('information_schema.columns')
        .select('column_name')
        .eq('table_name', 'users')
        .eq('table_schema', 'public');
      
      if (columnsError) {
        console.error('Error checking columns:', columnsError);
        return;
      }
      
      const emailColumnExists = columns.some(column => column.column_name === 'email');
      
      if (!emailColumnExists) {
        console.log('Email column does not exist. Adding it...');
        
        // Add email column
        const { error: addColumnError } = await supabase.rpc('add_email_column');
        
        if (addColumnError) {
          console.error('Error adding email column:', addColumnError);
          return;
        }
        
        console.log('Email column added successfully!');
      } else {
        console.log('Email column already exists.');
      }
    }
    
    console.log('Users table check completed!');
  } catch (error) {
    console.error('Error fixing users table:', error);
    process.exit(1);
  }
}

// Create RPC functions
async function createRpcFunctions() {
  try {
    console.log('Creating RPC functions...');
    
    // Create function to create users table
    const createUsersTableFn = `
      CREATE OR REPLACE FUNCTION create_users_table()
      RETURNS void AS $$
      BEGIN
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          email VARCHAR(255) NOT NULL UNIQUE,
          password_hash VARCHAR(255) NOT NULL,
          name VARCHAR(255),
          role VARCHAR(50) DEFAULT 'user',
          stripe_customer_id VARCHAR(255),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      END;
      $$ LANGUAGE plpgsql;
    `;
    
    // Create function to add email column
    const addEmailColumnFn = `
      CREATE OR REPLACE FUNCTION add_email_column()
      RETURNS void AS $$
      BEGIN
        ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) NOT NULL UNIQUE;
      END;
      $$ LANGUAGE plpgsql;
    `;
    
    // Execute SQL to create functions
    const { error: createFnError } = await supabase.rpc('exec_sql', { sql: createUsersTableFn });
    
    if (createFnError) {
      console.error('Error creating create_users_table function:', createFnError);
      return;
    }
    
    const { error: addColumnFnError } = await supabase.rpc('exec_sql', { sql: addEmailColumnFn });
    
    if (addColumnFnError) {
      console.error('Error creating add_email_column function:', addColumnFnError);
      return;
    }
    
    console.log('RPC functions created successfully!');
  } catch (error) {
    console.error('Error creating RPC functions:', error);
    process.exit(1);
  }
}

// Run the fix
async function run() {
  try {
    await createRpcFunctions();
    await fixUsersTable();
  } catch (error) {
    console.error('Error running fix:', error);
    process.exit(1);
  }
}

run();
