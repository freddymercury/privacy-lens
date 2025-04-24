# Privacy Policy Link Implementation Specification

## Overview

This document outlines the design specifications for adding a privacy policy link to the PrivacyGuard Chrome plugin. The feature will allow users to access the original privacy policy document that was used for the assessment.

## Requirements

1. The Chrome plugin should display a link to the privacy policy when available
2. The link should be visible in the popup UI
3. The plugin should handle both server-fetched data and pre-packaged data
4. The link should open the privacy policy in a new tab

## Technical Implementation

### Backend Changes

#### 1. API Response Enhancement

The backend API needs to be modified to include the privacy policy URL in its responses:

**File: `backend/src/controllers/assessmentController.js`**

```javascript
// Modify the getAssessment function
const getAssessment = async (req, res) => {
  try {
    // ...existing code...

    if (assessment) {
      // Assessment exists
      return res.status(200).json({
        status: "success",
        assessment: {
          url: assessment.url,
          riskLevel: assessment.privacy_assessment.riskLevel,
          categories: assessment.privacy_assessment.categories,
          summary: assessment.privacy_assessment.summary,
          lastUpdated: assessment.last_updated,
          policyUrl: assessment.user_agreement_url, // Add this line
        },
      });
    } else {
      // ...existing code...
    }
  } catch (error) {
    // ...existing code...
  }
};

// Similarly update the triggerAssessment function response
```

#### 2. Database Utility Enhancement

**File: `backend/src/utils/db.js`**

```javascript
// Modify the getAllAssessments function
const getAllAssessments = async () => {
  // ...existing code...
  
  for (const item of data) {
    assessments[item.url] = {
      riskLevel: item.privacy_assessment.riskLevel,
      categories: item.privacy_assessment.categories,
      summary: item.privacy_assessment.summary,
      lastUpdated: item.last_updated,
      policyUrl: item.user_agreement_url, // Add this line
    };
  }
  
  // ...existing code...
};
```

### Chrome Plugin Changes

#### 1. Data Transformation Layer

**File: `chrome-plugin/transform.js`**

```javascript
// Update the transformServerResponse function
function transformServerResponse(domain, serverResponse) {
  // ...existing code...
  
  // Create the transformed object
  return {
    // Primary key
    domain: domain,
    
    // Assessment data (direct from server)
    assessment: {
      ...serverResponse.assessment,
      
      // Ensure riskLevel is normalized to lowercase for consistency
      riskLevel: normalizeRiskLevel(serverResponse.assessment.riskLevel),
      
      // Add policy URL if available
      policyUrl: serverResponse.assessment.policyUrl || null
    },
    
    // Add metadata
    metadata: {
      timestamp: timestamp,
      source: "server",
      version: "1.0.0",
      serverTimestamp: serverResponse.timestamp || timestamp
    }
  };
}

// Update the transformPrepackagedData function
function transformPrepackagedData(prepackagedData) {
  if (!prepackagedData.assessments || typeof prepackagedData.assessments !== 'object') {
    throw new Error('Invalid pre-packaged database format');
  }
  
  return Object.entries(prepackagedData.assessments).map(([domain, data]) => ({
    domain,
    assessment: {
      ...data.assessment,
      riskLevel: normalizeRiskLevel(data.assessment.riskLevel),
      // Add policy URL if available in the prepackaged data
      policyUrl: data.assessment.policyUrl || null
    },
    metadata: {
      ...data.metadata,
      source: "prepackaged"
    }
  }));
}
```

#### 2. HTML Layer

**File: `chrome-plugin/popup.html`**

```html
<!-- Add after the data-source div -->
<div class="data-source" id="data-source-info">
  <!-- Data source information will be displayed here -->
</div>

<!-- Add this new section -->
<div class="privacy-policy-link" id="privacy-policy-container" style="display: none;">
  <a href="#" id="privacy-policy-url" target="_blank" rel="noopener noreferrer">View Privacy Policy</a>
</div>
```

#### 3. CSS Layer

**File: `chrome-plugin/popup.css`**

```css
/* Add at the end of the file */
.privacy-policy-link {
  margin-top: 10px;
  text-align: center;
  padding: 5px 0;
  border-top: 1px solid #ddd;
}

.privacy-policy-link a {
  color: #3498db;
  text-decoration: none;
  font-size: 14px;
  transition: color 0.2s;
}

.privacy-policy-link a:hover {
  color: #2980b9;
  text-decoration: underline;
}
```

#### 4. JavaScript Layer

**File: `chrome-plugin/popup.js`**

```javascript
// Modify the displayAssessment function
function displayAssessment(assessmentData) {
  // ...existing code...
  
  // Display data source information if available
  const dataSourceInfo = document.getElementById("data-source-info");
  if (metadata && metadata.source) {
    // ...existing code...
  } else {
    dataSourceInfo.style.display = "none";
  }
  
  // Display privacy policy link if available
  const policyContainer = document.getElementById("privacy-policy-container");
  const policyLink = document.getElementById("privacy-policy-url");
  
  if (assessment.policyUrl) {
    policyLink.href = assessment.policyUrl;
    policyContainer.style.display = "block";
  } else {
    policyContainer.style.display = "none";
  }
}
```

### Pre-packaged Data Format

The `assessments.json` file should be updated to include the privacy policy URL for each assessment:

```javascript
{
  "version": "1.0.0",
  "generatedAt": 1650123456789,
  "assessments": {
    "example.com": {
      "assessment": {
        "riskLevel": "medium",
        "categories": {
          // Categories as defined above
        },
        "summary": "Summary text",
        "policyUrl": "https://example.com/privacy-policy" // Add this line
      },
      "metadata": {
        "timestamp": 1650123456789,
        "source": "prepackaged",
        "version": "1.0.0"
      }
    },
    // Additional domains
  }
}
```

## Data Flow

### Server Response Flow

1. Backend API includes `user_agreement_url` as `policyUrl` in the assessment response
2. Chrome plugin receives the response and transforms it using `transformServerResponse`
3. The transformed data is stored in the local database
4. When displaying the assessment, the plugin checks for the presence of `policyUrl`
5. If available, the privacy policy link is displayed in the UI

### Pre-packaged Data Flow

1. The `assessments.json` file includes `policyUrl` for each assessment
2. During initialization, the plugin transforms the pre-packaged data using `transformPrepackagedData`
3. The transformed data is stored in the local database
4. When displaying the assessment, the plugin checks for the presence of `policyUrl`
5. If available, the privacy policy link is displayed in the UI

## UI Design

The privacy policy link will be displayed at the bottom of the popup, below the data source information:

```
+----------------------------------+
|        🕵️ Privacy Lense         |
+----------------------------------+
| Current Website                  |
| example.com                      |
+----------------------------------+
| Privacy Assessment               |
|           +---+                  |
|           | ! |                  |
|           +---+                  |
|        Medium Risk               |
+----------------------------------+
| Risk Categories                  |
| Data Collection: high            |
| Data Sharing: medium             |
| User Control: low                |
+----------------------------------+
| Data from pre-packaged database  |
+----------------------------------+
| [Refresh]        [Plugin Active] |
|                                  |
| [Fetch from Server]  [Free Tier] |
+----------------------------------+
|       View Privacy Policy        |
+----------------------------------+
```

## Fallback Behavior

- If the privacy policy URL is not available (null or empty), the link will be hidden
- The plugin will continue to function normally even if the backend hasn't been updated to include the policy URL
- For pre-packaged data without policy URLs, the link will simply not be displayed

## Security Considerations

- The privacy policy link will open in a new tab with `rel="noopener noreferrer"` to prevent potential security issues
- No additional permissions are required for this feature

## Testing Considerations

- Test with both pre-packaged data and server-fetched data
- Test with and without policy URLs to ensure proper fallback behavior
- Test with various URL formats to ensure proper handling
- Test the link opening in a new tab
