// config.node.js (for Node.js scripts)
// NOTE: api.privacy-lens.example.com is a placeholder until the production API
// is deployed and DNS is pointed (see docs/deployment.md).
const PROD_API_BASE_URL = 'https://api.privacy-lens.example.com/api';
const DEV_API_BASE_URL = 'http://localhost:3000/api';

let API_BASE_URL = PROD_API_BASE_URL;
if (typeof process !== 'undefined' && process.env && process.env.PRIVACY_LENS_DEV) {
  API_BASE_URL = DEV_API_BASE_URL;
}

module.exports = { API_BASE_URL }; 