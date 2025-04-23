# PrivacyGuard Chrome Plugin Design Specification v2

## Overview

This document outlines the design specifications for the PrivacyGuard Chrome plugin v2, which includes a local database implementation for caching server data and tier-based access to server fetch functionality.

## Core Requirements

1. The Chrome plugin should ship with a local database that serves as a cache for server data
2. The plugin should include a pre-packaged database in the build
3. Only paid tier users should have access to a button to fetch from the server
4. The plugin needs a way to determine if a user is in the paid tier
5. When fetching from the server, the payload should directly overwrite the local database

## Technical Architecture

### Database Implementation

**Technology Choice: IndexedDB**

IndexedDB is chosen for the local database implementation because:
- It provides a robust, persistent client-side storage solution
- It supports complex data structures and indexing
- It has good performance characteristics for the expected data volume
- It's well-supported across modern browsers

### Database Structure

```
Database Name: privacyGuardDB
Version: 1
```

#### Object Stores

1. **assessments** - Primary data store for privacy assessments
   - Key Path: `domain` (string) - Normalized domain name
   - Auto Increment: false

2. **config** - Configuration store including user tier information
   - Key Path: `key` (string)
   - Auto Increment: false

#### Indexes

For the `assessments` Object Store:
- `timestamp` - Index on `metadata.timestamp` for querying by age
- `riskLevel` - Index on `assessment.riskLevel` for filtering by risk level

For the `config` Object Store:
- `lastUpdated` - Index on `lastUpdated` for tracking configuration changes

### Data Formats

#### Assessment Record Format

```javascript
{
  // Primary key - normalized domain
  "domain": "example.com",
  
  // Full assessment data
  "assessment": {
    "riskLevel": "medium", // "high", "medium", "low", or "unknown"
    "categories": {
      "dataCollection": {
        "risk": "high",
        "details": "Collects extensive personal information"
      },
      "dataSharing": {
        "risk": "medium",
        "details": "Shares data with third parties for advertising"
      },
      "userControl": {
        "risk": "low",
        "details": "Provides adequate user controls for privacy settings"
      }
      // Additional categories as needed
    },
    "summary": "This website collects significant personal data with moderate sharing practices."
  },
  
  // Metadata for database management
  "metadata": {
    "timestamp": 1650123456789, // When this assessment was last updated
    "source": "prepackaged", // "prepackaged" or "server"
    "version": "1.0.0" // Version of the assessment format
  }
}
```

#### User Tier Configuration Format

```javascript
{
  "key": "userTier",
  "value": {
    "tier": "free", // "free" or "paid"
    "expirationDate": 1650123456789, // For paid users, when subscription expires
    "features": {
      "serverFetch": false, // true for paid users
      "advancedAnalytics": false // true for paid users
      // Other tier-specific features
    }
  },
  "lastUpdated": 1650123456789
}
```

#### Pre-packaged Database File Format

The pre-packaged database file (`assessments.json`) will follow this structure:

```javascript
{
  "version": "1.0.0",
  "generatedAt": 1650123456789,
  "assessments": {
    "google.com": {
      "assessment": {
        "riskLevel": "medium",
        "categories": {
          // Categories as defined above
        },
        "summary": "Summary text"
      },
      "metadata": {
        "timestamp": 1650123456789,
        "source": "prepackaged",
        "version": "1.0.0"
      }
    },
    "facebook.com": {
      // Similar structure
    },
    // Additional domains
  }
}
```

## Server Response Transformation

When fetching data from the server, the response needs to be transformed to match the local database format:

### Server Response Format

```javascript
{
  "status": "success",
  "assessment": {
    "riskLevel": "medium",
    "categories": {
      "dataCollection": {
        "risk": "high",
        "details": "Collects extensive personal information"
      },
      // Other categories
    }
    // Other assessment data
  }
}
```

### Transformation Function

The transformation function will:
1. Extract the assessment data from the server response
2. Normalize the risk level to lowercase
3. Add metadata including timestamp and source
4. Format the data to match the local database schema

## User Interface Changes

### Paid Tier Features

The UI will be updated to:
1. Show/hide the "Fetch from Server" button based on user tier
2. Provide visual feedback during server fetch operations
3. Indicate the source of the assessment data (pre-packaged vs. server)

## Data Flow

### Initialization Flow

```
1. Extension Installation/Update
2. Check if database is initialized
3. If not initialized:
   a. Load pre-packaged database file
   b. Transform data to database format
   c. Bulk insert into IndexedDB
   d. Mark database as initialized
4. Initialize user tier information
5. Update UI based on user tier
```

### Server Fetch Flow (Paid Users Only)

```
1. User clicks "Fetch from Server" button
2. Verify user is in paid tier
3. Show loading state in UI
4. Fetch assessment from server
5. Transform server response
6. Update local database
7. Update UI with fresh data
8. Update last sync information
```

## Build Process

The build process has been updated to:
1. Fetch the latest assessment data from the server using a dedicated build script
2. Generate the `assessments.json` file with all assessments from the server
3. Include this file in the extension package

### Build Script Implementation

A new build script (`build-prepackaged-db.js`) has been created to:
1. Connect to the backend API and fetch all assessments
2. Transform the data into the required format for the pre-packaged database
3. Generate the `assessments.json` file
4. Handle errors gracefully and provide fallback sample data if needed

```javascript
// Example build script execution
npm run build:db  // Runs the build-prepackaged-db.js script
npm run build     // Runs the full build process including database generation
```

### Backend API Endpoint

A new endpoint has been added to the backend API to support the build process:

```
GET /api/all-assessments
```

This endpoint returns all assessments in the database, formatted as an object with domains as keys and assessment data as values. This ensures the pre-packaged database contains all available assessments.

## Implementation Modules

1. **db.js** - Database operations
   - Database initialization with verification steps
   - CRUD operations for assessments
   - Configuration management
   - Detailed logging and error handling
   - Progress tracking for bulk operations

2. **auth.js** - User authentication and tier management
   - User tier verification
   - Feature access control
   - Tier upgrade/downgrade functionality
   - Expiration date handling

3. **transform.js** - Data transformation utilities
   - Server response transformation
   - Bulk data transformation
   - Format normalization
   - Risk level standardization

4. **build-prepackaged-db.js** - Build script
   - Server data fetching
   - Pre-packaged database generation
   - Error handling with fallback sample data

5. **popup.js** - User interface and main functionality
   - Tier-specific UI updates
   - Server fetch button handling (paid tier only)
   - Assessment display with source information
   - Strict tier-based access control

## Unit Testing

Comprehensive unit tests will be implemented for:
1. Database operations
2. Transformation functions
3. User tier management
4. Server fetch functionality
5. Pre-packaged database loading
6. UI components
7. Integration tests

## Security Considerations

1. User tier information will be stored securely in the local database
2. Server communication will use HTTPS
3. Input validation will be performed on all server responses
4. Error handling will prevent exposure of sensitive information
5. Strict tier-based access control for server fetch operations
6. Verification of database integrity during initialization

## Performance Considerations

1. Database operations will use indexes for efficient querying
2. Bulk operations will be used for database initialization with progress tracking
3. Server fetch operations will include timeout and retry logic
4. UI updates will be optimized to prevent jank
5. Local database prioritization to minimize server requests
6. Detailed logging for performance monitoring and debugging

## Error Handling Improvements

1. **Database Operations**
   - Validation of input data before database operations
   - Detailed error logging with context information
   - Graceful fallbacks for database failures
   - Transaction safety for bulk operations

2. **Network Operations**
   - Timeout and retry logic for server fetch operations
   - Graceful handling of network errors
   - Fallback to local data when server is unavailable
   - Clear user feedback for network issues

3. **User Experience**
   - Informative error messages in the UI
   - Loading states during asynchronous operations
   - Clear indication of data source and freshness
   - Graceful degradation for free tier users

## Testing Features

For easier testing and demonstration, the implementation includes:

1. **Test Buttons in UI**
   - "TEST: Upgrade to Paid" - Upgrades the user to paid tier for 30 days
   - "TEST: Downgrade to Free" - Reverts the user to free tier

2. **Detailed Logging**
   - Console logging of database operations
   - Tracking of assessment sources (prepackaged vs. server)
   - Verification of database population

## Future Enhancements

1. Offline mode improvements
2. Sync conflict resolution
3. Additional paid tier features
4. Enhanced analytics for paid users
5. Automated database update scheduling
6. User preference persistence
7. Multi-device synchronization
