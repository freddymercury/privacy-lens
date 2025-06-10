#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const ARTILLERY_DIR = __dirname;
const REPORTS_DIR = path.join(ARTILLERY_DIR, 'reports');
const SERVER_PORT = process.env.CLIENT_API_PORT || 3001;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

// Ensure reports directory exists
if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

// Test configurations
const tests = [
  {
    name: 'Authentication Load Test',
    config: 'auth-load-test.yml',
    report: 'auth-load-report.json'
  },
  {
    name: 'Assessment Load Test', 
    config: 'assessment-load-test.yml',
    report: 'assessment-load-report.json'
  }
];

// Check if server is running
async function checkServer() {
  try {
    const response = await fetch(`${SERVER_URL}/health`);
    if (response.ok) {
      console.log('✅ Server is running and healthy');
      return true;
    }
  } catch (error) {
    console.log('❌ Server is not running or not responding');
    console.log('Please start the server with: npm run start');
    return false;
  }
}

// Run a single Artillery test
function runTest(testConfig) {
  return new Promise((resolve, reject) => {
    const configPath = path.join(ARTILLERY_DIR, testConfig.config);
    const reportPath = path.join(REPORTS_DIR, testConfig.report);
    
    console.log(`\n🚀 Running ${testConfig.name}...`);
    console.log(`Config: ${testConfig.config}`);
    console.log(`Report: ${testConfig.report}`);
    
    const artillery = spawn('npx', [
      'artillery', 'run',
      '--output', reportPath,
      configPath
    ], {
      stdio: 'inherit',
      cwd: ARTILLERY_DIR
    });
    
    artillery.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ ${testConfig.name} completed successfully`);
        resolve(reportPath);
      } else {
        console.log(`❌ ${testConfig.name} failed with exit code ${code}`);
        reject(new Error(`Test failed with exit code ${code}`));
      }
    });
    
    artillery.on('error', (error) => {
      console.log(`❌ Error running ${testConfig.name}:`, error.message);
      reject(error);
    });
  });
}

// Generate HTML report from JSON
function generateHtmlReport(jsonReportPath) {
  return new Promise((resolve, reject) => {
    const htmlReportPath = jsonReportPath.replace('.json', '.html');
    
    console.log(`📊 Generating HTML report: ${path.basename(htmlReportPath)}`);
    
    const artillery = spawn('npx', [
      'artillery', 'report',
      jsonReportPath,
      '--output', htmlReportPath
    ], {
      stdio: 'inherit',
      cwd: ARTILLERY_DIR
    });
    
    artillery.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ HTML report generated: ${htmlReportPath}`);
        resolve(htmlReportPath);
      } else {
        console.log(`⚠️ HTML report generation failed with exit code ${code}`);
        resolve(null); // Don't fail the whole process for report generation
      }
    });
    
    artillery.on('error', (error) => {
      console.log(`⚠️ Error generating HTML report:`, error.message);
      resolve(null);
    });
  });
}

// Main execution
async function main() {
  console.log('🎯 PrivacyLens Client API Load Testing');
  console.log('=====================================\n');
  
  // Check if server is running
  const serverRunning = await checkServer();
  if (!serverRunning) {
    process.exit(1);
  }
  
  const results = [];
  
  // Run all tests sequentially
  for (const test of tests) {
    try {
      const reportPath = await runTest(test);
      const htmlReportPath = await generateHtmlReport(reportPath);
      
      results.push({
        name: test.name,
        success: true,
        jsonReport: reportPath,
        htmlReport: htmlReportPath
      });
      
    } catch (error) {
      results.push({
        name: test.name,
        success: false,
        error: error.message
      });
    }
  }
  
  // Summary
  console.log('\n📋 Load Testing Summary');
  console.log('=======================');
  
  results.forEach(result => {
    if (result.success) {
      console.log(`✅ ${result.name}`);
      console.log(`   JSON Report: ${result.jsonReport}`);
      if (result.htmlReport) {
        console.log(`   HTML Report: ${result.htmlReport}`);
      }
    } else {
      console.log(`❌ ${result.name}: ${result.error}`);
    }
  });
  
  const successCount = results.filter(r => r.success).length;
  console.log(`\n🎯 Results: ${successCount}/${results.length} tests completed successfully`);
  
  if (successCount === results.length) {
    console.log('\n🎉 All load tests completed successfully!');
    console.log(`📁 Reports available in: ${REPORTS_DIR}`);
  } else {
    console.log('\n⚠️ Some tests failed. Check the output above for details.');
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Load testing interrupted by user');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Load testing terminated');
  process.exit(0);
});

// Run the main function
main().catch(error => {
  console.error('💥 Fatal error:', error.message);
  process.exit(1);
}); 