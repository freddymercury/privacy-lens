# PrivacyLens API Endpoints Documentation

This document provides a comprehensive list of all API endpoints available in the PrivacyLens system, including both public-facing APIs used by the Chrome plugin and internal admin APIs used by the admin dashboard.

**Note:** As of Phase 7, the system has been separated into multiple processes for improved scalability and maintainability.

## Client API Endpoints (handled by Client API process - port 3001)

**These endpoints are routed through NGINX to the Client API process for Chrome plugin functionality.**

### Authentication Routes
1. `POST /api/auth/register` - Register a new user *(Client API)*
2. `POST /api/auth/login` - Login user *(Client API)*
3. `POST /api/auth/refresh` - Refresh authentication token *(Client API)*
4. `POST /api/auth/validate` - Validate authentication token *(Client API)*
5. `POST /api/auth/revoke` - Revoke authentication token *(Client API)*

### Subscription Routes
6. `POST /api/subscription/create` - Create a subscription *(Client API)*
7. `POST /api/subscription/update` - Update subscription *(Client API)*
8. `POST /api/subscription/cancel` - Cancel subscription *(Client API)*
9. `POST /api/subscription/status` - Get subscription status *(Client API)*
10. `POST /api/subscription/webhook` - Handle Stripe webhook *(Client API)*

### Assessment Routes (Client-facing)
11. `GET /api/assessment` - Get privacy assessment for a URL *(Client API)*
12. `POST /api/trigger-assessment/:url` - Trigger a new assessment *(Client API)*

### Unassessed Routes (Client-facing)
13. `POST /api/report-unassessed` - Report an unassessed URL *(Client API)*

## Backend API Endpoints (handled by Backend monolith - port 3000)

**These endpoints remain in the monolithic backend for admin functionality and core services.**

### Update Routes
14. `POST /api/updates/check` - Check for available updates *(Backend)*
15. `POST /api/updates/download` - Download update *(Backend)*
16. `POST /api/updates/changelog` - Get update history *(Backend)*
17. `POST /api/updates/create` (admin only) - Create update *(Backend)*

### Assessment Routes (Admin-facing)
18. `GET /api/all-assessments` - Get all assessments *(Backend)*

### Unassessed Routes (Admin-facing)
19. `PUT /api/unassessed/:url/policy-urls` - Update suggested policy URLs *(Backend)*

### Health Check
20. `GET /api/health` - Health check endpoint *(Backend)*

### Policy Archive Routes (V1)
21. `GET /api/v1/policies/:domain/latest` - Get latest policy snapshot and asset list *(Backend)*
22. `GET /api/v1/policies/:domain/versions` - Get paginated list of policy versions *(Backend)*
23. `GET /api/v1/policies/:domain/versions/:versionId` - Get specific version with assets *(Backend)*
24. `GET /api/v1/policies/:domain/versions/:versionId/assets/:assetId` - Stream raw asset *(Backend)*
25. `GET /api/v1/policies/:domain/diff/:olderVersionId/:newerVersionId` - Get diff between versions *(Backend)*

### Client API Health Check
26. `GET /health` - Client API health check endpoint *(Client API - note: no /api prefix)*

## Admin API Endpoints (handled by Backend monolith - accessible via `/admin` route)

**These endpoints remain in the monolithic backend for admin dashboard functionality.**

### Authentication Routes
27. `GET /admin/login` - Show login page *(Backend)*
28. `POST /admin/login` - Process login *(Backend)*
29. `GET /admin/logout` - Logout *(Backend)*

### Dashboard Route
30. `GET /admin` - Admin dashboard *(Backend)*

### Assessment Management Routes
31. `GET /admin/assessments` - List all assessments *(Backend)*
32. `GET /admin/assessments/:url` - View a single assessment *(Backend)*
33. `POST /admin/assessments/:url` - Update an assessment *(Backend)*
34. `POST /admin/assessments/:url/trigger` - Trigger a new assessment *(Backend)*
35. `DELETE /admin/assessments/:url` - Delete an assessment *(Backend)*

### Unassessed URLs Management Routes
36. `GET /admin/unassessed` - List unassessed URLs *(Backend)*
37. `POST /admin/unassessed/:url/process` - Process an unassessed URL *(Backend)*
38. `DELETE /admin/unassessed/:url` - Delete an unassessed URL *(Backend)*
39. `POST /admin/trigger-assessments` - Trigger processing of all pending unassessed URLs *(Backend)*

### Analytics Route
40. `GET /admin/analytics` - View analytics *(Backend)*

### User Management Routes
41. `GET /admin/users` - List users *(Backend)*
42. `POST /admin/users` - Create a new user *(Backend)*
43. `PUT /admin/users/:id` - Update a user *(Backend)*
44. `DELETE /admin/users/:id` - Delete a user *(Backend)*

### Audit Log Route
45. `GET /admin/audit-logs` - View audit logs *(Backend)*

## Total API Endpoints: 45 (26 Client API + 19 Backend)

## Process Separation Architecture

As of Phase 7, the PrivacyLens system has been separated into two main processes:

### Client API Process (Port 3001)
- **Purpose:** Handles Chrome plugin requests for authentication, assessment, and subscription operations
- **Technology:** Node.js with Express.js, CommonJS modules
- **Endpoints:** All `/api/auth/*`, `/api/assessment`, `/api/subscription/*`, `/api/report-unassessed`
- **Health Check:** `GET /health` (note: no `/api` prefix)
- **Logging:** Structured JSON logging with Pino
- **Database:** Shared Supabase database with Backend

### Backend Monolith (Port 3000)
- **Purpose:** Handles admin dashboard, policy archive, background jobs, and remaining API functionality
- **Technology:** Node.js with Express.js, ES modules
- **Endpoints:** Admin routes (`/admin/*`), policy archive (`/api/v1/policies/*`), updates (`/api/updates/*`)
- **Health Check:** `GET /api/health`
- **Background Jobs:** Assessment trigger service, policy archiver
- **Database:** Shared Supabase database with Client API

### NGINX Routing
NGINX acts as a reverse proxy, routing requests to the appropriate process:
- `/api/auth/*` → Client API (port 3001)
- `/api/assessment*` → Client API (port 3001)
- `/api/subscription/*` → Client API (port 3001)
- `/api/report-unassessed` → Client API (port 3001)
- All other `/api/*` → Backend (port 3000)
- `/admin/*` → Backend (port 3000)

## Authentication and Authorization

- **Client API endpoints** require authentication via JWT token in the `Authorization` header
- **Admin API endpoints** require session-based authentication and appropriate role permissions
- Some endpoints have specific role requirements (e.g., admin role for user management)

## Response Format

Most API endpoints return responses in the following JSON format:

```json
{
  "status": "success" | "error",
  "message": "Optional message",
  "data": {} | [] | null
}
```

For error responses:

```json
{
  "status": "error",
  "message": "Error message",
  "error": "Detailed error information (only in development mode)"
}
```

## Rate Limiting

API endpoints are subject to rate limiting to prevent abuse. The current limits are:

- Authentication endpoints: 10 requests per minute per IP
- Other endpoints: 100 requests per minute per authenticated user

## Versioning

The Policy Archive API is versioned (currently at v1). Future API changes will be versioned accordingly to maintain backward compatibility.
