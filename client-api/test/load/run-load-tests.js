#!/usr/bin/env node

/**
 * Load Test Runner for Client API
 * 
 * This script runs comprehensive load tests for all Client API endpoints
 * and provides performance metrics and summaries.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

class LoadTestRunner {
  constructor() {
    this.results = {
      auth: { passed: 0, failed: 0, duration: 0 },
      assessment: { passed: 0, failed: 0, duration: 0 },
      subscription: { passed: 0, failed: 0, duration: 0 },
      overall: { passed: 0, failed: 0, duration: 0 }
    };
    this.startTime = Date.now();
  }

  log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
  }

  async runTest(testFile, testName) {
    this.log(`\n${colors.bright}=== Running ${testName} Load Tests ===${colors.reset}`, 'cyan');
    
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
      const testProcess = spawn('npm', ['test', testFile], {
        cwd: path.join(__dirname, '../..'),
        stdio: 'pipe'
      });

      let output = '';
      let errorOutput = '';

      testProcess.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        // Show real-time output for important messages
        if (text.includes('concurrent') || text.includes('completed') || text.includes('Average')) {
          process.stdout.write(text);
        }
      });

      testProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      testProcess.on('close', (code) => {
        const duration = Date.now() - startTime;
        
        if (code === 0) {
          this.log(`✅ ${testName} tests PASSED in ${duration}ms`, 'green');
          
          // Parse test results from output
          const passedMatches = output.match(/(\d+) passing/);
          const failedMatches = output.match(/(\d+) failing/);
          
          const passed = passedMatches ? parseInt(passedMatches[1]) : 0;
          const failed = failedMatches ? parseInt(failedMatches[1]) : 0;
          
          resolve({ passed, failed, duration, output });
        } else {
          this.log(`❌ ${testName} tests FAILED with code ${code}`, 'red');
          if (errorOutput) {
            this.log(`Error output: ${errorOutput}`, 'red');
          }
          
          // Try to parse partial results
          const passedMatches = output.match(/(\d+) passing/);
          const failedMatches = output.match(/(\d+) failing/);
          
          const passed = passedMatches ? parseInt(passedMatches[1]) : 0;
          const failed = failedMatches ? parseInt(failedMatches[1]) : 1; // At least 1 failure
          
          resolve({ passed, failed, duration, output, error: errorOutput });
        }
      });

      testProcess.on('error', (error) => {
        this.log(`❌ Failed to start ${testName} tests: ${error.message}`, 'red');
        reject(error);
      });
    });
  }

  async runAllTests() {
    this.log(`${colors.bright}🚀 Starting Client API Load Tests${colors.reset}`, 'cyan');
    this.log(`Timestamp: ${new Date().toISOString()}`, 'blue');
    
    const tests = [
      { file: 'test/load/auth.load.test.js', name: 'Authentication', key: 'auth' },
      { file: 'test/load/assessment.load.test.js', name: 'Assessment', key: 'assessment' },
      { file: 'test/load/subscription.load.test.js', name: 'Subscription', key: 'subscription' }
    ];

    for (const test of tests) {
      try {
        const result = await this.runTest(test.file, test.name);
        this.results[test.key] = result;
        this.results.overall.passed += result.passed;
        this.results.overall.failed += result.failed;
        this.results.overall.duration += result.duration;
      } catch (error) {
        this.log(`❌ Critical error running ${test.name} tests: ${error.message}`, 'red');
        this.results[test.key] = { passed: 0, failed: 1, duration: 0, error: error.message };
        this.results.overall.failed += 1;
      }
    }

    this.generateReport();
  }

  generateReport() {
    const totalTime = Date.now() - this.startTime;
    
    this.log(`\n${colors.bright}📊 LOAD TEST RESULTS SUMMARY${colors.reset}`, 'magenta');
    this.log('='.repeat(50), 'magenta');
    
    // Individual test results
    Object.entries(this.results).forEach(([key, result]) => {
      if (key === 'overall') return;
      
      const name = key.charAt(0).toUpperCase() + key.slice(1);
      const status = result.failed === 0 ? '✅ PASS' : '❌ FAIL';
      const statusColor = result.failed === 0 ? 'green' : 'red';
      
      this.log(`\n${name} Tests:`, 'cyan');
      this.log(`  Status: ${status}`, statusColor);
      this.log(`  Passed: ${result.passed}`, 'green');
      this.log(`  Failed: ${result.failed}`, result.failed > 0 ? 'red' : 'reset');
      this.log(`  Duration: ${result.duration}ms`, 'blue');
      
      if (result.error) {
        this.log(`  Error: ${result.error}`, 'red');
      }
    });

    // Overall summary
    this.log(`\n${colors.bright}OVERALL SUMMARY:${colors.reset}`, 'magenta');
    this.log(`  Total Tests: ${this.results.overall.passed + this.results.overall.failed}`, 'blue');
    this.log(`  Passed: ${this.results.overall.passed}`, 'green');
    this.log(`  Failed: ${this.results.overall.failed}`, this.results.overall.failed > 0 ? 'red' : 'green');
    this.log(`  Success Rate: ${this.calculateSuccessRate()}%`, this.results.overall.failed === 0 ? 'green' : 'yellow');
    this.log(`  Total Duration: ${totalTime}ms`, 'blue');

    // Performance insights
    this.generatePerformanceInsights();

    // Save results to file
    this.saveResults();

    // Exit with appropriate code
    process.exit(this.results.overall.failed > 0 ? 1 : 0);
  }

  calculateSuccessRate() {
    const total = this.results.overall.passed + this.results.overall.failed;
    if (total === 0) return 0;
    return Math.round((this.results.overall.passed / total) * 100);
  }

  generatePerformanceInsights() {
    this.log(`\n${colors.bright}🔍 PERFORMANCE INSIGHTS:${colors.reset}`, 'yellow');
    
    // Calculate average test duration per category
    const avgDurations = {};
    Object.entries(this.results).forEach(([key, result]) => {
      if (key === 'overall') return;
      const testCount = result.passed + result.failed;
      avgDurations[key] = testCount > 0 ? Math.round(result.duration / testCount) : 0;
    });

    // Find fastest and slowest test categories
    const sortedBySpeed = Object.entries(avgDurations).sort((a, b) => a[1] - b[1]);
    
    if (sortedBySpeed.length > 0) {
      this.log(`  Fastest: ${sortedBySpeed[0][0]} (${sortedBySpeed[0][1]}ms avg per test)`, 'green');
      this.log(`  Slowest: ${sortedBySpeed[sortedBySpeed.length - 1][0]} (${sortedBySpeed[sortedBySpeed.length - 1][1]}ms avg per test)`, 'yellow');
    }

    // Performance recommendations
    this.log(`\n${colors.bright}💡 RECOMMENDATIONS:${colors.reset}`, 'cyan');
    
    if (this.results.overall.failed > 0) {
      this.log(`  • Investigate failed tests to identify performance bottlenecks`, 'yellow');
    }
    
    if (avgDurations.assessment > 1000) {
      this.log(`  • Assessment tests are slow - consider optimizing LLM calls or database queries`, 'yellow');
    }
    
    if (avgDurations.auth > 500) {
      this.log(`  • Authentication tests are slow - check JWT processing and database connections`, 'yellow');
    }
    
    if (this.results.overall.failed === 0) {
      this.log(`  • All tests passed! Client API is performing well under load 🎉`, 'green');
    }
  }

  saveResults() {
    const reportData = {
      timestamp: new Date().toISOString(),
      results: this.results,
      summary: {
        totalTests: this.results.overall.passed + this.results.overall.failed,
        successRate: this.calculateSuccessRate(),
        totalDuration: Date.now() - this.startTime
      }
    };

    const reportPath = path.join(__dirname, 'load-test-results.json');
    
    try {
      fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
      this.log(`\n📄 Results saved to: ${reportPath}`, 'blue');
    } catch (error) {
      this.log(`⚠️  Failed to save results: ${error.message}`, 'yellow');
    }
  }
}

// CLI interface
if (require.main === module) {
  const runner = new LoadTestRunner();
  
  // Handle process termination gracefully
  process.on('SIGINT', () => {
    runner.log('\n⚠️  Load tests interrupted by user', 'yellow');
    process.exit(1);
  });

  process.on('SIGTERM', () => {
    runner.log('\n⚠️  Load tests terminated', 'yellow');
    process.exit(1);
  });

  // Run the tests
  runner.runAllTests().catch((error) => {
    runner.log(`❌ Critical error: ${error.message}`, 'red');
    process.exit(1);
  });
}

module.exports = LoadTestRunner; 