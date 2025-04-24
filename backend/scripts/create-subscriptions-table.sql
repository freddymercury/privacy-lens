-- Script to create the subscriptions table and related tables

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stripe_subscription_id VARCHAR(255) NOT NULL UNIQUE,
    plan_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    current_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);

-- Updates table
CREATE TABLE IF NOT EXISTS updates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    version VARCHAR(50) NOT NULL,
    update_type VARCHAR(50) NOT NULL,
    download_url VARCHAR(255) NOT NULL,
    changelog TEXT,
    update_data JSONB,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Update applications table
CREATE TABLE IF NOT EXISTS update_applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    update_id UUID NOT NULL REFERENCES updates(id),
    user_id UUID NOT NULL REFERENCES users(id),
    device_id VARCHAR(255) NOT NULL,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(50) NOT NULL,
    error_message TEXT
);

-- Create indexes for update applications
CREATE INDEX IF NOT EXISTS idx_update_applications_user_id ON update_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_update_applications_update_id ON update_applications(update_id);

-- User tokens table (if not already exists)
CREATE TABLE IF NOT EXISTS user_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    device_id VARCHAR(255),
    device_name VARCHAR(255),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for user tokens
CREATE INDEX IF NOT EXISTS idx_user_tokens_user_id ON user_tokens(user_id);
