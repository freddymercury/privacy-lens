-- SQL script to create the core application tables (websites, unassessed_urls)
-- These are used by the assessment pipeline and archiver. The `websites` table
-- was originally created manually in the Supabase dashboard; this script makes
-- fresh-environment setup reproducible. Reconciled 2026-07-28 against the code.

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Websites table: stores assessed domains and their privacy assessments
CREATE TABLE IF NOT EXISTS websites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    url TEXT NOT NULL UNIQUE,               -- Canonical domain (e.g., example.com)
    user_agreement_url TEXT,                -- Discovered/confirmed policy URL
    user_agreement_hash TEXT,               -- Hash of the policy text at assessment time
    suggested_policy_url TEXT,              -- Best candidate policy URL (from discovery)
    privacy_assessment JSONB,               -- LLM assessment result (riskLevel, categories, summary)
    manual_entry BOOLEAN DEFAULT FALSE,
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE websites IS 'Assessed domains and their privacy assessments; the archiver scans rows with a known policy URL.';

-- Unassessed URLs table: discovery queue for sites reported by the plugin
CREATE TABLE IF NOT EXISTS unassessed_urls (
    url TEXT PRIMARY KEY,
    first_recorded TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'pending',
    suggested_policy_urls JSONB DEFAULT '[]'::jsonb
);
COMMENT ON TABLE unassessed_urls IS 'Domains reported by the Chrome plugin awaiting policy discovery and assessment.';
