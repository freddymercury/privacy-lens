# Chrome Plugin API Endpoints

This document lists all the API endpoints used by the PrivacyLens Chrome plugin.

## Assessment Endpoints
1. `GET /api/assessment` - Used to get privacy assessment for a URL
   - Used to fetch privacy assessments for websites the user visits

2. `POST /api/trigger-assessment/:url` - Used to trigger a new assessment
   - Used when a URL has no existing assessment

3. `POST /api/report-unassessed` - Used to report an unassessed URL
   - Reports URLs that don't have assessments yet for future processing

## Authentication Endpoints
4. `POST /api/auth/register` - Register a new user
   - Used during user registration

5. `POST /api/auth/login` - Login user
   - Used during user login

6. `POST /api/auth/refresh` - Refresh authentication token
   - Used to refresh tokens before they expire

7. `POST /api/auth/validate` - Validate authentication token
   - Used to check if a token is still valid

8. `POST /api/auth/revoke` - Revoke authentication token
   - Used during logout

## Subscription Endpoints
9. `POST /api/subscription/status` - Get subscription status
   - Used to check user's subscription tier

10. `POST /api/subscription/create` - Create a subscription
    - Used when user subscribes to a paid plan

11. `POST /api/subscription/update` - Update subscription
    - Used when user changes their subscription plan

12. `POST /api/subscription/cancel` - Cancel subscription
    - Used when user cancels their subscription

## Update Endpoints
13. `POST /api/updates/check` - Check for available updates
    - Used to check if plugin updates are available

14. `POST /api/updates/download` - Download update
    - Used to download plugin updates

15. `POST /api/updates/changelog` - Get update history
    - Used to fetch update history

## Unused Endpoints

The Chrome plugin does not use any of the Policy Archive Routes (V1) or Admin API Endpoints, which are primarily used by the admin dashboard rather than the plugin itself.
