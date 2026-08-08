// config.js (for browser/plugin)
// NOTE: api.privacy-lens.example.com is a placeholder until the production API
// is deployed and DNS is pointed. It matches manifest.json host_permissions.
// For local dev, set window.PRIVACY_LENS_DEV = true in the popup console (see README).
const PROD_API_BASE_URL = 'https://api.privacy-lens.example.com/api';
const DEV_API_BASE_URL = 'http://localhost/api';

let API_BASE_URL = PROD_API_BASE_URL;
if (typeof window !== 'undefined') {
  if (window.location.hostname === 'localhost' || window.PRIVACY_LENS_DEV) {
    API_BASE_URL = DEV_API_BASE_URL;
  }
}
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
  // Optionally, check for your dev extension id here and set API_BASE_URL = DEV_API_BASE_URL;
}

export { API_BASE_URL }; 