# Quick Copy-Paste Guide for GitHub Secrets

## Open this URL:
https://github.com/freddymercury/privacy-lens/settings/secrets/actions

## Click "New repository secret" and add these:

### Secret 1
**Name:** `SUPABASE_URL`
**Value:**
```
https://saisklaqudigvdwzphlx.supabase.co
```

### Secret 2
**Name:** `SUPABASE_KEY`
**Value:**
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhaXNrbGFxdWRpZ3Zkd3pwaGx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwMDI3NzEsImV4cCI6MjA1OTU3ODc3MX0.5ni4VMP0vbAssVP2rvHoGQpQsGuPvTHrepigKXt5ua0
```

### Secret 3
**Name:** `SUPABASE_SERVICE_KEY`
**Value:**
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhaXNrbGFxdWRpZ3Zkd3pwaGx4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDAwMjc3MSwiZXhwIjoyMDU5NTc4NzcxfQ.m51GuSxn6wlSXeoWbq-2VpnnzLWoEr7t3lIG2WW95s4
```

### Secret 4
**Name:** `S3_BUCKET`
**Value:**
```
privacylens-archive
```

### Secret 4
**Name:** `OPENAI_API_KEY`
**Value:**
```
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
```

### Secret 5
**Name:** `LLM_MODEL`
**Value:**
```
gpt-4
```

## That's it! 
After adding these 5 secrets, go to:
https://github.com/freddymercury/privacy-lens/actions

And click "Run workflow" to test!