# PrivacyLens Backend + Admin Dashboard

Backend service and admin dashboard for the PrivacyLens Chrome plugin. This service assesses privacy risks of user agreements for popular websites.

## Features

- RESTful API for the Chrome plugin to query privacy assessments
- Admin dashboard for managing assessments and unassessed URLs
- Integration with LLM (via llamaindex) for automated privacy policy assessment
- Supabase database for storing assessments, user data, and audit logs

## Architecture

The application is built with:

- **Node.js** - Server runtime
- **Express** - Web framework
- **llamaindex** - LLM integration for privacy assessment
- **Supabase** - Database and authentication
- **EJS** - Templating engine for admin dashboard

## Prerequisites

- Node.js v20.x or newer
- npm
- Supabase account
- OpenAI API key (or other LLM provider supported by llamaindex)

## Installation

1. Clone the repository
2. Install dependencies:

```bash
cd privacy-guard/backend
npm install
```

3. Create a `.env` file based on `.env.example`:

```bash
cp src/.env.example .env
```

Note: Make sure to create the `.env` file in the `backend` directory, not in the `src` directory. The application looks for the `.env` file in the root directory of the project.

4. Update the `.env` file with your credentials:

   - Set `SESSION_SECRET` to a secure random string
   - Set `SUPABASE_URL` and `SUPABASE_KEY` to your Supabase project credentials
   - Set `OPENAI_API_KEY` to your OpenAI API key
   - Set `LLM_MODEL` to model of your choice - tested using `gpt-4o-mini`

5. Set up Supabase:

   a. Create a Supabase account:

   - Go to [https://supabase.com/](https://supabase.com/) and sign up for an account if you don't have one
   - Log in to your Supabase account

   b. Create a new project:

   - Click "New Project" in the Supabase dashboard
   - Choose an organization or create a new one
   - Enter a name for your project
   - Set a secure database password (save this for future reference)
   - Choose a region closest to your users
   - Click "Create new project"

   c. Get your project credentials:

   - Once your project is created, go to the project dashboard
   - Click on the "Settings" icon (gear icon) in the left sidebar
   - Select "API" from the settings menu
   - Under "Project API keys", you'll find:
     - Project URL: Copy this to your `.env` file as `SUPABASE_URL`
     - anon/public key: Copy this to your `.env` file as `SUPABASE_KEY`

   d. Set up database tables:

   - In your Supabase project dashboard, click on the "SQL Editor" in the left sidebar
   - Click "New Query" to create a new SQL query
   - Paste the following SQL commands and click "Run" to create the necessary tables:

```sql
-- Websites table
CREATE TABLE websites (
  url TEXT PRIMARY KEY,
  user_agreement_url TEXT,
  user_agreement_hash TEXT,
  privacy_assessment JSONB,
  last_updated TIMESTAMP WITH TIME ZONE,
  manual_entry BOOLEAN DEFAULT FALSE
);

-- Unassessed URLs queue
CREATE TABLE unassessed_urls (
  url TEXT PRIMARY KEY,
  first_recorded TIMESTAMP WITH TIME ZONE,
  status TEXT
);

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) NOT NULL UNIQUE,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE
);

-- Audit logs table
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action TEXT NOT NULL,
  user_id UUID REFERENCES users(id),
  timestamp TIMESTAMP WITH TIME ZONE,
  details JSONB
);
```

6. Create an initial admin user:

   - Create another new SQL query in the Supabase SQL Editor
   - Paste the following SQL command and click "Run" to create an admin user:
   - Note: This creates a user with username 'admin' and password 'password123' - be sure to change this in production!

```sql
INSERT INTO users (email, username, password_hash, name, role, created_at)
VALUES (
  'admin@example.com',
  'admin',
  -- This is a bcrypt hash for 'password123' - change this in production!
  '$2b$10$qQmRM4InLDXT0sTPPPyWfu6EHxe8t1.ZCWwrrAES41pjspVZdCezK',
  'Admin User',
  'admin',
  NOW()
);
```

## Running the Application

### Development Mode

```bash
npm run dev
```

This will start the server with nodemon for automatic reloading.

### Production Mode

```bash
npm start
```

The server will run on port 3000 by default (configurable in `.env`).

### Assessment Trigger Service

The assessment trigger service starts automatically when the application is launched. By default, it runs every 600 minutes (10 hours) to process unassessed URLs in the queue.

You can configure the service using the following environment variables in your `.env` file:

```
# Assessment trigger interval in minutes (default: 600)
ASSESSMENT_TRIGGER_INTERVAL_MINUTES=600

# Maximum number of concurrent URL assessments (default: 1)
MAX_CONCURRENT_ASSESSMENTS=1
```

The `MAX_CONCURRENT_ASSESSMENTS` setting controls how many URL assessments can run simultaneously, which helps prevent rate limiting issues with external APIs. The default value is 1 to avoid rate limits, but you can adjust this based on your API rate limits and system resources.

#### Rate Limiting Considerations

The system uses OpenAI's API for assessing privacy policies, which has rate limits. To avoid hitting these limits:

1. The default concurrency is set to 1 assessment at a time
2. There's a tracking mechanism to prevent duplicate processing of the same URL
3. The system adds delays between processing chunks of large privacy policies
4. Exponential backoff is implemented for retry attempts when rate limits are hit

If you're still experiencing rate limit issues, consider:
- Reducing the batch size of URLs processed at once
- Increasing the delay between chunk processing (currently 10 seconds)
- Using a different API key with higher rate limits

#### Manual Triggering

You can also manually trigger the assessment process through:

##### API Endpoint

```bash
# Trigger processing of all pending unassessed URLs
curl -X POST http://localhost:3000/admin/trigger-assessments \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE"
```

##### Admin Dashboard

Navigate to the "Unassessed URLs" section in the admin dashboard and click the "Process All" button to manually trigger the assessment process.

### Testing the Assessment Trigger Service

#### Manual Testing

1. **Add Test URLs to Queue**:

```bash
# Add a test URL to the unassessed queue
curl -X POST http://localhost:3000/api/report-unassessed \
  -H "Content-Type: application/json" \
  -d '{"url": "example.com"}'
```

2. **Trigger Processing**:

```bash
# Trigger processing of all pending unassessed URLs
curl -X POST http://localhost:3000/admin/trigger-assessments \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE"
```

3. **Check Results**:

```bash
# Check the status of the unassessed URL
curl -X GET http://localhost:3000/api/admin/unassessed \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE"

# Check if an assessment was created
curl -X GET "http://localhost:3000/api/assessment?url=example.com"
```

#### Testing Different Scenarios

1. **Valid Agreement Found**:

   - Add a URL with a known privacy policy (e.g., `github.com`)
   - Trigger processing
   - Verify the URL is removed from the unassessed queue and an assessment is created

2. **No Agreement Found**:

   - Add a URL unlikely to have a standard privacy policy path
   - Trigger processing
   - Verify the URL remains in the queue with status "Not Found"

3. **Network Error**:

   - Add a non-existent domain
   - Trigger processing
   - Verify the URL remains in the queue with status "Failed"

4. **Manual Override**:
   - For URLs where automatic detection fails, use the admin dashboard to manually specify the privacy policy URL
   - Process the URL again
   - Verify the assessment is created successfully

## API Endpoints

### Public Endpoints

- `GET /api/assessment?url=example.com` - Get privacy assessment for a URL
- `POST /api/report-unassessed` - Report an unassessed URL
- `GET /api/health` - Health check endpoint

### Admin Endpoints (Requires Authentication)

- `GET /admin` - Admin dashboard
- `GET /admin/assessments` - List all assessments
- `GET /admin/assessments/:url` - View a single assessment
- `POST /admin/assessments/:url` - Update an assessment
- `POST /admin/assessments/:url/trigger` - Trigger a new assessment
- `GET /admin/unassessed` - List unassessed URLs
- `POST /admin/unassessed/:url/process` - Process an unassessed URL
- `GET /admin/analytics` - View analytics
- `GET /admin/users` - Manage users (admin only)
- `GET /admin/audit-logs` - View audit logs

## Folder Structure

```
privacy-guard/backend/
├── src/
│   ├── api/            # API routes
│   ├── controllers/    # Controller logic
│   ├── middleware/     # Middleware functions
│   ├── models/         # Database models
│   ├── public/         # Static files
│   ├── services/       # Service layer
│   ├── utils/          # Utility functions
│   ├── views/          # EJS templates
│   └── index.js        # Main entry point
├── .env                # Environment variables
├── package.json        # Dependencies and scripts
└── README.md           # This file
```

## Troubleshooting

### Missing Subscriptions Table

If you encounter an error like `relation "public.subscriptions" does not exist` during login or when accessing subscription features, it means your database is missing the required subscriptions table. This can happen if you're using an older version of the setup instructions or if the application has been updated with new features.

To fix this issue:

1. Go to your Supabase project dashboard at the URL you set as `SUPABASE_URL` in your `.env` file
2. Navigate to the SQL Editor (left sidebar)
3. Click "New Query" to create a new SQL query
4. Copy and paste the contents of the `backend/scripts/create-subscriptions-table.sql` file or use the following SQL:
   ```sql
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
   ```
5. Click "Run" to execute the SQL statements
6. Restart your backend server after making this change

### Missing Email Column in Users Table

If you encounter an error like `column users.email does not exist` during user registration or login, it means the users table in your Supabase database is missing the required email column. This can happen if you're using an older version of the setup instructions or if the table was created incorrectly.

To fix this issue:

1. Go to your Supabase project dashboard at the URL you set as `SUPABASE_URL` in your `.env` file
2. Navigate to the SQL Editor (left sidebar)
3. Create a new query and paste the following SQL:
   ```sql
   ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) NOT NULL UNIQUE;
   ```
4. Run the query by clicking the "Run" button
5. Restart your backend server after making this change

You can verify the column was added successfully by running:
```sql
SELECT column_name FROM information_schema.columns WHERE table_name = 'users';
```
You should see "email" in the list of columns.

## License

MIT
