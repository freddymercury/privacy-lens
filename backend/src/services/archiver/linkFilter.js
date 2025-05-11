import axios from 'axios'; // For making HEAD requests
import { linkFilterLogger as logger } from './logger.js';

const DEFAULT_USER_AGENT = 'PrivacyLensBot/1.0 (+https://privacylens.dev)';
const DEFAULT_TIMEOUT = 10000; // 10 seconds for HEAD requests

/**
 * Filters a list of URLs based on size and MIME type.
 * This function makes HEAD requests to determine Content-Length and Content-Type.
 *
 * @param {string[]} urls An array of absolute URLs to filter.
 * @param {object} options Filtering options.
 * @param {string} options.baseHostname The normalized base hostname, for context (e.g. 'example.com').
 * @param {number} [options.maxSizeBytes=2097152] Maximum allowed asset size in bytes (default 2MB).
 * @param {boolean} [options.includePdfs=false] Whether to include PDF files.
 * @param {number} [options.requestDelayMs=500] Delay between HEAD requests to be polite.
 * @param {string} [options.userAgent=DEFAULT_USER_AGENT] User agent for requests.
 * @param {number} [options.timeout=DEFAULT_TIMEOUT] Timeout for HEAD requests.
 * @returns {Promise<string[]>} A promise that resolves to an array of filtered (accepted) URLs.
 */
export async function filterLinks(urls, options = {}) {
  const {
    // baseHostname, // Not strictly needed if linkExtractor already guarantees same-domain
    maxSizeBytes = 2 * 1024 * 1024, // 2MB
    includePdfs = false,
    requestDelayMs = 500,
    userAgent = DEFAULT_USER_AGENT,
    timeout = DEFAULT_TIMEOUT,
  } = options;

  const acceptedUrls = [];
  const allowedMimeTypes = ['text/html'];
  if (includePdfs) {
    allowedMimeTypes.push('application/pdf');
  }

  for (const url of urls) {
    try {
      const response = await axios.head(url, {
        headers: { 'User-Agent': userAgent },
        timeout: timeout,
        maxRedirects: 5, // Follow a few redirects
      });

      // Check 1: Size
      const contentLength = response.headers['content-length'];
      if (contentLength && parseInt(contentLength, 10) > maxSizeBytes) {
        logger.info(`${url} rejected (size ${contentLength} > ${maxSizeBytes})`);
        if (requestDelayMs > 0) await new Promise(resolve => setTimeout(resolve, requestDelayMs));
        continue;
      }

      // Check 2: MIME type
      const contentTypeHeader = response.headers['content-type'];
      if (!contentTypeHeader) {
        logger.info(`${url} rejected (no content-type header)`);
        if (requestDelayMs > 0) await new Promise(resolve => setTimeout(resolve, requestDelayMs));
        continue;
      }

      const mimeType = contentTypeHeader.split(';')[0].trim().toLowerCase();
      const isAllowedMime = allowedMimeTypes.some(allowedType => mimeType === allowedType);

      if (!isAllowedMime) {
        logger.info(`${url} rejected (MIME type ${mimeType} not allowed)`);
        if (requestDelayMs > 0) await new Promise(resolve => setTimeout(resolve, requestDelayMs));
        continue;
      }

      // If all checks pass
      acceptedUrls.push(url);

    } catch (error) {
      // Log error and skip this URL
      let errorMessage = error.message;
      if (error.response) {
        errorMessage = `status ${error.response.status}`;
      } else if (error.request) {
        errorMessage = 'no response received';
      }
      logger.warn(`Error fetching HEAD for ${url} (${errorMessage}). Skipping.`);
    }

    // Delay between requests
    if (requestDelayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, requestDelayMs));
    }
  }

  return acceptedUrls;
}

// Helper function (could be used by main crawler if it has metadata)
export function isAllowedMime(mimeType, includePdfs = false) {
  if (!mimeType) return false;
  const normalizedMime = mimeType.split(';')[0].trim().toLowerCase();
  if (normalizedMime === 'text/html') return true;
  if (includePdfs && normalizedMime === 'application/pdf') return true;
  return false;
}

// Helper function (could be used by main crawler if it has metadata)
export function isAllowedSize(sizeBytes, maxSizeBytes = 2 * 1024 * 1024) {
  if (typeof sizeBytes !== 'number') return true; // If size unknown, tentatively allow
  return sizeBytes <= maxSizeBytes;
}
