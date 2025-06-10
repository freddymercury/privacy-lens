// config.node.js (for Node.js scripts)
// const PROD_API_BASE_URL = 'https://api.privacy-lens.example.com/api';
const DEV_API_BASE_URL = 'http://localhost/api';
const PROD_API_BASE_URL = 'http://localhost/api';

let API_BASE_URL = PROD_API_BASE_URL;
if (typeof process !== 'undefined' && process.env && process.env.PRIVACY_LENS_DEV) {
  API_BASE_URL = DEV_API_BASE_URL;
}

module.exports = { API_BASE_URL }; 