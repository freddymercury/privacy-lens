# PrivacyLens API Endpoints Documentation

This document provides a comprehensive list of all API endpoints available in the PrivacyLens system, including both public-facing APIs used by the Chrome plugin and internal admin APIs used by the admin dashboard.

## Public API Endpoints (accessible via `/api` route)

### Authentication Routes
1. `POST /api/auth/register` - Register a new user
2. `POST /api/auth/login` - Login user
3. `POST /api/auth/refresh` - Refresh authentication token
4. `POST /api/auth/validate` - Validate authentication token
5. `POST /api/auth/revoke` - Revoke authentication token

### Subscription Routes
6. `POST /api/subscription/create` - Create a subscription
7. `POST /api/subscription/update` - Update subscription
8. `POST /api/subscription/cancel` - Cancel subscription
9. `POST /api/subscription/status` - Get subscription status
10. `POST /api/subscription/webhook` - Handle Stripe webhook

### Update Routes
11. `POST /api/updates/check` - Check for available updates
12. `POST /api/updates/download` - Download update
13. `POST /api/updates/changelog` - Get update history
14. `POST /api/updates/create` (admin only) - Create update

### Assessment Routes
15. `GET /api/assessment` - Get privacy assessment for a URL
16. `GET /api/all-assessments` - Get all assessments
17. `POST /api/trigger-assessment/:url` - Trigger a new assessment

### Unassessed Routes
18. `POST /api/report-unassessed` - Report an unassessed URL
19. `PUT /api/unassessed/:url/policy-urls` - Update suggested policy URLs

### Health Check
20. `GET /api/health` - Health check endpoint

### Policy Archive Routes (V1)
21. `GET /api/v1/policies/:domain/latest` - Get latest policy snapshot and asset list
22. `GET /api/v1/policies/:domain/versions` - Get paginated list of policy versions
23. `GET /api/v1/policies/:domain/versions/:versionId` - Get specific version with assets
24. `GET /api/v1/policies/:domain/versions/:versionId/assets/:assetId` - Stream raw asset
25. `GET /api/v1/policies/:domain/diff/:olderVersionId/:newerVersionId` - Get diff between versions

## Admin API Endpoints (accessible via `/admin` route)

### Authentication Routes
26. `GET /admin/login` - Show login page
27. `POST /admin/login` - Process login
28. `GET /admin/logout` - Logout

### Dashboard Route
29. `GET /admin` - Admin dashboard

### Assessment Management Routes
30. `GET /admin/assessments` - List all assessments
31. `GET /admin/assessments/:url` - View a single assessment
32. `POST /admin/assessments/:url` - Update an assessment
33. `POST /admin/assessments/:url/trigger` - Trigger a new assessment
34. `DELETE /admin/assessments/:url` - Delete an assessment

### Unassessed URLs Management Routes
35. `GET /admin/unassessed` - List unassessed URLs
36. `POST /admin/unassessed/:url/process` - Process an unassessed URL
37. `DELETE /admin/unassessed/:url` - Delete an unassessed URL
38. `POST /admin/trigger-assessments` - Trigger processing of all pending unassessed URLs

### Analytics Route
39. `GET /admin/analytics` - View analytics

### User Management Routes
40. `GET /admin/users` - List users
41. `POST /admin/users` - Create a new user
42. `PUT /admin/users/:id` - Update a user
43. `DELETE /admin/users/:id` - Delete a user

### Audit Log Route
44. `GET /admin/audit-logs` - View audit logs

## Total API Endpoints: 44

## Authentication and Authorization

- Public API endpoints may require authentication via JWT token in the `Authorization` header
- Admin API endpoints require session-based authentication and appropriate role permissions
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
