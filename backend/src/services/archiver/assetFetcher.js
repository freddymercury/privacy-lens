import axios from 'axios';
import axiosRetry from 'axios-retry';
import mime from 'mime-types'; // For determining MIME type if not in header

const DEFAULT_USER_AGENT = 'PrivacyLensBot/1.0 (+https://privacylens.dev)';
const DEFAULT_TIMEOUT = 15000; // 15 seconds for GET requests
const MAX_RETRIES = parseInt(process.env.ASSET_FETCHER_MAX_RETRIES, 10) || 5; // Increased from 3 to 5
const RETRY_DELAY_BASE = parseInt(process.env.ASSET_FETCHER_RETRY_DELAY_BASE, 10) || 1000; // Base delay in ms

// List of alternative user agents to try if the default one is blocked
const ALTERNATIVE_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36'
];

// Configure axios instance with enhanced retry logic
const axiosInstance = axios.create();
axiosRetry(axiosInstance, {
  retries: MAX_RETRIES,
  retryDelay: (retryCount) => {
    // Exponential backoff with jitter
    const delay = Math.min(RETRY_DELAY_BASE * Math.pow(2, retryCount - 1), 30000); // Cap at 30 seconds
    const jitter = delay * 0.2 * Math.random(); // Add up to 20% jitter
    return delay + jitter;
  },
  retryCondition: (error) => {
    // Enhanced retry condition logic
    // Retry on network errors, 5xx server errors, and specific 4xx errors that might be temporary
    return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
           (error.response && error.response.status >= 500) ||
           (error.response && [429, 408, 425].includes(error.response.status)) || // Too Many Requests, Request Timeout, Too Early
           (error.code === 'ECONNABORTED'); // Timeout errors
  },
  onRetry: (retryCount, error, requestConfig) => {
    // Log retry attempts
    console.log(`AssetFetcher: Retry ${retryCount}/${MAX_RETRIES} for ${requestConfig.url} - Reason: ${error.message || 'Unknown error'}`);
    
    // On second retry, try with a different user agent if available
    if (retryCount === 2 && ALTERNATIVE_USER_AGENTS.length > 0) {
      const altUserAgent = ALTERNATIVE_USER_AGENTS[Math.floor(Math.random() * ALTERNATIVE_USER_AGENTS.length)];
      console.log(`AssetFetcher: Trying alternative user agent for ${requestConfig.url}`);
      requestConfig.headers['User-Agent'] = altUserAgent;
    }
  }
});

/**
 * Fetches the content of an asset (HTML, PDF, etc.) from a given URL.
 *
 * @param {string} url The URL of the asset to fetch.
 * @param {object} options Fetching options.
 * @param {string} [options.userAgent=DEFAULT_USER_AGENT] User agent for the request.
 * @param {number} [options.timeout=DEFAULT_TIMEOUT] Timeout for the request in milliseconds.
 * @param {number} [options.maxSizeBytes=5242880] Maximum allowed asset size in bytes (default 5MB for GET).
 * @returns {Promise<{rawBody: string|Buffer, finalUrl: string, mimeType: string, bytes: number, error?: string}>}
 *          An object containing the asset's raw body (string for text, Buffer for binary),
 *          its final URL after redirects, detected MIME type, size in bytes.
 *          Includes an error message if fetching failed.
 */
export async function fetchAsset(url, options = {}) {
  const {
    userAgent = DEFAULT_USER_AGENT,
    timeout = DEFAULT_TIMEOUT,
    maxSizeBytes = 5 * 1024 * 1024, // 5MB default for full GET
  } = options;

  try {
    const response = await axiosInstance.get(url, {
      headers: {
        'User-Agent': userAgent,
        // Keep locale deterministic so identical content hashes identically
        // across crawls (geo/accept-language variants otherwise churn versions)
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: timeout,
      responseType: 'arraybuffer', // Fetch as arraybuffer to handle binary data (like PDFs) and text
      maxRedirects: 5,
      maxContentLength: maxSizeBytes, // Enforce max size at axios level
    });

    const rawBody = Buffer.from(response.data);
    const bytes = rawBody.length;

    if (bytes > maxSizeBytes) {
        return {
            rawBody: null,
            finalUrl: response.request.res.responseUrl || url,
            mimeType: null,
            bytes: bytes,
            error: `Asset size ${bytes} exceeds maximum ${maxSizeBytes} bytes.`
        };
    }

    let mimeType = response.headers['content-type'] ? response.headers['content-type'].split(';')[0].trim().toLowerCase() : null;

    // If content-type is missing or generic, try to guess from URL extension
    if (!mimeType || mimeType === 'application/octet-stream') {
        const guessedMime = mime.lookup(response.request.res.responseUrl || url);
        if (guessedMime) {
            mimeType = guessedMime;
        }
    }
    // If still no mimeType, and it looks like text, default to text/plain
    // This is a basic check; more sophisticated sniffing might be needed if issues arise
    if (!mimeType) {
        const isText = !rawBody.subarray(0, 1024).includes(0); // Check for null bytes in first 1KB
        if (isText) mimeType = 'text/plain';
    }


    // For text-based content (HTML, plain text), convert buffer to string.
    // For PDFs or other binary, keep as buffer.
    let processedBody = rawBody;
    if (mimeType && (mimeType.startsWith('text/') || mimeType === 'application/json' || mimeType === 'application/xml')) {
        processedBody = rawBody.toString('utf-8');
    }


    return {
      rawBody: processedBody,
      finalUrl: response.request.res.responseUrl || url, // URL after redirects
      mimeType: mimeType,
      bytes: bytes,
    };

  } catch (error) {
    let errorMessage = error.message;
    let finalUrl = url;
    let errorDetails = {};
    
    // Enhanced error diagnostics
    if (error.response) {
      // Server responded with a status code outside of 2xx range
      errorMessage = `status ${error.response.status}`;
      finalUrl = error.request.res?.responseUrl || url;
      errorDetails = {
        status: error.response.status,
        statusText: error.response.statusText,
        headers: error.response.headers,
        data: error.response.data ? (typeof error.response.data === 'string' ? error.response.data.substring(0, 200) : 'Binary data') : null
      };
    } else if (error.request) {
      // Request was made but no response received
      errorMessage = 'no response received or network error';
      errorDetails = {
        code: error.code,
        errno: error.errno,
        syscall: error.syscall,
        address: error.address,
        port: error.port,
        config: {
          timeout: error.config?.timeout,
          method: error.config?.method,
          headers: error.config?.headers
        }
      };
    } else {
      // Error setting up the request
      errorDetails = {
        name: error.name,
        stack: error.stack?.substring(0, 500)
      };
    }
    
    if (error.code === 'ERR_BAD_REQUEST' && error.message.includes('maxContentLength')) {
      errorMessage = `Asset size exceeds maximum ${maxSizeBytes} bytes (axios error).`;
    }
    
    // Log detailed error information
    console.warn(`AssetFetcher: Error fetching ${url} (${errorMessage}).`);
    console.debug(`AssetFetcher: Detailed error for ${url}:`, JSON.stringify(errorDetails, null, 2));
    
    return {
      rawBody: null,
      finalUrl: finalUrl,
      mimeType: null,
      bytes: 0,
      error: errorMessage,
      errorDetails: errorDetails // Include detailed error information for debugging
    };
  }
}

/**
 * Checks if a URL is accessible by making a HEAD request.
 * This can be used to pre-check URLs before attempting full fetches.
 * 
 * @param {string} url The URL to check
 * @param {object} options Options for the request
 * @returns {Promise<{accessible: boolean, status?: number, error?: string}>}
 */
export async function checkUrlAccessibility(url, options = {}) {
  const {
    userAgent = DEFAULT_USER_AGENT,
    timeout = DEFAULT_TIMEOUT / 2, // Use shorter timeout for HEAD requests
  } = options;

  try {
    const response = await axiosInstance.head(url, {
      headers: { 'User-Agent': userAgent },
      timeout: timeout,
      maxRedirects: 5,
    });
    
    return {
      accessible: true,
      status: response.status,
      contentType: response.headers['content-type'],
      contentLength: response.headers['content-length']
    };
  } catch (error) {
    let errorMessage = error.message;
    let status = null;
    
    if (error.response) {
      status = error.response.status;
      // Some servers don't support HEAD requests but might support GET
      if (status === 405) { // Method Not Allowed
        return { accessible: true, status, error: 'HEAD not supported, but URL might be accessible via GET' };
      }
      errorMessage = `status ${status}`;
    } else if (error.request) {
      errorMessage = 'no response received or network error';
    }
    
    return {
      accessible: false,
      status,
      error: errorMessage
    };
  }
}
