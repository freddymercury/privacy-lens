# GitHub Actions Archiver Setup Guide

## Overview
Run the PrivacyLens archiver job for FREE using GitHub Actions. The job runs every 2 hours and processes all tracked privacy policies.

## Setup Instructions

### 1. Add Secrets to GitHub Repository

Go to your repository → Settings → Secrets and variables → Actions → New repository secret

Add these required secrets:

```yaml
# Database (Required)
SUPABASE_URL: https://your-project.supabase.co
SUPABASE_SERVICE_KEY: eyJhbGc...your-service-key

# Storage (Required if using S3)
S3_BUCKET: privacylens-archive
AWS_ACCESS_KEY_ID: AKIA...
AWS_SECRET_ACCESS_KEY: your-secret-key
AWS_REGION: us-east-1

# Optional notifications
SLACK_WEBHOOK_URL: https://hooks.slack.com/services/...
```

### 2. Enable GitHub Actions

1. Go to repository → Actions tab
2. If prompted, enable Actions for the repository
3. The workflow will appear after you push the `.github/workflows/archiver-job.yml` file

### 3. Test the Workflow

Manual test run:
1. Go to Actions tab
2. Select "Privacy Policy Archiver Job"
3. Click "Run workflow"
4. Optionally enter a specific domain to test
5. Click "Run workflow" button

### 4. Monitor Scheduled Runs

The job will automatically run:
- **Every 2 hours** (at minute 0)
- Times in UTC: 00:00, 02:00, 04:00, 06:00, 08:00, 10:00, 12:00, 14:00, 16:00, 18:00, 20:00, 22:00

## Customization Options

### Change Schedule Frequency

Edit `.github/workflows/archiver-job.yml`:

```yaml
# Every hour
- cron: '0 * * * *'

# Every 4 hours
- cron: '0 */4 * * *'

# Every day at 3 AM UTC
- cron: '0 3 * * *'

# Every Monday at 9 AM UTC
- cron: '0 9 * * 1'

# Twice daily (9 AM and 9 PM UTC)
- cron: '0 9,21 * * *'
```

### Cron Syntax Explained
```
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of the month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of the week (0 - 6) (Sunday to Saturday)
│ │ │ │ │
│ │ │ │ │
* * * * *
```

### Process Specific Domains Only

Create a separate workflow for high-priority domains:

```yaml
# .github/workflows/archive-priority.yml
name: Archive Priority Sites

on:
  schedule:
    - cron: '*/30 * * * *'  # Every 30 minutes
  workflow_dispatch:

jobs:
  archive:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        domain: [google.com, facebook.com, amazon.com]
    steps:
      # ... same steps as main workflow ...
      - name: Run archiver for specific domain
        env:
          SPECIFIC_DOMAIN: ${{ matrix.domain }}
        run: node scripts/run-archiver-once.js
```

### Add Multiple Environments

```yaml
# Use different configs for staging/production
jobs:
  archive-staging:
    environment: staging
    # Uses staging secrets
    
  archive-production:
    environment: production
    # Uses production secrets
```

## Cost Analysis

### GitHub Actions Free Tier
- **2,000 minutes/month** for private repos
- **Unlimited** for public repos
- Each archiver run: ~2-5 minutes
- Monthly usage (every 2 hours): 12 runs/day × 30 days × 3 min = **1,080 minutes**

**Result**: Fits comfortably in free tier!

### Optimization Tips

1. **Cache dependencies** (already included):
```yaml
- uses: actions/setup-node@v4
  with:
    cache: 'npm'
```

2. **Limit concurrent runs**:
```yaml
concurrency:
  group: archiver
  cancel-in-progress: false
```

3. **Use matrix for parallel processing**:
```yaml
strategy:
  matrix:
    batch: [1, 2, 3, 4]  # Split domains into batches
```

## Monitoring & Debugging

### View Logs
1. Go to Actions tab
2. Click on a workflow run
3. Click on the job name
4. Expand any step to see detailed logs

### Email Notifications
GitHub automatically emails on workflow failure (configurable in GitHub settings)

### Slack Notifications
Add `SLACK_WEBHOOK_URL` secret for Slack alerts on failure

### Download Artifacts
Failed runs save logs as artifacts (kept for 7 days)

## Local Testing

Test the archiver script locally:

```bash
cd backend

# Test with specific domain
SPECIFIC_DOMAIN=example.com node scripts/run-archiver-once.js

# Dry run (no actual changes)
DRY_RUN=true node scripts/run-archiver-once.js

# With custom environment
env $(cat .env | xargs) node scripts/run-archiver-once.js
```

## Troubleshooting

### Common Issues

1. **"Missing required environment variables"**
   - Ensure all secrets are added in GitHub Settings
   - Check secret names match exactly (case-sensitive)

2. **"JavaScript heap out of memory"**
   - The workflow already sets `NODE_OPTIONS: '--max-old-space-size=4096'`
   - GitHub Actions runners have 7GB RAM available

3. **"Rate limit exceeded"**
   - Add delays between domains in the script
   - Reduce frequency or batch size

4. **"Workflow not triggering"**
   - Check Actions are enabled for the repository
   - Verify cron syntax at crontab.guru
   - GitHub Actions uses UTC timezone

### Debug Mode

Add debug output:

```yaml
- name: Run archiver job (debug)
  env:
    DEBUG: '*'
    NODE_ENV: development
  run: |
    echo "Environment variables:"
    env | grep -E '^(SUPABASE|AWS|S3)' | sed 's/=.*/=***/'
    node scripts/run-archiver-once.js
```

## Security Best Practices

1. **Use environments** for production secrets
2. **Limit secret access** to specific workflows
3. **Rotate keys regularly** (every 90 days)
4. **Use least privilege** AWS IAM policies
5. **Never log secrets** in workflow outputs

## Alternative Schedules

### Assessment Trigger Job
Create another workflow for processing unassessed URLs:

```yaml
# .github/workflows/assessment-trigger.yml
name: Process Unassessed URLs

on:
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours
    
jobs:
  assess:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci --production
      - run: node scripts/run-assessment-trigger.js
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

## Success Metrics

Monitor these in GitHub Insights → Actions:
- Success rate (should be >95%)
- Average runtime (should be <5 minutes)
- Queue time (should be <1 minute)
- Monthly minute usage (should be <2000)