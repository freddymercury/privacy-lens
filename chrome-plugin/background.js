// Background script for PrivacyLens Chrome Plugin

// Import utility functions
import { getNormalizedDomain, normalizeUrl } from "./utils.js";
import { 
  checkAndInitializeDatabase, 
  getAssessment, 
  updateAssessmentInDB 
} from "./db.js";
import { 
  isAuthenticated,
  refreshToken,
  getUserTier,
  hasFeature,
  isPremium,
  getDeviceId,
  getAuthToken
} from "./auth.js";
import { 
  transformServerResponse 
} from "./transform.js";
import {
  checkForUpdates,
  scheduleUpdateChecks
} from "./updater.js";
import { API_BASE_URL } from './config.js';

// Configuration
const CURRENT_VERSION = "2.0.0";

// Initialize extension on install or update
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log(`[PrivacyLens BG] Extension ${details.reason}ed`);
  
  try {
    // Initialize database with pre-packaged data
    await checkAndInitializeDatabase();
    console.log('[PrivacyLens BG] Database initialized');
    
    // Schedule update checks
    const deviceId = await getDeviceId();
    scheduleUpdateChecks(CURRENT_VERSION, (updateInfo) => {
      // Show update notification
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/detective_48.png',
        title: 'PrivacyLens Update Available',
        message: `Version ${updateInfo.version} is available. Open the extension to update.`,
        priority: 2
      });
    });
    console.log('[PrivacyLens BG] Update checks scheduled');
    
    // Set up token refresh alarm
    chrome.alarms.create('tokenRefresh', { periodInMinutes: 60 }); // Check every hour
    console.log('[PrivacyLens BG] Token refresh alarm set');
  } catch (error) {
    console.error('[PrivacyLens BG] Error during initialization:', error);
  }
});

// Handle alarms
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'tokenRefresh') {
    try {
      // Check if authenticated and refresh token if needed
      const authenticated = await isAuthenticated();
      if (authenticated) {
        await refreshToken();
        console.log('[PrivacyLens BG] Token refreshed');
      }
    } catch (error) {
      console.error('[PrivacyLens BG] Token refresh error:', error);
    }
  }
});

// Listen for tab updates to detect URL changes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only proceed if the URL has changed and loaded completely
  if (changeInfo.status === "complete" && tab.url) {
    // Check if the URL is valid (not chrome:// or other browser URLs)
    if (isValidUrl(tab.url)) {
      // Query the service layer for assessment
      checkPrivacyAssessment(tab.url, tabId);
    }
  }
});

// Check if URL is valid for assessment
function isValidUrl(url) {
  try {
    const urlObj = new URL(url);
    // Exclude browser internal pages and other non-http(s) protocols
    return urlObj.protocol === "http:" || urlObj.protocol === "https:";
  } catch (e) {
    return false;
  }
}

// Fetch with timeout and retry
async function fetchWithRetry(url, options = {}, retries = 2, timeout = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  // Clone options to avoid modifying the original object
  const optionsWithSignal = { ...options };
  
  // If options already has a signal, we need to handle it properly
  if (options.signal) {
    const originalSignal = options.signal;
    // Create a handler that aborts the controller if either signal aborts
    const handleAbort = () => controller.abort();
    originalSignal.addEventListener('abort', handleAbort);
    
    // Clean up the event listener when we're done
    const cleanup = () => originalSignal.removeEventListener('abort', handleAbort);
    
    // We'll need to clean up regardless of how this function exits
    try {
      optionsWithSignal.signal = controller.signal;
      const response = await fetch(url, optionsWithSignal);
      clearTimeout(timeoutId);
      cleanup();
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      cleanup();
      throw error;
    }
  } else {
    // Simple case - just use our controller's signal
    optionsWithSignal.signal = controller.signal;
    
    try {
      const response = await fetch(url, optionsWithSignal);
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      
      // Log more details about the error
      if (error.name === 'AbortError') {
        console.log(`[PrivacyLens BG] Request to ${url} timed out after ${timeout}ms`);
      } else if (error instanceof DOMException) {
        console.log(`[PrivacyLens BG] DOMException in fetch: ${error.name} - ${error.message}`);
      }
      
      if (retries <= 0) throw error;

      console.log(
        `[PrivacyLens BG] Retrying fetch to ${url}, ${retries} retries left`
      );
      // Wait a bit before retrying (exponential backoff)
      await new Promise((resolve) => setTimeout(resolve, 1000 * (3 - retries)));
      return fetchWithRetry(url, options, retries - 1, timeout);
    }
  }
}

// Query the service layer for privacy assessment and update local database
async function checkPrivacyAssessment(url, tabId) {
  try {
    // Extract domain from URL for assessment lookup and remove 'www.' prefix
    const fullHostname = new URL(url).hostname;
    const domain = normalizeUrl(url); // Use normalizeUrl to ensure 'www.' is removed
    console.log(
      `[PrivacyLens BG] Checking assessment for domain: ${fullHostname}, Normalized: ${domain}`
    );

    // First check if we have this domain in our local database
    try {
      const localAssessment = await getAssessment(domain);
      
      if (localAssessment) {
        console.log(
          `[PrivacyLens BG] Assessment found in local database with risk level: ${localAssessment.assessment.riskLevel}`
        );
        // Update icon based on risk level from local database
        updateIcon(tabId, localAssessment.assessment.riskLevel);
        return localAssessment;
      }
    } catch (dbError) {
      console.error("[PrivacyLens BG] Error reading from local database:", dbError);
      // Continue to try server if local DB fails, but only for paid users
    }
    
    // Only try to fetch from server if user is in premium tier
    try {
      // Check if user is authenticated and in premium tier
      const authenticated = await isAuthenticated();
      const premium = await isPremium();
      
      if (!authenticated || !premium) {
        console.log("[PrivacyLens BG] Free tier user or not authenticated - no server fetch attempted");
        // Free tier users just get "unknown" if no local data
        updateIcon(tabId, "unknown");
        return null;
      }
      
      // Get auth token for API requests
      const token = await getAuthToken();
      if (!token) {
        console.log("[PrivacyLens BG] No auth token available");
        updateIcon(tabId, "unknown");
        return null;
      }
      
      // If not in local database and user is paid tier, query the backend service
      console.log(
        `[PrivacyLens BG] No local data, paid user - fetching from: ${API_BASE_URL}/assessment?url=${encodeURIComponent(
          domain
        )}`
      );

      const response = await fetchWithRetry(
        `${API_BASE_URL}/assessment?url=${encodeURIComponent(domain)}`,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }
      );

      const data = await response.json();
      console.log(`[PrivacyLens BG] Assessment API response:`, data);

      // Update the extension icon based on assessment
      if (data.status === "success") {
        if (data.assessment) {
          console.log(
            `[PrivacyLens BG] Assessment found with risk level: ${data.assessment.riskLevel}`
          );
          
          // Transform server response to database format
          const transformedData = transformServerResponse(domain, data);
          
          // Store in local database
          await updateAssessmentInDB(transformedData);
          
          // Update icon based on risk level
          updateIcon(tabId, data.assessment.riskLevel);
          
          console.log(`[PrivacyLens BG] Assessment stored in local database`);
          return transformedData;
        } else {
          console.log(
            `[PrivacyLens BG] No assessment available for ${domain}, reporting as unassessed`
          );
          // No assessment available
          updateIcon(tabId, "unknown");
          // Report URL for future assessment
          await reportUnassessedUrl(domain);

          // Immediately trigger assessment for this URL
          try {
            console.log(
              `[PrivacyLens BG] Triggering immediate assessment for ${domain}`
            );

            const triggerResponse = await fetchWithRetry(
              `${API_BASE_URL}/trigger-assessment/${encodeURIComponent(domain)}`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${token}`
                },
              }
            );

            const triggerData = await triggerResponse.json();
            console.log(
              `[PrivacyLens BG] Trigger assessment response:`,
              triggerData
            );

            if (triggerData.status === "success" && triggerData.assessment) {
              console.log(
                `[PrivacyLens BG] Immediate assessment successful with risk level: ${triggerData.assessment.riskLevel}`
              );
              
              // Transform server response to database format
              const transformedData = transformServerResponse(domain, triggerData);
              
              // Store in local database
              await updateAssessmentInDB(transformedData);
              
              // Update icon based on risk level
              updateIcon(tabId, triggerData.assessment.riskLevel);
              
              console.log(
                `[PrivacyLens BG] Immediate assessment stored in local database`
              );
              return transformedData;
            } else {
              console.log(
                `[PrivacyLens BG] Immediate assessment did not return an assessment object`
              );
            }
          } catch (triggerError) {
            // Provide more detailed error logging
            if (triggerError instanceof DOMException) {
              console.error(
                `[PrivacyLens BG] Error triggering assessment: DOMException - ${triggerError.name}: ${triggerError.message}`
              );
            } else {
              console.error(
                "[PrivacyLens BG] Error triggering assessment:",
                triggerError
              );
            }
          }
        }
      } else {
        console.error(`[PrivacyLens BG] Error in API response:`, data);
        // Error in API response
        updateIcon(tabId, "error");
      }
    } catch (fetchError) {
      console.error("[PrivacyLens BG] Error fetching from server:", fetchError);
      
      // If we have no local data and can't fetch, show unknown
      updateIcon(tabId, "unknown");
    }
  } catch (error) {
    console.error(
      "[PrivacyLens BG] Error checking privacy assessment:",
      error
    );
    updateIcon(tabId, "error");
  }
  
  return null;
}

// Update the extension badge based on risk level
function updateIcon(tabId, riskLevel) {
  let badgeText;
  let badgeColor;

  // Normalize riskLevel to handle different possible structures
  let normalizedRiskLevel;
  if (typeof riskLevel === "string") {
    normalizedRiskLevel = riskLevel.toLowerCase();
  } else if (riskLevel && typeof riskLevel === "object" && riskLevel.risk) {
    normalizedRiskLevel =
      typeof riskLevel.risk === "string"
        ? riskLevel.risk.toLowerCase()
        : "unknown";
  } else {
    console.error(
      `[PrivacyLens BG] Unexpected risk level structure:`,
      riskLevel
    );
    normalizedRiskLevel = "unknown";
  }

  switch (normalizedRiskLevel) {
    case "high":
      badgeText = "H";
      badgeColor = "#e74c3c"; // Red
      break;
    case "medium":
      badgeText = "M";
      badgeColor = "#f39c12"; // Yellow
      break;
    case "low":
      badgeText = "L";
      badgeColor = "#2ecc71"; // Green
      break;
    case "unknown":
      badgeText = "?";
      badgeColor = "#95a5a6"; // Gray
      break;
    case "error":
      badgeText = "!";
      badgeColor = "#e74c3c"; // Red
      break;
    default:
      badgeText = "?";
      badgeColor = "#95a5a6"; // Gray
      break;
  }

  chrome.action.setBadgeText({ tabId, text: badgeText });
  chrome.action.setBadgeBackgroundColor({ tabId, color: badgeColor });
}

// Report unassessed URL to the service layer
async function reportUnassessedUrl(domain) {
  try {
    // Domain should already be normalized at this point, but let's ensure it
    // Use normalizeUrl instead of getNormalizedDomain to ensure 'www.' is removed
    const normalizedDomain = domain; // Already normalized by normalizeUrl in checkPrivacyAssessment
    console.log(
      `[PrivacyLens BG] Reporting unassessed URL: ${domain}, Normalized: ${normalizedDomain}`
    );

    // Get auth token for API request
    const token = await getAuthToken();
    const headers = {
      "Content-Type": "application/json"
    };
    
    // Add authorization header if token is available
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    await fetchWithRetry(`${API_BASE_URL}/report-unassessed`, {
      method: "POST",
      headers,
      body: JSON.stringify({ url: normalizedDomain }),
    });
  } catch (error) {
    console.error("[PrivacyLens BG] Error reporting unassessed URL:", error);
    // Continue execution even if reporting fails
  }
}

// Export functions for testing
export {
  isValidUrl,
  checkPrivacyAssessment,
  updateIcon,
  reportUnassessedUrl,
  fetchWithRetry,
};
