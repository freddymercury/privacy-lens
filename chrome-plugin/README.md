# PrivacyLens Chrome Plugin

A Chrome extension that assesses privacy risks of user agreements for popular websites.

## Features

- Automatically detects and analyzes privacy policies of websites you visit
- Displays privacy risk level using badge indicators:
  - "H" (Red): High Risk - Severe privacy concerns (e.g., selling data)
  - "M" (Yellow): Medium Risk - Moderate concerns with potential opt-outs
  - "L" (Green): Low Risk - User-friendly and privacy-conscious
  - "?" (Gray): Unknown Risk - Not explicitly mentioned or uncertain
- Provides detailed breakdown of privacy risks by category
- Reports unassessed websites to the backend for future evaluation

## Installation

### Development Mode

1. Clone this repository
2. Navigate to `chrome://extensions/` in your Chrome browser
3. Enable "Developer mode" (toggle in the top-right corner)
4. Click "Load unpacked" and select the `privacy-guard/chrome-plugin` directory
5. The PrivacyLens extension should now be installed and visible in your extensions list

### Build for Distribution

```bash
npm install
npm run build
```

The built extension will be available in the `dist` directory.

## Usage

1. Click on the PrivacyLens icon in your browser toolbar to see the privacy assessment for the current website
2. The badge indicator shows the overall privacy risk level
3. Detailed information about specific privacy categories is displayed below
4. Use the "Refresh Assessment" button to check for updated assessments
5. Toggle the "Plugin Active" switch to enable/disable the extension

## Configuration

The extension connects to a backend service for privacy assessments through an NGINX proxy. The API endpoints are:

- **Development**: `http://localhost/api` (NGINX proxy routing to Client API on port 3001)
- **Production**: `https://api.privacy-lens.example.com/api`

### API Architecture

The plugin communicates with the PrivacyLens backend through the following architecture:

```
Chrome Plugin → NGINX Proxy (port 80/443) → Client API Process (port 3001)
```

**Routed Endpoints:**
- `/api/auth/*` - Authentication endpoints → Client API
- `/api/assessment` - Assessment queries → Client API  
- `/api/trigger-assessment/*` - Immediate assessments → Client API
- `/api/report-unassessed` - Report unassessed URLs → Client API

### Changing API Configuration

The API base URL is automatically determined based on the environment. To override:

1. Edit the `API_BASE_URL` variables in `config.js`
2. Reload the extension

For development, you can force the plugin to use local endpoints by setting `window.PRIVACY_LENS_DEV = true` in the browser console.

## Development

### Project Structure

- `manifest.json`: Chrome extension configuration
- `background.js`: Background script for URL detection and API communication
- `popup.html/css/js`: UI for the extension popup
- `config.js`: API endpoint configuration
- `icons/`: Extension icons and indicators

### Local Development Setup

1. Start the PrivacyLens backend services:
   ```bash
   npm start  # Starts both Client API (3001) and Backend (3000)
   ```

2. Start NGINX with the development configuration:
   ```bash
   npm run nginx:start
   ```

3. Load the extension in Chrome as an unpacked extension

4. Test the routing:
   ```bash
   npm run nginx:test
   ```

### Testing

```bash
npm test
```

## License

MIT
