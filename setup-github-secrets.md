# Quick Setup: Add GitHub Secrets

## Step 1: Get your values from .env file

Run this to see your current values:
```bash
cd backend
grep -E "^(SUPABASE_URL|SUPABASE_SERVICE_KEY|S3_BUCKET)" .env
```

## Step 2: Add to GitHub

1. Open: https://github.com/freddymercury/privacy-lens/settings/secrets/actions

2. Click "New repository secret" for each:

### Required Secrets:

**SUPABASE_URL**
- Name: `SUPABASE_URL`  
- Value: (copy from your .env file - starts with https://)

**SUPABASE_SERVICE_KEY**
- Name: `SUPABASE_SERVICE_KEY`
- Value: (copy from your .env file - long string starting with eyJ)

### Optional (if using S3):

**S3_BUCKET**
- Name: `S3_BUCKET`
- Value: `privacylens-archive` (or your bucket name)

**AWS_ACCESS_KEY_ID**
- Name: `AWS_ACCESS_KEY_ID`
- Value: (starts with AKIA...)

**AWS_SECRET_ACCESS_KEY**
- Name: `AWS_SECRET_ACCESS_KEY`
- Value: (your secret key)

**AWS_REGION**
- Name: `AWS_REGION`
- Value: `us-east-1` (or your region)

## Step 3: Quick Copy Commands

If you have GitHub CLI installed:
```bash
# Read values from .env and set as GitHub secrets
cd backend

# Extract and set Supabase secrets
gh secret set SUPABASE_URL --body "$(grep ^SUPABASE_URL= .env | cut -d'=' -f2-)"
gh secret set SUPABASE_SERVICE_KEY --body "$(grep ^SUPABASE_SERVICE_KEY= .env | cut -d'=' -f2-)"

# If using S3
gh secret set S3_BUCKET --body "$(grep ^S3_BUCKET= .env | cut -d'=' -f2- || echo 'privacylens-archive')"
```

## Alternative: Manual Copy Helper

Run this to display values to copy:
```bash
cd backend
echo "=== Copy these values to GitHub Secrets ==="
echo ""
echo "SUPABASE_URL:"
grep ^SUPABASE_URL= .env | cut -d'=' -f2-
echo ""
echo "SUPABASE_SERVICE_KEY:"
grep ^SUPABASE_SERVICE_KEY= .env | cut -d'=' -f2- | head -c 50 && echo "..."
echo ""
echo "S3_BUCKET:"
grep ^S3_BUCKET= .env | cut -d'=' -f2- || echo "privacylens-archive"
```