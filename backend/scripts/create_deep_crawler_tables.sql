-- Table to store individual assets (sub-documents) for each policy version
CREATE TABLE IF NOT EXISTS policy_assets (
  id                BIGSERIAL PRIMARY KEY,
  policy_version_id UUID REFERENCES policy_versions(id) ON DELETE CASCADE, -- Foreign key to the main policy version
  asset_url         TEXT NOT NULL,    -- The URL of the crawled asset
  depth             INT NOT NULL,     -- Crawl depth (0 for root, 1 for first-level links, etc.)
  mime_type         TEXT,             -- MIME type of the asset (e.g., 'text/html', 'application/pdf')
  bytes             INT,              -- Size of the asset in bytes
  asset_hash        TEXT,             -- SHA-256 hash of the asset's clean text or raw content
  storage_path      TEXT NOT NULL,    -- Path in object storage where this specific asset is stored
  changed           BOOLEAN DEFAULT false, -- True if this asset is new or changed compared to the previous version
  fetched_at        TIMESTAMPTZ DEFAULT now() -- Timestamp when the asset was fetched
);

-- Index to efficiently query assets by their policy version
CREATE INDEX IF NOT EXISTS idx_policy_assets_policy_version_id ON policy_assets(policy_version_id);
CREATE INDEX IF NOT EXISTS idx_policy_assets_asset_url ON policy_assets(asset_url); -- May be useful for lookups
CREATE INDEX IF NOT EXISTS idx_policy_assets_asset_hash ON policy_assets(asset_hash); -- For checking existing assets

-- Table to manage and track the progress of backfilling deep crawl data for existing domains
CREATE TABLE IF NOT EXISTS backfill_tasks (
  domain        TEXT PRIMARY KEY, -- The normalized domain name being backfilled
  status        TEXT NOT NULL DEFAULT 'queued', -- Status of the backfill (e.g., 'queued', 'in_progress', 'completed', 'failed')
  started_at    TIMESTAMPTZ,      -- Timestamp when the backfill for this domain started
  finished_at   TIMESTAMPTZ,      -- Timestamp when the backfill for this domain finished
  note          TEXT              -- Any notes or error messages related to the backfill for this domain
);

-- Index for querying backfill tasks by status
CREATE INDEX IF NOT EXISTS idx_backfill_tasks_status ON backfill_tasks(status);

COMMENT ON TABLE policy_assets IS 'Stores individual sub-documents (assets) discovered by the deep crawler for each policy version. Each row represents a unique page/document that forms part of a comprehensive policy snapshot.';
COMMENT ON COLUMN policy_assets.policy_version_id IS 'Links this asset to a specific version in the policy_versions table.';
COMMENT ON COLUMN policy_assets.asset_url IS 'The direct URL from which this asset was fetched.';
COMMENT ON COLUMN policy_assets.depth IS 'The crawl depth at which this asset was found relative to the root policy URL (0 for root).';
COMMENT ON COLUMN policy_assets.mime_type IS 'The detected MIME type of the fetched asset.';
COMMENT ON COLUMN policy_assets.bytes IS 'The size of the fetched asset content in bytes.';
COMMENT ON COLUMN policy_assets.asset_hash IS 'A hash (e.g., SHA-256) of the asset''s content, used for change detection and deduplication.';
COMMENT ON COLUMN policy_assets.storage_path IS 'The path within the designated storage bucket where the raw content of this specific asset is stored.';
COMMENT ON COLUMN policy_assets.changed IS 'Indicates if this asset''s content is new or has changed compared to its counterpart in the previous policy version.';
COMMENT ON COLUMN policy_assets.fetched_at IS 'The timestamp indicating when this specific asset was fetched.';

COMMENT ON TABLE backfill_tasks IS 'Tracks the status of deep crawling backfill operations for domains that were archived before the deep crawling feature was implemented.';
COMMENT ON COLUMN backfill_tasks.domain IS 'The normalized domain name undergoing the backfill process.';
COMMENT ON COLUMN backfill_tasks.status IS 'Current processing status of the backfill for this domain (e.g., queued, in_progress, completed, failed).';
COMMENT ON COLUMN backfill_tasks.started_at IS 'Timestamp marking the beginning of the backfill attempt for this domain.';
COMMENT ON COLUMN backfill_tasks.finished_at IS 'Timestamp marking the completion or failure of the backfill attempt for this domain.';
COMMENT ON COLUMN backfill_tasks.note IS 'Optional field for storing additional information or error messages related to the backfill task for this domain.';

-- Pseudo-SQL for enqueueing domains for backfill (from spec, for reference)
-- INSERT INTO backfill_tasks(domain, status)
-- SELECT d.domain_name,'queued' -- Assuming domains table has domain_name
-- FROM domains d
-- LEFT JOIN backfill_tasks b ON d.domain_name = b.domain -- Or USING(domain) if column names match
-- WHERE b.domain IS NULL;
