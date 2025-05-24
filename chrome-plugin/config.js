// config.js (for browser/plugin)
// const PROD_API_BASE_URL = 'https://api.privacy-lens.example.com/api';
const DEV_API_BASE_URL = 'http://localhost:/api';
const PROD_API_BASE_URL = 'http://localhost/api';

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