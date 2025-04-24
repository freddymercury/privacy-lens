# PrivacyLens Authentication and Subscription System Setup Guide

This guide provides instructions for setting up and using the PrivacyLens authentication and subscription system.

## Overview

The PrivacyLens authentication and subscription system includes:

1. User authentication with JWT tokens
2. Device-based authentication for multiple devices per user
3. Subscription management with Stripe integration
4. Update management for the Chrome extension

## Prerequisites

- Node.js (v14 or higher)
- PostgreSQL database (or Supabase account)
- Stripe account for payment processing

## Setup Instructions

### 1. Environment Configuration

1. Copy the `.env.example` file to `.env` in the `backend/src` directory:
   ```
   cp backend/src/.env.example backend/src/.env
   ```

2. Update the `.env` file with your configuration:
   - Set `JWT_SECRET` to a secure random string
   - Configure database connection details
   - Add your Supabase URL and keys
   - Add your Stripe API keys and price IDs
   - Configure email settings if needed

### 2. Database Setup

1. Create the necessary database tables by running:
   ```
   npm run setup-auth-tables
   ```

   This script will create the following tables:
   - `users` - User accounts
   - `user_tokens` - JWT tokens for authentication
   - `subscriptions` - User subscription information
   - `updates` - Extension updates
   - `update_applications` - Update application history
   - `audit_logs` - System audit logs

### 3. Stripe Configuration

1. Create products and prices in your Stripe dashboard:
   - Create a product for the monthly subscription
   - Create a product for the annual subscription
   - Note the price IDs and add them to your `.env` file

2. Set up a webhook in your Stripe dashboard:
   - Create a webhook endpoint pointing to `https://your-api-domain.com/api/subscription/webhook`
   - Add the webhook secret to your `.env` file
   - Subscribe to the following events:
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login and get JWT token
- `POST /api/auth/refresh` - Refresh JWT token
- `POST /api/auth/validate` - Validate JWT token
- `POST /api/auth/revoke` - Revoke JWT token

### Subscription

- `POST /api/subscription/create` - Create a new subscription
- `POST /api/subscription/update` - Update subscription plan
- `POST /api/subscription/cancel` - Cancel subscription
- `POST /api/subscription/status` - Get subscription status
- `POST /api/subscription/webhook` - Stripe webhook endpoint

### Updates

- `POST /api/updates/check` - Check for available updates
- `POST /api/updates/download` - Download and apply update
- `POST /api/updates/changelog` - Get update history

## Chrome Extension Integration

The Chrome extension integrates with the authentication and subscription system through:

1. **Login/Registration Page**: Allows users to create accounts and log in
2. **Subscription Page**: Allows users to manage their subscription
3. **Update Page**: Allows users to check for and apply updates
4. **Authentication Token Management**: Handles JWT tokens for API requests

## Testing

You can test the authentication and subscription system with:

```
npm test
```

## Troubleshooting

### Common Issues

1. **Database Connection Errors**:
   - Verify your database credentials in the `.env` file
   - Ensure the database server is running

2. **JWT Token Issues**:
   - Check that the `JWT_SECRET` is set correctly
   - Verify token expiration times

3. **Stripe Integration Issues**:
   - Ensure Stripe API keys are correct
   - Check webhook configuration
   - Verify price IDs match those in your Stripe dashboard

### Logs

Check the application logs for detailed error information:

```
npm run dev
```

## Security Considerations

- JWT tokens are stored securely in the Chrome extension
- Passwords are hashed using bcrypt
- API endpoints are protected with JWT authentication
- Sensitive operations require token validation
