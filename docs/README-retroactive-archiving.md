# Retroactive Archiving Script

This document explains how to use the retroactive archiving script to add existing websites from the `websites` table to the archiving queue.

## Background

The Privacy Lens system has an archiving feature that periodically crawls and archives privacy policies. When new websites are assessed, they are automatically added to the archiving queue. However, websites that were assessed before the archiving feature was implemented need to be retroactively added to the queue.

This script queries the `websites` table for all existing sites and adds them to the `policies` table, which is the queue for the archiver job.

## How It Works

The script:

1. Queries the `websites` table to get all existing sites
2. For each site with a valid `user_agreement_url`, adds an entry to the `policies` table using the `addPolicyForArchiving` function
3. Logs statistics about the process

## Usage

To run the script:

```bash
cd backend
node scripts/retroactively-archive-existing-sites.js
```

## Expected Output

The script will output logs showing its progress:

```
[RetroactiveArchive] Starting retroactive archiving of existing sites...
[RetroactiveArchive] Found 100 websites to process
[RetroactiveArchive] Progress: 10/100 (10%)
[RetroactiveArchive] Progress: 20/100 (20%)
...
[RetroactiveArchive] Completed retroactive archiving
[RetroactiveArchive] Total: 100
[RetroactiveArchive] Processed: 100
[RetroactiveArchive] Success: 95
[RetroactiveArchive] Skipped: 3
[RetroactiveArchive] Failed: 2
[RetroactiveArchive] Script execution completed
```

## What Happens Next

After running this script, the regular archiver job will pick up the newly added entries from the `policies` table and archive them according to its schedule (typically hourly).

You can check the `policies` table to verify that the entries were added correctly.

## Troubleshooting

If the script fails with an error related to database connections, make sure that:

1. The database connection is properly configured in the `.env` file
2. The Supabase service role client is properly initialized

If specific entries fail to be added, check the error logs for details. Common issues include:

- Invalid URLs
- Database constraints (e.g., unique constraints)
- Permission issues

## Running the Script Multiple Times

The script is idempotent and can be run multiple times without creating duplicate entries. The `addPolicyForArchiving` function uses an upsert operation that will update existing entries if they already exist.
