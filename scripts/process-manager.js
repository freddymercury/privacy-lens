#!/usr/bin/env node

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

class ProcessManager {
  constructor() {
    this.processes = new Map();
    this.pidFile = path.join(__dirname, '../.pids');
  }

  async startProcess(name, command, cwd, port) {
    if (this.processes.has(name)) {
      console.log(`Process ${name} is already running`);
      return;
    }

    console.log(`Starting ${name}...`);
    
    const child = spawn('npm', ['start'], {
      cwd: path.join(__dirname, '..', cwd),
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false
    });

    child.stdout.on('data', (data) => {
      console.log(`[${name}] ${data.toString().trim()}`);
    });

    child.stderr.on('data', (data) => {
      console.error(`[${name}] ERROR: ${data.toString().trim()}`);
    });

    child.on('close', (code) => {
      console.log(`[${name}] Process exited with code ${code}`);
      this.processes.delete(name);
      this.savePids();
    });

    this.processes.set(name, { 
      process: child, 
      pid: child.pid, 
      port: port,
      startTime: new Date()
    });

    this.savePids();
    
    // Wait a moment to see if process starts successfully
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    if (this.processes.has(name)) {
      console.log(`✅ ${name} started successfully (PID: ${child.pid}, Port: ${port})`);
    }
  }

  stopProcess(name) {
    const processInfo = this.processes.get(name);
    if (!processInfo) {
      console.log(`Process ${name} is not running`);
      return;
    }

    console.log(`Stopping ${name} (PID: ${processInfo.pid})...`);
    
    try {
      process.kill(processInfo.pid, 'SIGTERM');
      this.processes.delete(name);
      this.savePids();
      console.log(`✅ ${name} stopped`);
    } catch (error) {
      console.error(`Error stopping ${name}:`, error.message);
    }
  }

  async stopAll() {
    console.log('Stopping all processes...');
    for (const [name] of this.processes) {
      this.stopProcess(name);
    }
    
    // Clean up any remaining processes
    try {
      exec('pkill -f "node.*privacy-lens"', (error) => {
        if (error && error.code !== 1) { // code 1 means no processes found
          console.error('Error during cleanup:', error.message);
        }
      });
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  async startAll() {
    console.log('Starting all PrivacyLens processes...\n');
    
    // Start backend first
    await this.startProcess('backend', 'npm start', 'backend', 3000);
    
    // Start client-api
    await this.startProcess('client-api', 'npm start', 'client-api', 3001);
    
    console.log('\n🚀 All processes started!');
    console.log('Backend: http://localhost:3000');
    console.log('Client API: http://localhost:3001');
    console.log('NGINX Proxy: http://localhost (if nginx is running)');
  }

  status() {
    console.log('PrivacyLens Process Status:\n');
    
    if (this.processes.size === 0) {
      console.log('No processes running');
      return;
    }

    for (const [name, info] of this.processes) {
      const uptime = Math.floor((Date.now() - info.startTime.getTime()) / 1000);
      console.log(`✅ ${name}`);
      console.log(`   PID: ${info.pid}`);
      console.log(`   Port: ${info.port}`);
      console.log(`   Uptime: ${uptime}s`);
      console.log('');
    }
  }

  async healthCheck() {
    console.log('Performing health checks...\n');
    
    const checks = [
      { name: 'Backend', url: 'http://localhost:3000/health' },
      { name: 'Client API', url: 'http://localhost:3001/health' },
      { name: 'NGINX Proxy', url: 'http://localhost/health' }
    ];

    for (const check of checks) {
      try {
        const response = await fetch(check.url);
        if (response.ok) {
          console.log(`✅ ${check.name}: OK`);
        } else {
          console.log(`❌ ${check.name}: HTTP ${response.status}`);
        }
      } catch (error) {
        console.log(`❌ ${check.name}: ${error.message}`);
      }
    }
  }

  savePids() {
    const pids = {};
    for (const [name, info] of this.processes) {
      pids[name] = {
        pid: info.pid,
        port: info.port,
        startTime: info.startTime.toISOString()
      };
    }
    
    try {
      fs.writeFileSync(this.pidFile, JSON.stringify(pids, null, 2));
    } catch (error) {
      console.error('Error saving PIDs:', error.message);
    }
  }

  loadPids() {
    try {
      if (fs.existsSync(this.pidFile)) {
        const pids = JSON.parse(fs.readFileSync(this.pidFile, 'utf8'));
        
        // Check if processes are still running
        for (const [name, info] of Object.entries(pids)) {
          try {
            process.kill(info.pid, 0); // Check if process exists
            console.log(`Found existing ${name} process (PID: ${info.pid})`);
          } catch (error) {
            console.log(`Stale PID found for ${name}, cleaning up`);
          }
        }
      }
    } catch (error) {
      console.error('Error loading PIDs:', error.message);
    }
  }
}

// CLI Interface
async function main() {
  const manager = new ProcessManager();
  const command = process.argv[2];

  // Load existing PIDs
  manager.loadPids();

  switch (command) {
    case 'start':
      await manager.startAll();
      break;
    case 'stop':
      await manager.stopAll();
      break;
    case 'restart':
      await manager.stopAll();
      await new Promise(resolve => setTimeout(resolve, 2000));
      await manager.startAll();
      break;
    case 'status':
      manager.status();
      break;
    case 'health':
      await manager.healthCheck();
      break;
    default:
      console.log('PrivacyLens Process Manager');
      console.log('');
      console.log('Usage: node scripts/process-manager.js <command>');
      console.log('');
      console.log('Commands:');
      console.log('  start   - Start all processes');
      console.log('  stop    - Stop all processes');
      console.log('  restart - Restart all processes');
      console.log('  status  - Show process status');
      console.log('  health  - Perform health checks');
      break;
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = ProcessManager; 