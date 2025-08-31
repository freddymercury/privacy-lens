# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

PrivacyLens is a privacy assessment system consisting of a Chrome extension and backend service that analyzes privacy policies using LLM technology to evaluate privacy risk levels (High/Medium/Low/Unknown).

## Architecture

### Backend Service (Node.js/Express)
- **Entry point**: `backend/src/index.js`
- **Database**: Supabase (PostgreSQL)
- **LLM Integration**: llamaindex with OpenAI
- **Module system**: ES modules (`"type": "module"` in package.json)
- **Key services**:
  - `llmService.js`: Privacy policy assessment via LLM
  - `policyFinderService.js`: Locates privacy policies on websites
  - `assessmentTriggerService.js`: Processes unassessed URLs
  - `archiver/`: Deep crawls and archives policy versions with assets

### Chrome Extension
- **Manifest**: v3
- **Background script**: `chrome-plugin/background.js`
- **Local database**: localforage for offline assessments
- **Auto-updates**: Built-in update checking mechanism

## Common Development Commands

### Backend
```bash
cd backend
npm install          # Install dependencies
npm run dev          # Start with nodemon (auto-reload)
npm start            # Production start
npm test             # Run tests
npm test:coverage    # Run tests with coverage
```

### Chrome Extension
```bash
cd chrome-plugin
npm install          # Install dependencies
npm test             # Run tests
npm run build:db     # Build prepackaged assessment database
npm run build        # Full build (includes DB)
```

### Database Setup
1. Create tables: Run SQL scripts in `backend/scripts/` via Supabase SQL Editor:
   - `create-auth-tables.sql`: User authentication tables
   - `create-archive-tables.sql`: Policy archiving tables
   - `create_deep_crawler_tables.sql`: Deep crawler assets tables
   - `create-subscriptions-table.sql`: Subscription management

## Environment Configuration

Backend requires `.env` file in `backend/` directory with:
- `SUPABASE_URL`, `SUPABASE_KEY`: Database connection
- `OPENAI_API_KEY`, `LLM_MODEL`: LLM configuration (e.g., gpt-4o-mini)
- `SESSION_SECRET`: Session security
- `S3_BUCKET`, `ARCHIVE_SCHEDULE`: Archive service config
- `ASSESSMENT_TRIGGER_INTERVAL_MINUTES`: Assessment processing interval
- `MAX_CONCURRENT_ASSESSMENTS`: Concurrent assessment limit (default: 1 to avoid rate limits)

## Key API Endpoints

### Public
- `GET /api/assessment?url=example.com`: Get privacy assessment
- `POST /api/report-unassessed`: Report unassessed URL
- `GET /api/v1/policies/:domain/latest`: Latest policy snapshot with assets
- `GET /api/v1/policies/:domain/versions`: Historical versions list
- `GET /api/v1/policies/:domain/diff/:oldId/:newId`: Version diff

### Admin (requires auth)
- `POST /admin/trigger-assessments`: Process unassessed URLs
- `POST /admin/assessments/:url/trigger`: Trigger specific assessment

## Assessment Process Flow
1. Chrome extension detects website visit
2. Queries backend for assessment via `/api/assessment`
3. If no assessment exists, reports to `/api/report-unassessed`
4. Background service periodically processes unassessed URLs:
   - Locates privacy policy URL
   - Fetches and analyzes content with LLM
   - Stores assessment with risk categories
5. Archive service periodically fetches and stores policy versions

## Privacy Risk Categories
- Data Collection & Use
- Third-Party Sharing & Selling
- Data Storage & Security
- User Rights & Control
- AI & Automated Decision-Making
- Policy Changes & Updates

## Testing Approach
- Backend: Jest with supertest for API testing
- Chrome Extension: Jest with jsdom for DOM testing
- Run tests before committing changes

## Important Notes
- Use ES module imports in backend (include .js extensions)
- Chrome extension uses Manifest V3 (service workers, not background pages)
- Assessment service has rate limiting protection (configurable concurrency)
- Deep crawler can fetch sub-documents and PDFs from policy pages
- Archive service tracks policy changes with unified diff generation