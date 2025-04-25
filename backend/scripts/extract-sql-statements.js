// Script to extract SQL statements from create-auth-tables.sql

const fs = require('fs');
const path = require('path');

// Read SQL file
const sqlFilePath = path.join(__dirname, 'create-auth-tables.sql');
const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');

// Output the entire SQL file as one block
console.log('=== SQL STATEMENTS TO RUN IN SUPABASE SQL EDITOR ===\n');
console.log(sqlContent);
console.log('\n=== END OF SQL STATEMENTS ===');
console.log('\nCopy these statements and run them in your Supabase SQL Editor at:');
console.log('https://saisklaqudigvdwzphlx.supabase.co/project/sql');
