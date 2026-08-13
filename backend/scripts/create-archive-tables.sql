-- SQL script to create tables and functions for the PrivacyLens Policy Archiver

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Policies table: Stores information about the policies being tracked
CREATE TABLE IF NOT EXISTS policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    domain_name TEXT NOT NULL,
    policy_type TEXT NOT NULL, -- e.g., 'privacy', 'tos', 'api_terms'
    url TEXT NOT NULL,         -- The specific URL of the policy document
    is_active BOOLEAN DEFAULT TRUE,  -- Whether the archiver should track this policy
    last_updated TIMESTAMPTZ,   -- Last time the policy entry was (re)confirmed
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_policy UNIQUE (domain_name, policy_type)
);
COMMENT ON TABLE policies IS 'Stores information about the specific policy URLs being tracked for each domain.';
COMMENT ON COLUMN policies.domain_name IS 'Canonical domain name (e.g., example.com).';
COMMENT ON COLUMN policies.policy_type IS 'Type of policy being tracked (e.g., privacy, tos).';
COMMENT ON COLUMN policies.url IS 'The exact URL where the policy text is located.';

-- Policy Versions table: Stores each fetched version of a policy
CREATE TABLE IF NOT EXISTS policy_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
    version_number INT NOT NULL,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    normalized_text_snapshot TEXT, -- Store the cleaned text directly for diffing
    text_hash TEXT NOT NULL,       -- SHA-256 hash of the normalized_text_snapshot
    raw_snapshot_path TEXT,        -- Path to the raw HTML snapshot in storage (e.g., S3/Supabase Storage)
    clean_snapshot_path TEXT,      -- Path to the normalized text snapshot in storage
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_version_per_policy UNIQUE (policy_id, version_number)
);
CREATE INDEX IF NOT EXISTS idx_policy_versions_policy_id ON policy_versions(policy_id);
CREATE INDEX IF NOT EXISTS idx_policy_versions_fetched_at ON policy_versions(fetched_at DESC);
COMMENT ON TABLE policy_versions IS 'Stores historical versions of tracked policies, including text snapshots and metadata.';
COMMENT ON COLUMN policy_versions.policy_id IS 'Foreign key referencing the specific policy being versioned.';
COMMENT ON COLUMN policy_versions.version_number IS 'Monotonically increasing version number for a given policy.';
COMMENT ON COLUMN policy_versions.normalized_text_snapshot IS 'The cleaned, normalized text content of the policy version.';
COMMENT ON COLUMN policy_versions.text_hash IS 'SHA-256 hash of the normalized text, used for change detection.';
COMMENT ON COLUMN policy_versions.raw_snapshot_path IS 'Storage path for the original raw HTML file.';
COMMENT ON COLUMN policy_versions.clean_snapshot_path IS 'Storage path for the normalized text file.';

-- Policy Diffs table: Stores the summary of changes between versions
CREATE TABLE IF NOT EXISTS policy_diffs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    policy_version_id_old UUID NOT NULL REFERENCES policy_versions(id) ON DELETE CASCADE,
    policy_version_id_new UUID NOT NULL REFERENCES policy_versions(id) ON DELETE CASCADE,
    diff_summary_text TEXT, -- A textual summary of the differences
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_diff UNIQUE (policy_version_id_old, policy_version_id_new)
);
CREATE INDEX IF NOT EXISTS idx_policy_diffs_new_version_id ON policy_diffs(policy_version_id_new);
COMMENT ON TABLE policy_diffs IS 'Stores the calculated differences between consecutive policy versions.';
COMMENT ON COLUMN policy_diffs.policy_version_id_old IS 'The previous version used in the comparison.';
COMMENT ON COLUMN policy_diffs.policy_version_id_new IS 'The new version used in the comparison.';
COMMENT ON COLUMN policy_diffs.diff_summary_text IS 'A textual representation of the changes (e.g., using diff library).';

-- Scan Events table: Logs each attempt to scan/fetch a policy
CREATE TABLE IF NOT EXISTS scan_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
    scanned_at TIMESTAMPTZ DEFAULT NOW(),
    outcome TEXT NOT NULL, -- 'changed', 'no_change', 'error'
    error_message TEXT,    -- Details if the outcome was 'error'
    duration_ms INT        -- How long the scan took in milliseconds
);
CREATE INDEX IF NOT EXISTS idx_scan_events_policy_id ON scan_events(policy_id);
CREATE INDEX IF NOT EXISTS idx_scan_events_scanned_at ON scan_events(scanned_at DESC);
COMMENT ON TABLE scan_events IS 'Audit log of policy scanning attempts and their outcomes.';
COMMENT ON COLUMN scan_events.outcome IS 'Result of the scan: changed, no_change, or error.';
COMMENT ON COLUMN scan_events.error_message IS 'Error details if the scan failed.';
COMMENT ON COLUMN scan_events.duration_ms IS 'Time taken for the fetch and versioning process.';

-- Function to get the latest policy version for a domain and type
CREATE OR REPLACE FUNCTION get_latest_policy(p_domain TEXT, p_policy_type TEXT)
RETURNS TABLE (
    policy_id UUID,
    domain_name TEXT,
    policy_type TEXT,
    url TEXT,
    version_id UUID,
    version_number INT,
    fetched_at TIMESTAMPTZ,
    normalized_text_snapshot TEXT,
    text_hash TEXT,
    raw_snapshot_path TEXT,
    clean_snapshot_path TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id AS policy_id,
        p.domain_name,
        p.policy_type,
        p.url,
        pv.id AS version_id,
        pv.version_number,
        pv.fetched_at,
        pv.normalized_text_snapshot,
        pv.text_hash,
        pv.raw_snapshot_path,
        pv.clean_snapshot_path
    FROM policies p
    JOIN policy_versions pv ON p.id = pv.policy_id
    WHERE p.domain_name = p_domain AND p.policy_type = p_policy_type
    ORDER BY pv.version_number DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION get_latest_policy(TEXT, TEXT) IS 'Retrieves the most recent version details for a specific policy.';

-- Function to list all policy versions for a domain and type
CREATE OR REPLACE FUNCTION list_policy_versions(p_domain TEXT, p_policy_type TEXT)
RETURNS TABLE (
    version_id UUID,
    version_number INT,
    fetched_at TIMESTAMPTZ,
    text_hash TEXT,
    raw_snapshot_path TEXT,
    clean_snapshot_path TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        pv.id AS version_id,
        pv.version_number,
        pv.fetched_at,
        pv.text_hash,
        pv.raw_snapshot_path,
        pv.clean_snapshot_path
    FROM policies p
    JOIN policy_versions pv ON p.id = pv.policy_id
    WHERE p.domain_name = p_domain AND p.policy_type = p_policy_type
    ORDER BY pv.version_number DESC;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION list_policy_versions(TEXT, TEXT) IS 'Lists metadata for all historical versions of a specific policy.';

-- Function to get a specific version and its diff from the previous version
CREATE OR REPLACE FUNCTION get_version_with_diff(p_version_id UUID)
RETURNS TABLE (
    version_id UUID,
    policy_id UUID,
    version_number INT,
    fetched_at TIMESTAMPTZ,
    normalized_text_snapshot TEXT,
    text_hash TEXT,
    raw_snapshot_path TEXT,
    clean_snapshot_path TEXT,
    diff_summary_text TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        pv.id AS version_id,
        pv.policy_id,
        pv.version_number,
        pv.fetched_at,
        pv.normalized_text_snapshot,
        pv.text_hash,
        pv.raw_snapshot_path,
        pv.clean_snapshot_path,
        pd.diff_summary_text
    FROM policy_versions pv
    LEFT JOIN policy_diffs pd ON pv.id = pd.policy_version_id_new
    WHERE pv.id = p_version_id;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION get_version_with_diff(UUID) IS 'Retrieves details for a specific policy version, including the diff summary from the previous version.';

-- Add initial policy for testing (optional)
-- INSERT INTO policies (domain_name, policy_type, url)
-- VALUES ('example.com', 'privacy', 'https://example.com/privacy')
-- ON CONFLICT (domain_name, policy_type) DO NOTHING;

-- INSERT INTO policies (domain_name, policy_type, url)
-- VALUES ('example.com', 'tos', 'https://example.com/terms')
-- ON CONFLICT (domain_name, policy_type) DO NOTHING;

-- Add trigger to update 'updated_at' timestamp on policies table
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_policies_timestamp
BEFORE UPDATE ON policies
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

-- Add trigger to update 'updated_at' timestamp on policy_versions table (though less likely to be updated)
-- CREATE TRIGGER set_policy_versions_timestamp
-- BEFORE UPDATE ON policy_versions
-- FOR EACH ROW
-- EXECUTE FUNCTION trigger_set_timestamp();

-- Note: Consider adding RLS policies if needed for multi-tenant security later.

-- End of script
