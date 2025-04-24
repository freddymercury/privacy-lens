// Update management for PrivacyLens Chrome Plugin

import { 
  checkForUpdates, 
  applyUpdate, 
  getUpdateHistory, 
  getDeviceId 
} from './updater.js';

// DOM Elements
const upToDateView = document.getElementById('up-to-date-view');
const updateAvailableView = document.getElementById('update-available-view');
const currentVersionElement = document.getElementById('current-version');
const currentVersionUpdateElement = document.getElementById('current-version-update');
const lastCheckedElement = document.getElementById('last-checked');
const newVersionElement = document.getElementById('new-version');
const updateTypeElement = document.getElementById('update-type');
const updateChangelogElement = document.getElementById('update-changelog');
const checkUpdatesButton = document.getElementById('check-updates-button');
const applyUpdateButton = document.getElementById('apply-update-button');
const backButton = document.getElementById('back-button');
const updateError = document.getElementById('update-error');
const updateSuccess = document.getElementById('update-success');
const loadingIndicator = document.getElementById('loading');
const progressContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');
const changelogContainer = document.getElementById('changelog');

// Current version and update info
const CURRENT_VERSION = '2.0.0';
let latestUpdateInfo = null;

// Initialize update page
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Set current version
    currentVersionElement.textContent = CURRENT_VERSION;
    currentVersionUpdateElement.textContent = CURRENT_VERSION;
    
    // Set last checked date
    const now = new Date();
    lastCheckedElement.textContent = now.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    // Load update history
    await loadUpdateHistory();
    
    // Check for updates on page load
    await checkForUpdatesHandler();
  } catch (error) {
    console.error('[PrivacyLens Update] Error initializing update page:', error);
    showError('Failed to load update information. Please try again later.');
  }
});

// Handle check for updates button click
checkUpdatesButton.addEventListener('click', async () => {
  await checkForUpdatesHandler();
});

// Handle apply update button click
applyUpdateButton.addEventListener('click', async () => {
  await applyUpdateHandler();
});

// Handle back button click
backButton.addEventListener('click', () => {
  window.location.href = 'popup.html';
});

// Check for updates handler
async function checkForUpdatesHandler() {
  clearMessages();
  showLoading(true);
  
  try {
    const deviceId = await getDeviceId();
    const updateInfo = await checkForUpdates(CURRENT_VERSION, deviceId);
    
    // Update last checked date
    const now = new Date();
    lastCheckedElement.textContent = now.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    if (updateInfo.hasUpdate) {
      // Store update info for later use
      latestUpdateInfo = updateInfo;
      
      // Show update available view
      upToDateView.style.display = 'none';
      updateAvailableView.style.display = 'block';
      
      // Update UI with update info
      newVersionElement.textContent = updateInfo.version;
      updateTypeElement.textContent = updateInfo.updateType || 'Regular Update';
      
      // Set changelog
      if (updateInfo.changelog) {
        updateChangelogElement.textContent = updateInfo.changelog;
      } else {
        updateChangelogElement.textContent = 'No changelog available for this update.';
      }
      
      // Show success message
      showSuccess(`Update ${updateInfo.version} is available!`);
    } else {
      // Show up to date view
      upToDateView.style.display = 'block';
      updateAvailableView.style.display = 'none';
      
      // Show success message
      showSuccess('You are using the latest version.');
    }
  } catch (error) {
    console.error('[PrivacyLens Update] Error checking for updates:', error);
    showError('Failed to check for updates. Please try again later.');
  } finally {
    showLoading(false);
  }
}

// Apply update handler
async function applyUpdateHandler() {
  if (!latestUpdateInfo || !latestUpdateInfo.updateId) {
    showError('No update information available. Please check for updates again.');
    return;
  }
  
  clearMessages();
  showLoading(true);
  
  // Show progress bar
  progressContainer.style.display = 'block';
  updateProgressBar(10);
  
  try {
    const deviceId = await getDeviceId();
    
    // Simulate progress updates
    const progressInterval = setInterval(() => {
      const currentWidth = parseInt(progressBar.style.width) || 10;
      if (currentWidth < 90) {
        updateProgressBar(currentWidth + 10);
      }
    }, 500);
    
    // Apply update
    const result = await applyUpdate(latestUpdateInfo.updateId, deviceId);
    
    // Clear progress interval
    clearInterval(progressInterval);
    
    if (result.success) {
      // Complete progress bar
      updateProgressBar(100);
      
      // Show success message
      showSuccess(`Update to version ${result.version} was successful! The extension will reload shortly.`);
      
      // Reload extension after a delay
      setTimeout(() => {
        chrome.runtime.reload();
      }, 3000);
    } else {
      // Reset progress bar
      updateProgressBar(0);
      progressContainer.style.display = 'none';
      
      // Show error message
      showError(result.error || 'Failed to apply update. Please try again later.');
    }
  } catch (error) {
    console.error('[PrivacyLens Update] Error applying update:', error);
    showError('An unexpected error occurred. Please try again.');
    
    // Reset progress bar
    updateProgressBar(0);
    progressContainer.style.display = 'none';
  } finally {
    showLoading(false);
  }
}

// Load update history
async function loadUpdateHistory() {
  try {
    const history = await getUpdateHistory();
    
    // Clear existing changelog items
    changelogContainer.innerHTML = '';
    
    if (history && history.length > 0) {
      // Add history items to changelog
      history.forEach(item => {
        const changelogItem = document.createElement('div');
        changelogItem.className = 'changelog-item';
        
        const versionElement = document.createElement('div');
        versionElement.className = 'changelog-version';
        versionElement.textContent = `Version ${item.version}`;
        
        const dateElement = document.createElement('div');
        dateElement.className = 'changelog-date';
        
        // Format date if available
        if (item.appliedAt) {
          const date = new Date(item.appliedAt);
          dateElement.textContent = date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          });
        } else {
          dateElement.textContent = 'Unknown date';
        }
        
        const notesElement = document.createElement('div');
        notesElement.className = 'changelog-notes';
        notesElement.textContent = item.changelog || 'No changelog available for this update.';
        
        changelogItem.appendChild(versionElement);
        changelogItem.appendChild(dateElement);
        changelogItem.appendChild(notesElement);
        
        changelogContainer.appendChild(changelogItem);
      });
    } else {
      // No history available
      const noHistoryElement = document.createElement('p');
      noHistoryElement.textContent = 'No update history available.';
      changelogContainer.appendChild(noHistoryElement);
    }
  } catch (error) {
    console.error('[PrivacyLens Update] Error loading update history:', error);
    
    // Show error in changelog container
    changelogContainer.innerHTML = '<p>Failed to load update history.</p>';
  }
}

// Update progress bar
function updateProgressBar(percentage) {
  progressBar.style.width = `${percentage}%`;
  progressBar.textContent = `${percentage}%`;
}

// Helper functions
function showError(message) {
  updateError.textContent = message;
  updateError.style.display = 'block';
}

function showSuccess(message) {
  updateSuccess.textContent = message;
  updateSuccess.style.display = 'block';
}

function clearMessages() {
  updateError.style.display = 'none';
  updateSuccess.style.display = 'none';
}

function showLoading(show) {
  if (show) {
    loadingIndicator.style.display = 'block';
    checkUpdatesButton.disabled = true;
    applyUpdateButton.disabled = true;
  } else {
    loadingIndicator.style.display = 'none';
    checkUpdatesButton.disabled = false;
    applyUpdateButton.disabled = false;
  }
}
