# PrivacyLens

PrivacyLens is a comprehensive privacy policy analysis and monitoring tool that helps users understand and track changes to privacy policies across the web.

## Features

- **Privacy Policy Analysis**: Automated analysis of privacy policies to identify key provisions and potential concerns.
- **Change Monitoring**: Track changes to privacy policies over time and receive notifications when important changes occur.
- **Browser Extension**: Seamless integration with your browsing experience through our Chrome extension.
- **API Access**: Programmatic access to privacy policy assessments and archives.
- **Multi-Process Architecture**: Scalable, fault-tolerant design with process separation for improved reliability.

## Architecture

PrivacyLens uses a multi-process architecture to ensure reliability, scalability, and separation of concerns:

1. **Client API Process**: Handles client-facing API requests for the web application.
2. **Plugin API Process**: Handles API requests from the browser extension.
3. **Admin Dashboard Process**: Serves the administrative web interface.
4. **Archive API Process**: Serves historical policy data and diffs.
5. **Background Jobs Process**: Manages background tasks like assessment processing, archiving, and notifications.

Each process operates independently, communicating through a shared message queue, and can be scaled horizontally as needed.

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- RabbitMQ
- PostgreSQL (via Supabase)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/privacy-lens.git
   cd privacy-lens
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. Start the application:
   ```bash
   npm start
   ```

### Running Individual Processes

You can start individual processes as needed:

```bash
# Start the Client API process
npm run start:client-api

# Start the Plugin API process
npm run start:plugin-api

# Start the Admin Dashboard process
npm run start:admin-dashboard

# Start the Archive API process
npm run start:archive-api

# Start the Background Jobs process
npm run start:background-jobs
```

## Development

### Project Structure

```
privacy-lens/
├── processes/              # Process-specific code
│   ├── client-api/         # Client API process
│   ├── plugin-api/         # Plugin API process
│   ├── admin-dashboard/    # Admin Dashboard process
│   ├── archive-api/        # Archive API process
│   └── background-jobs/    # Background jobs process
├── shared/                 # Shared code used by multiple processes
│   ├── assessment/         # Assessment-related functionality
│   ├── auth/               # Authentication and authorization
│   ├── config/             # Configuration (logging, context, queue)
│   ├── db/                 # Database access modules
│   └── utils/              # Utility functions
├── index.js                # Main entry point
├── package.json            # Project metadata and dependencies
└── README.md               # This file
```

### Development Workflow

1. Make your changes
2. Run linting: `npm run lint`
3. Run tests: `npm test`
4. Start the development server: `npm run dev`

## API Documentation

### Client API

The Client API provides endpoints for the web application:

- `GET /api/assessments/:url` - Get assessment for a URL
- `POST /api/assessments` - Queue a URL for assessment
- `GET /api/users` - Get all users (admin only)
- `GET /api/audit-logs` - Get audit logs (admin only)

### Plugin API

The Plugin API provides endpoints for the browser extension:

- `GET /api/public/assessments/:url` - Get limited assessment for a URL (public)
- `POST /api/public/assessments` - Queue a URL for assessment (public)
- `GET /api/assessments/:url` - Get full assessment for a URL (authenticated)
- `POST /api/assessments/get-or-create` - Get or create assessment for a URL (authenticated)

### Admin Dashboard

The Admin Dashboard provides a web interface for administrators:

- `/login` - Admin login page
- `/admin` - Main dashboard
- `/admin/assessments` - Manage assessments
- `/admin/unassessed` - Manage unassessed URLs
- `/admin/users` - Manage users (admin only)
- `/admin/audit-logs` - View audit logs (admin only)
- `/admin/analytics` - View analytics

### Archive API

The Archive API provides endpoints for accessing historical policy data:

- `GET /api/v1/policies/:domain/versions` - Get policy versions for a domain
- `GET /api/v1/policies/:domain/versions/:versionId` - Get specific policy version
- `GET /api/v1/policies/:domain/versions/:versionId/content` - Get policy content
- `GET /api/v1/policies/:domain/diff` - Get diff between two policy versions
- `GET /api/v1/policies/:domain/versions/:versionId/assets` - Get policy assets list
- `GET /api/v1/policies/:domain/versions/:versionId/assets/:assetId` - Get specific policy asset

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Thanks to all contributors who have helped shape PrivacyLens
- Built with [Express](https://expressjs.com/), [Supabase](https://supabase.io/), and [RabbitMQ](https://www.rabbitmq.com/)
