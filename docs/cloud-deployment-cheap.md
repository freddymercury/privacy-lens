# Cheap Cloud Deployment Options for PrivacyLens Backend

## Overview
The backend needs: Node.js runtime, 3GB+ RAM (for diff processing), scheduled jobs, and Supabase/S3 connectivity.

## 🏆 Cheapest Options Ranked

### 1. **Railway.app** ($5-10/month) ⭐ RECOMMENDED
```yaml
# railway.toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "npm start"
healthcheckPath = "/api/health"
restartPolicyType = "always"

[environments.production]
NODE_OPTIONS = "--max-old-space-size=3072"
```
- **Pros**: $5 credit/month free, then ~$5-10/month
- **Setup**: Connect GitHub, auto-deploys on push
- **Memory**: 8GB available on hobby plan
- **Cron**: Built-in cron support

### 2. **Fly.io** (Free tier, then ~$5/month)
```toml
# fly.toml
app = "privacylens-backend"
primary_region = "sjc"

[build]
  builder = "heroku/buildpacks:20"

[env]
  PORT = "3000"
  NODE_OPTIONS = "--max-old-space-size=3072"

[[services]]
  http_checks = []
  internal_port = 3000
  protocol = "tcp"
  
[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 512  # Use swap for occasional 3GB needs
  
[processes]
  web = "npm start"
  worker = "node src/jobs/archiverJob.js"
```
- **Free**: 3 shared VMs, 3GB total RAM
- **Trick**: Use swap memory for diff processing
- **Deploy**: `fly launch` then `fly deploy`

### 3. **Render.com** (Free tier, then $7/month)
```yaml
# render.yaml
services:
  - type: web
    name: privacylens-api
    env: node
    region: oregon
    plan: free  # 512MB RAM, use starter ($7) for 2GB
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: NODE_OPTIONS
        value: --max-old-space-size=3072
    
  - type: cron
    name: privacylens-archiver
    env: node
    region: oregon
    plan: free
    schedule: "0 */2 * * *"
    buildCommand: npm install
    startCommand: node src/jobs/archiverJob.js
```
- **Free tier**: 750 hours/month (enough for 1 service)
- **Cron jobs**: Separate from main app

### 4. **Google Cloud Run** (Pay per use, ~$2-5/month)
```dockerfile
# Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
ENV NODE_OPTIONS="--max-old-space-size=3072"
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
# Deploy script
gcloud run deploy privacylens-backend \
  --source . \
  --memory 4Gi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 2 \
  --allow-unauthenticated \
  --region us-central1
```
- **Cost**: $0.00003/vCPU-second + $0.0000025/GiB-second
- **Free tier**: 2M requests, 360k vCPU-seconds, 180k GiB-seconds
- **Scale to zero**: No charges when idle

### 5. **Oracle Cloud Free Tier** (Forever Free!)
```bash
# Setup on Oracle Cloud ARM instance (Forever free)
# 4 OCPU, 24GB RAM - massive overkill but FREE

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2
npm install -g pm2

# ecosystem.config.js for PM2
module.exports = {
  apps: [{
    name: 'privacylens-backend',
    script: 'src/index.js',
    instances: 1,
    exec_mode: 'cluster',
    node_args: '--max-old-space-size=3072',
    cron_restart: '0 */2 * * *',
    env: {
      NODE_ENV: 'production'
    }
  }]
};

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 6. **Coolify** (Self-hosted on $5 VPS)
Deploy to any $5/month VPS (Hetzner, DigitalOcean, Vultr):
```bash
# Install Coolify (one-liner)
curl -fsSL https://get.coolify.io | bash

# Then use web UI to:
# 1. Connect GitHub repo
# 2. Set environment variables
# 3. Auto-deploy on push
```

## 🎯 Optimization Tips for Cheap Hosting

### 1. **Separate Archiver Job**
Run the memory-intensive archiver as a separate scheduled task:
```javascript
// archiver-standalone.js
import { startArchiverJob } from './src/jobs/archiverJob.js';

// Run once and exit
startArchiverJob().then(() => {
  console.log('Archiver job complete');
  process.exit(0);
});
```

Use GitHub Actions for FREE scheduled runs:
```yaml
# .github/workflows/archiver.yml
name: Run Archiver Job
on:
  schedule:
    - cron: '0 */2 * * *'  # Every 2 hours
  workflow_dispatch:  # Manual trigger

jobs:
  archive:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - run: npm ci
      - run: node --max-old-space-size=3072 archiver-standalone.js
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
          S3_BUCKET: ${{ secrets.S3_BUCKET }}
```

### 2. **Use Serverless for Heavy Processing**
```javascript
// netlify/functions/process-diff.js
export async function handler(event) {
  const { oldText, newText } = JSON.parse(event.body);
  
  // Process diff in serverless function (10s timeout on free tier)
  const diff = await generateDiff(oldText, newText);
  
  return {
    statusCode: 200,
    body: JSON.stringify({ diff })
  };
}
```

### 3. **Database-Only Processing**
Use Supabase Edge Functions (Deno):
```typescript
// supabase/functions/process-diff/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { create } from "https://deno.land/x/diff@v0.3.0/mod.ts"

serve(async (req) => {
  const { oldText, newText } = await req.json()
  
  // Process in Supabase's infrastructure
  const diff = create(oldText, newText)
  
  return new Response(JSON.stringify({ diff }), {
    headers: { "Content-Type": "application/json" },
  })
})
```

## 💰 Cost Comparison Table

| Provider | Free Tier | Paid (Min) | RAM | Cron Jobs | Auto-Deploy |
|----------|-----------|------------|-----|-----------|-------------|
| Railway | $5 credit | $5/mo | 8GB | ✅ | ✅ |
| Fly.io | 3 VMs | $5/mo | 3GB | ✅ | ✅ |
| Render | 750 hrs | $7/mo | 2GB | ✅ | ✅ |
| GCP Run | 2M reqs | ~$2-5/mo | 4GB | ❌* | ✅ |
| Oracle | Forever | $0 | 24GB | ✅ | ❌ |
| Coolify | - | $5 VPS | Varies | ✅ | ✅ |

*Use Cloud Scheduler ($0.10/month per job)

## 🚀 Quick Start Commands

### Railway (Easiest)
```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

### Fly.io
```bash
curl -L https://fly.io/install.sh | sh
fly auth login
fly launch
fly deploy
```

### Render
```bash
# Just push to GitHub and connect via web UI
# render.com -> New -> Web Service -> Connect GitHub
```

## 📝 Environment Variables Template
```env
# Copy to all cloud providers
NODE_ENV=production
PORT=3000
SESSION_SECRET=your-secret-here
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=xxx
OPENAI_API_KEY=sk-xxx
LLM_MODEL=gpt-4o-mini
S3_BUCKET=privacylens-archive
ARCHIVE_SCHEDULE=0 */2 * * *
ASSESSMENT_TRIGGER_INTERVAL_MINUTES=600
MAX_CONCURRENT_ASSESSMENTS=1
NODE_OPTIONS=--max-old-space-size=3072
```

## 🏃‍♂️ Migration Script
```bash
#!/bin/bash
# migrate-to-cloud.sh

# 1. Export current DB if needed
pg_dump $OLD_DATABASE_URL > backup.sql

# 2. Set up new environment
git remote add railway https://your-app.up.railway.app
git push railway main

# 3. Run migrations
railway run npm run setup-auth-tables

# 4. Test
curl https://your-app.up.railway.app/api/health
```

## Recommendation

**For your use case**: Start with **Railway.app** or **Fly.io**:
- Both handle the 3GB memory requirement
- Both have generous free tiers
- Both support scheduled jobs
- Total cost: $0-10/month

**For production**: Use **Google Cloud Run** + **Cloud Scheduler**:
- Scales to zero (no cost when idle)
- Pay only for actual processing time
- Handles traffic spikes automatically
- Total cost: $2-20/month depending on usage