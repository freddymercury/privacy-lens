-- Add notes column to scan_events table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'scan_events'
        AND column_name = 'notes'
    ) THEN
        ALTER TABLE scan_events ADD COLUMN notes TEXT;
        RAISE NOTICE 'Added notes column to scan_events table';
    ELSE
        RAISE NOTICE 'notes column already exists in scan_events table';
    END IF;
END $$;
