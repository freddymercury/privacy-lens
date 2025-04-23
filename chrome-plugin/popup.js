// PrivacyLens Popup Script

// Import utility functions
import { getNormalizedDomain, normalizeUrl } from "./utils.js";
import { 
  getAssessment, 
  updateAssessmentInDB, 
  checkAndInitializeDatabase 
} from "./db.js";
import { 
  isUserPaidTier, 
  hasFeature, 
  initializeUserTier,
  upgradeToPaidTier,
  downgradeToFreeTier
} from "./auth.js";
import {
  transformServerResponse,
  formatCategoryName,
  addSourceInfoToAssessment
} from "./transform.js";

// Check if URL is valid for assessment
function isValidUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === "http:" || urlObj.protocol === "https:";
  } catch (e) {
    return false;
  }
}

// Update the assessment display
function updateAssessmentDisplay(status, message) {
  const riskIndicator = document.getElementById("risk-indicator");
  const riskText = document.getElementById("risk-text");
  const assessmentDetails = document.getElementById("assessment-details");

  // Remove all classes and add the new one
  riskIndicator.className = "risk-indicator " + status;

  // Update indicator content based on status
  switch (status) {
    case "high":
      riskIndicator.textContent = "!";
      break;
    case "medium":
      riskIndicator.textContent = "!";
      break;
    case "low":
      riskIndicator.textContent = "✓";
      break;
    case "unknown":
      riskIndicator.textContent = "?";
      break;
    case "inactive":
      riskIndicator.textContent = "OFF";
      break;
    case "invalid":
      riskIndicator.textContent = "-";
      break;
    case "error":
      riskIndicator.textContent = "X";
      break;
  }

  // Update risk text
  riskText.textContent = message;

  // Clear assessment details
  assessmentDetails.style.display = "none";
  assessmentDetails.innerHTML = "";
}

// Note: formatCategoryName is now imported from transform.js

// Display assessment data
function displayAssessment(assessmentData) {
  // If we have a full database record with metadata, use it
  // Otherwise, assume it's just the assessment part
  const assessment = assessmentData.assessment || assessmentData;
  const metadata = assessmentData.metadata || null;
  
  // Handle different possible structures of the risk level
  let riskLevel;
  if (typeof assessment.riskLevel === "string") {
    riskLevel = assessment.riskLevel.toLowerCase();
  } else if (
    assessment.riskLevel &&
    typeof assessment.riskLevel === "object" &&
    assessment.riskLevel.risk
  ) {
    riskLevel =
      typeof assessment.riskLevel.risk === "string"
        ? assessment.riskLevel.risk.toLowerCase()
        : "unknown";
  } else {
    console.error(
      `[PrivacyLens] Unexpected overall risk level structure:`,
      assessment.riskLevel
    );
    riskLevel = "unknown";
  }

  const categories = assessment.categories || {};

  // Update indicator and text
  let riskMessage;
  switch (riskLevel) {
    case "high":
      riskMessage = "High Risk";
      break;
    case "medium":
      riskMessage = "Medium Risk";
      break;
    case "low":
      riskMessage = "Low Risk";
      break;
    default:
      riskMessage = "Unknown Risk";
      break;
  }

  updateAssessmentDisplay(riskLevel, riskMessage);

  // Display category details
  const assessmentDetails = document.getElementById("assessment-details");
  assessmentDetails.style.display = "block";
  assessmentDetails.innerHTML = "<h3>Risk Categories</h3>";

  const categoryList = document.createElement("div");

  // Add each category
  for (const [category, value] of Object.entries(categories)) {
    const categoryItem = document.createElement("div");
    categoryItem.className = "risk-category";

    // Add risk level class based on category risk
    if (value && value.risk) {
      categoryItem.classList.add(`risk-${value.risk.toLowerCase()}`);
    } else {
      categoryItem.classList.add("risk-unknown");
    }

    const formattedCategory = formatCategoryName(category);
    // Use value.risk if available, otherwise show "undefined"
    const riskLevel = value && value.risk ? value.risk : "undefined";
    categoryItem.textContent = `${formattedCategory}: ${riskLevel}`;

    categoryList.appendChild(categoryItem);
  }

  assessmentDetails.appendChild(categoryList);
  
  // Display data source information if available
  const dataSourceInfo = document.getElementById("data-source-info");
  if (metadata && metadata.source) {
    const sourceDate = new Date(metadata.timestamp).toLocaleDateString();
    let sourceText = "";
    
    if (metadata.source === "prepackaged") {
      sourceText = `Data from pre-packaged database (as of ${sourceDate})`;
    } else if (metadata.source === "server") {
      sourceText = `Data from server (fetched on ${sourceDate})`;
    }
    
    dataSourceInfo.textContent = sourceText;
    dataSourceInfo.style.display = "block";
  } else {
    dataSourceInfo.style.display = "none";
  }
}

// Update the user tier display
async function updateUserTierDisplay() {
  try {
    const isPaid = await isUserPaidTier();
    const tierIndicator = document.getElementById("user-tier-indicator");
    const tierBadge = tierIndicator.querySelector(".tier-badge");
    
    if (isPaid) {
      tierBadge.textContent = "Paid Tier";
      tierBadge.className = "tier-badge paid";
    } else {
      tierBadge.textContent = "Free Tier";
      tierBadge.className = "tier-badge free";
    }
  } catch (error) {
    console.error("[PrivacyLens] Error updating user tier display:", error);
  }
}

// Update UI based on user tier
async function updateUIForUserTier() {
  try {
    const canFetchFromServer = await hasFeature("serverFetch");
    const serverFetchContainer = document.getElementById("server-fetch-container");
    
    if (canFetchFromServer) {
      serverFetchContainer.style.display = "block";
    } else {
      serverFetchContainer.style.display = "none";
    }
    
    await updateUserTierDisplay();
  } catch (error) {
    console.error("[PrivacyLens] Error updating UI for user tier:", error);
  }
}

// Fetch assessment from server and update local database
async function fetchFromServer(domain, tabId) {
  const API_BASE_URL = "http://localhost:3000/api";
  
  try {
    // Verify user has server fetch feature
    const canFetchFromServer = await hasFeature("serverFetch");
    if (!canFetchFromServer) {
      throw new Error("Server fetch feature not available in your tier");
    }
    
    // Query the backend service
    console.log(
      `[PrivacyLens] Fetching from server: ${API_BASE_URL}/assessment?url=${encodeURIComponent(domain)}`
    );
    
    const response = await fetchWithRetry(
      `${API_BASE_URL}/assessment?url=${encodeURIComponent(domain)}`
    );
    const data = await response.json();
    
    if (data.status === "success" && data.assessment) {
      // Transform server response to database format
      const transformedData = transformServerResponse(domain, data);
      
      // Update local database
      await updateAssessmentInDB(transformedData);
      
      // Update badge
      updateBadge(tabId, data.assessment.riskLevel);
      
      console.log(`[PrivacyLens] Server data stored in local database`);
      return transformedData;
    } else {
      throw new Error("Invalid server response or no assessment available");
    }
  } catch (error) {
    console.error("[PrivacyLens] Error fetching from server:", error);
    throw error;
  }
}

// Set up server fetch button
function setupServerFetchButton(domain, tabId) {
  const serverFetchBtn = document.getElementById("server-fetch-btn");
  
  serverFetchBtn.addEventListener("click", async () => {
    // Disable button and show loading state
    serverFetchBtn.disabled = true;
    serverFetchBtn.textContent = "Fetching...";
    
    try {
      // Fetch from server and update local database
      const updatedData = await fetchFromServer(domain, tabId);
      
      // Display updated assessment
      displayAssessment(updatedData);
      
      console.log("[PrivacyLens] Assessment updated from server");
    } catch (error) {
      console.error("[PrivacyLens] Error in server fetch:", error);
      updateAssessmentDisplay("error", "Error fetching from server");
    } finally {
      // Reset button state
      serverFetchBtn.disabled = false;
      serverFetchBtn.textContent = "Fetch from Server";
    }
  });
}

// Export functions for testing
export {
  isValidUrl,
  updateAssessmentDisplay,
  displayAssessment,
  formatCategoryName,
  checkPrivacyAssessment,
  updateUIForUserTier,
  fetchFromServer
};

// Main initialization
if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", async () => {
    try {
      // Initialize database and user tier
      await checkAndInitializeDatabase();
      await initializeUserTier();
      
      // Update UI based on user tier
      await updateUIForUserTier();
      
      // Get DOM elements
      const currentUrlElement = document.getElementById("current-url");
      const riskIndicator = document.getElementById("risk-indicator");
      const riskText = document.getElementById("risk-text");
      const assessmentDetails = document.getElementById("assessment-details");
      const refreshBtn = document.getElementById("refresh-btn");
      const activeToggle = document.getElementById("active-toggle");
      const dataSourceInfo = document.getElementById("data-source-info");

      // Get current tab
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentTab = tabs[0];
      const currentUrl = currentTab.url;

      // Display current URL
      currentUrlElement.textContent = currentUrl;

      // Check if URL is valid for assessment
      if (!isValidUrl(currentUrl)) {
        updateAssessmentDisplay("invalid", "This page cannot be assessed");
        return;
      }

      // Get domain from URL and remove 'www.' prefix
      const fullHostname = new URL(currentUrl).hostname;
      const domain = normalizeUrl(currentUrl); // Use normalizeUrl to ensure 'www.' is removed
      console.log(
        `[PrivacyLens] URL: ${currentUrl}, Hostname: ${fullHostname}, Normalized Domain: ${domain}`
      );

      // Load plugin state from storage
      const storageData = await chrome.storage.local.get(["pluginActive"]);
      const pluginActive = storageData.pluginActive !== false; // Default to true
      activeToggle.checked = pluginActive;

      // If plugin is not active, show inactive state
      if (!pluginActive) {
        updateAssessmentDisplay("inactive", "Plugin is inactive");
        return;
      }

      // Set up server fetch button
      setupServerFetchButton(domain, currentTab.id);

      try {
        // Load assessment data from local database
        const assessmentData = await getAssessment(domain);

        if (assessmentData) {
          // Display assessment data from local database
          displayAssessment(assessmentData);
          console.log("[PrivacyLens] Using assessment from local database");
        } else {
          // No assessment available in local database
          updateAssessmentDisplay("unknown", "No assessment available");
          console.log("[PrivacyLens] No assessment found in local database");
          
          // Don't automatically try to fetch from server here
          // Let the user click the refresh button if they want to check the server
        }
      } catch (dbError) {
        console.error("[PrivacyLens] Error reading from local database:", dbError);
        updateAssessmentDisplay("error", "Error reading local database");
      }

      // Event Listeners

      // Refresh button
      refreshBtn.addEventListener("click", async () => {
        refreshBtn.textContent = "Refreshing...";
        refreshBtn.disabled = true;

        try {
          // First try to get from local database again
          const localData = await getAssessment(domain);
          
          if (localData) {
            // If we have local data, display it
            displayAssessment(localData);
            console.log("[PrivacyLens] Using assessment from local database");
          } else {
            // If no local data, check if user is in paid tier before trying server
            const isPaidTier = await isUserPaidTier();
            
            if (isPaidTier) {
              // Only paid users can fetch from server
              try {
                // Force a new assessment check from server
                const serverData = await checkPrivacyAssessment(currentUrl, currentTab.id);
                
                if (serverData) {
                  // If server fetch successful, display the data
                  displayAssessment(serverData);
                  console.log("[PrivacyLens] Using assessment from server");
                } else {
                  // If server fetch returned null, show unknown
                  updateAssessmentDisplay("unknown", "No assessment available");
                }
              } catch (serverError) {
                console.error("[PrivacyLens] Error fetching from server:", serverError);
                updateAssessmentDisplay("error", "Error fetching from server");
              }
            } else {
              // Free tier users just get "No assessment available"
              console.log("[PrivacyLens] Free tier user - no server fetch attempted");
              updateAssessmentDisplay("unknown", "No assessment available");
            }
          }
        } catch (error) {
          console.error("[PrivacyLens] Error refreshing assessment:", error);
          updateAssessmentDisplay("error", "Error refreshing assessment");
        } finally {
          refreshBtn.textContent = "Refresh Assessment";
          refreshBtn.disabled = false;
        }
      });

      // Active toggle
      activeToggle.addEventListener("change", async () => {
        const isActive = activeToggle.checked;

        // Save plugin state to storage
        await chrome.storage.local.set({ pluginActive: isActive });

        if (isActive) {
          try {
            // First try to get from local database
            const localData = await getAssessment(domain);
            
            if (localData) {
              // If we have local data, display it
              displayAssessment(localData);
              console.log("[PrivacyLens] Using assessment from local database");
            } else {
              // If no local data, check if user is in paid tier before trying server
              const isPaidTier = await isUserPaidTier();
              
              if (isPaidTier) {
                // Only paid users can fetch from server
                try {
                  // If turning on, check for assessment
                  const assessment = await checkPrivacyAssessment(
                    currentUrl,
                    currentTab.id
                  );
  
                  // Reload assessment data from local database
                  const newAssessmentData = await getAssessment(domain);
  
                  if (newAssessmentData) {
                    // Display assessment data
                    displayAssessment(newAssessmentData);
                  } else {
                    // No assessment available
                    updateAssessmentDisplay("unknown", "No assessment available");
                  }
                } catch (serverError) {
                  console.error("[PrivacyLens] Error fetching from server:", serverError);
                  updateAssessmentDisplay("error", "Error fetching from server");
                }
              } else {
                // Free tier users just get "No assessment available"
                console.log("[PrivacyLens] Free tier user - no server fetch attempted");
                updateAssessmentDisplay("unknown", "No assessment available");
              }
            }
          } catch (error) {
            console.error("[PrivacyLens] Error activating plugin:", error);
            updateAssessmentDisplay("error", "Error activating plugin");
          }
        } else {
          // If turning off, show inactive state
          updateAssessmentDisplay("inactive", "Plugin is inactive");
        }
      });
      
      // FOR TESTING: Add buttons to upgrade/downgrade tier (remove in production)
      const settingsDiv = document.querySelector('.settings');
      
      // Create upgrade button
      const upgradeBtn = document.createElement('button');
      upgradeBtn.textContent = 'TEST: Upgrade to Paid';
      upgradeBtn.style.marginTop = '10px';
      upgradeBtn.style.backgroundColor = '#4CAF50';
      upgradeBtn.style.color = 'white';
      upgradeBtn.style.border = 'none';
      upgradeBtn.style.padding = '5px 10px';
      upgradeBtn.style.borderRadius = '4px';
      upgradeBtn.style.cursor = 'pointer';
      upgradeBtn.style.fontSize = '12px';
      
      // Create downgrade button
      const downgradeBtn = document.createElement('button');
      downgradeBtn.textContent = 'TEST: Downgrade to Free';
      downgradeBtn.style.marginTop = '5px';
      downgradeBtn.style.backgroundColor = '#f44336';
      downgradeBtn.style.color = 'white';
      downgradeBtn.style.border = 'none';
      downgradeBtn.style.padding = '5px 10px';
      downgradeBtn.style.borderRadius = '4px';
      downgradeBtn.style.cursor = 'pointer';
      downgradeBtn.style.fontSize = '12px';
      
      // Add event listeners
      upgradeBtn.addEventListener('click', async () => {
        await upgradeToPaidTier(30); // 30 days
        await updateUIForUserTier();
      });
      
      downgradeBtn.addEventListener('click', async () => {
        await downgradeToFreeTier();
        await updateUIForUserTier();
      });
      
      // Add buttons to the DOM
      settingsDiv.appendChild(upgradeBtn);
      settingsDiv.appendChild(downgradeBtn);
      
    } catch (error) {
      console.error("[PrivacyLens] Error in popup initialization:", error);
      updateAssessmentDisplay("error", "Error initializing plugin");
    }
  });
}

// Update the extension badge based on risk level
function updateBadge(tabId, riskLevel) {
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
    console.error(`[PrivacyLens] Unexpected risk level structure:`, riskLevel);
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

// Fetch with timeout and retry
async function fetchWithRetry(url, options = {}, retries = 2, timeout = 5000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  options.signal = controller.signal;

  try {
    const response = await fetch(url, options);
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (retries <= 0) throw error;

    console.log(
      `[PrivacyLens] Retrying fetch to ${url}, ${retries} retries left`
    );
    // Wait a bit before retrying (exponential backoff)
    await new Promise((resolve) => setTimeout(resolve, 1000 * (3 - retries)));
    return fetchWithRetry(url, options, retries - 1, timeout);
  }
}

// Query the service layer for privacy assessment and update local database
// This should ONLY be called for paid tier users
async function checkPrivacyAssessment(url, tabId) {
  const API_BASE_URL = "http://localhost:3000/api"; // Should match background.js

  try {
    // First check if user is in paid tier
    const isPaidTier = await isUserPaidTier();
    if (!isPaidTier) {
      console.log("[PrivacyLens] Server fetch attempted by free tier user - not allowed");
      throw new Error("Server fetch is only available for paid tier users");
    }
    // Extract domain from URL for assessment lookup and remove 'www.' prefix
    const fullHostname = new URL(url).hostname;
    const domain = normalizeUrl(url); // Use normalizeUrl to ensure 'www.' is removed
    console.log(
      `[PrivacyLens] Checking assessment for domain: ${fullHostname}, Normalized: ${domain}`
    );

    // Query the backend service
    console.log(
      `[PrivacyLens] Fetching from: ${API_BASE_URL}/assessment?url=${encodeURIComponent(
        domain
      )}`
    );
    const response = await fetchWithRetry(
      `${API_BASE_URL}/assessment?url=${encodeURIComponent(domain)}`
    );
    const data = await response.json();
    console.log(`[PrivacyLens] Assessment API response:`, data);

    if (data.status === "success") {
      if (data.assessment) {
        console.log(
          `[PrivacyLens] Assessment found with risk level: ${data.assessment.riskLevel}`
        );
        
        // Transform server response to database format
        const transformedData = transformServerResponse(domain, data);
        
        // Update local database
        await updateAssessmentInDB(transformedData);
        
        // Update badge
        updateBadge(tabId, data.assessment.riskLevel);
        
        console.log(`[PrivacyLens] Assessment stored in local database`);
        return transformedData;
      } else {
        console.log(
          `[PrivacyLens] No assessment available for ${domain}, reporting as unassessed`
        );
        // No assessment available
        updateBadge(tabId, "unknown");

        // Report URL for future assessment
        console.log(`[PrivacyLens] Reporting ${domain} as unassessed`);
        const reportResponse = await fetchWithRetry(
          `${API_BASE_URL}/report-unassessed`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ url: domain }),
          }
        );
        const reportData = await reportResponse.json();
        console.log(`[PrivacyLens] Report unassessed response:`, reportData);

        // Immediately trigger assessment for this URL
        try {
          console.log(
            `[PrivacyLens] Triggering immediate assessment for ${domain}`
          );
          const triggerResponse = await fetchWithRetry(
            `${API_BASE_URL}/trigger-assessment/${encodeURIComponent(domain)}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
            }
          );

          const triggerData = await triggerResponse.json();
          console.log(
            `[PrivacyLens] Trigger assessment response:`,
            triggerData
          );

          if (triggerData.status === "success" && triggerData.assessment) {
            console.log(
              `[PrivacyLens] Immediate assessment successful with risk level: ${triggerData.assessment.riskLevel}`
            );
            
            // Transform server response to database format
            const transformedData = transformServerResponse(domain, triggerData);
            
            // Update local database
            await updateAssessmentInDB(transformedData);
            
            // Update badge
            updateBadge(tabId, triggerData.assessment.riskLevel);
            
            console.log(
              `[PrivacyLens] Immediate assessment stored in local database`
            );
            return transformedData;
          } else {
            console.log(
              `[PrivacyLens] Immediate assessment did not return an assessment object`
            );
          }
        } catch (triggerError) {
          console.error(
            "[PrivacyLens] Error triggering assessment:",
            triggerError
          );
        }

        return null;
      }
    } else {
      console.error(`[PrivacyLens] Error in API response:`, data);
      // Error in API response
      updateBadge(tabId, "error");
      return null;
    }
  } catch (error) {
    console.error("[PrivacyLens] Error checking privacy assessment:", error);
    updateBadge(tabId, "error");
    return null;
  }
}
