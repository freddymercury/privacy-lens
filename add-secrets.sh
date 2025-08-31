#!/bin/bash

# Script to add GitHub secrets using GitHub CLI
# Install gh first: brew install gh (Mac) or see https://cli.github.com/

echo "This script will add secrets to your GitHub repository"
echo "Make sure you're logged in to GitHub CLI (gh auth login)"
echo ""

# Check if gh is installed
if ! command -v gh &> /dev/null; then
    echo "GitHub CLI (gh) is not installed."
    echo "Install it with: brew install gh"
    echo "Then run: gh auth login"
    exit 1
fi

# Add secrets from .env file
echo "Adding SUPABASE_URL..."
gh secret set SUPABASE_URL --body "https://saisklaqudigvdwzphlx.supabase.co"

echo "Adding SUPABASE_SERVICE_KEY..."
gh secret set SUPABASE_SERVICE_KEY --body "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhaXNrbGFxdWRpZ3Zkd3pwaGx4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDAwMjc3MSwiZXhwIjoyMDU5NTc4NzcxfQ.m51GuSxn6wlSXeoWbq-2VpnnzLWoEr7t3lIG2WW95s4"

echo "Adding S3_BUCKET..."
gh secret set S3_BUCKET --body "privacylens-archive"

echo "Adding OPENAI_API_KEY..."
gh secret set OPENAI_API_KEY --body "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"

echo "Adding LLM_MODEL..."
gh secret set LLM_MODEL --body "gpt-4"

echo ""
echo "✅ Secrets added successfully!"
echo ""
echo "You can verify at: https://github.com/freddymercury/privacy-lens/settings/secrets/actions"