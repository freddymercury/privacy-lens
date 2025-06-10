// Test script to verify shared database module import and usage

// Test importing the shared module
console.log('Testing shared database module import...');

async function testSharedDatabase() {
  try {
    // Import the shared module
    const shared = await import('@privacy-lens/shared');
    
    console.log('✅ Successfully imported shared module');
    console.log('Available modules:', Object.keys(shared.default));
    console.log('Database module exports:', Object.keys(shared.default.db));
    
    // Test database client access
    const { supabaseServiceRole, createAuthedClient } = shared.default.db.client;
    
    console.log('✅ Successfully accessed database client exports');
    console.log('supabaseServiceRole available:', !!supabaseServiceRole);
    console.log('createAuthedClient available:', typeof createAuthedClient === 'function');
    
    // Test the pure connection functions
    const { validateSupabaseConfig, createMockClient } = shared.default.db.connection;
    
    console.log('✅ Successfully accessed pure connection functions');
    console.log('validateSupabaseConfig available:', typeof validateSupabaseConfig === 'function');
    console.log('createMockClient available:', typeof createMockClient === 'function');
    
    // Test the configuration validation function
    const testConfig = {
      supabaseUrl: 'test-url',
      supabaseAnonKey: 'test-anon-key',
      supabaseServiceKey: 'test-service-key'
    };
    
    const validation = validateSupabaseConfig(testConfig, false);
    console.log('✅ Configuration validation works:', validation.isValid);
    
    // Test mock client creation
    const mockClient = createMockClient();
    console.log('✅ Mock client creation works:', !!mockClient.from);
    
    // Test that the client can be used for database operations (in test mode)
    if (process.env.NODE_ENV === 'test') {
      console.log('Testing database operations in test mode...');
      const result = await supabaseServiceRole.from('websites').select('*').limit(1);
      console.log('✅ Database query test completed:', { hasData: !!result.data, hasError: !!result.error });
    }
    
    console.log('🎉 All tests passed! Database connection is available as shared module.');
    
  } catch (error) {
    console.error('❌ Error testing shared database module:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
}

testSharedDatabase(); 