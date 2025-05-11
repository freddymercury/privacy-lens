// Test script for getUnassessedEntryByUrl function

// Import the db module using dynamic import for ESM compatibility
import * as dbModule from './src/utils/db.cjs';

// Wait for the module to be loaded and initialized
const main = async () => {
  const db = dbModule;
  
  // Wait for initialization to complete
  await db.initializationPromise;
  try {
    console.log('Testing getUnassessedEntryByUrl function...');
    
    // Test with a URL that might exist in your database
    const url = 'example.com';
    console.log(`Looking up unassessed entry for URL: ${url}`);
    
    const entry = await db.getUnassessedEntryByUrl(url);
    
    if (entry) {
      console.log('Entry found:', entry);
    } else {
      console.log(`No entry found for URL: ${url}`);
      
      // Optionally, add the URL to the unassessed queue for testing
      console.log(`Adding ${url} to unassessed queue...`);
      const newEntry = await db.addToUnassessedQueue(url);
      console.log('Added entry:', newEntry);
      
      // Try getting it again
      console.log(`Looking up unassessed entry for URL: ${url} again...`);
      const verifyEntry = await db.getUnassessedEntryByUrl(url);
      console.log('Verification entry:', verifyEntry);
    }
    
    console.log('Test completed successfully!');
  } catch (error) {
    console.error('Error during test:', error);
  }
};

// Execute the main function
main().catch(error => {
  console.error('Unhandled error in main:', error);
});
