import { JSDOM } from 'jsdom';
import psl from 'psl'; // Using psl for registrable domain check
import { linkExtractorLogger as logger } from './logger.js';

/**
 * Extracts candidate policy links from HTML content.
 *
 * @param {string} html The HTML content of the page.
 * @param {string} baseHostname The normalized base hostname of the root policy page (e.g., 'example.com').
 * @param {string} currentUrl The URL from which the HTML was fetched, used to resolve relative links.
 * @param {RegExp} keywordRegex A regex to match keywords in link text or hrefs (e.g., /(privacy|policy|dpa|gdpr|ccpa|cookies|terms)/i).
 * @param {object} options Optional parameters.
 * @param {number} [options.maxLinksPerPage=20] Maximum number of links to extract from a single page.
 * @returns {string[]} An array of absolute URLs that are candidates for being sub-documents.
 */
export function extractPolicyLinks(html, baseHostname, currentUrl, keywordRegex, options = {}) {
  const { maxLinksPerPage = 20 } = options;
  const links = [];
  if (!html || !baseHostname || !currentUrl) {
    return links;
  }

  const dom = new JSDOM(html, { url: currentUrl });
  const document = dom.window.document;
  const anchorElements = document.querySelectorAll('a[href]');

  const baseUrl = new URL(currentUrl);

  for (const anchor of anchorElements) {
    if (links.length >= maxLinksPerPage) {
      break;
    }

    let href = anchor.getAttribute('href');
    if (!href) {
      continue;
    }

    // Resolve the URL (handles relative paths)
    let absoluteUrl;
    try {
      absoluteUrl = new URL(href, baseUrl).toString();
    } catch (e) {
      // Invalid URL, skip
      logger.warn(`Invalid URL encountered in linkExtractor: ${href} on page ${currentUrl}`);
      continue;
    }

    // Check 1: Same registrable domain
    // The hostname of the absolute URL must belong to the same base registrable domain.
    let linkHostname;
    try {
      linkHostname = new URL(absoluteUrl).hostname;
    } catch (e) {
      logger.warn(`Could not parse hostname from absolute URL: ${absoluteUrl}`);
      continue;
    }

    const linkBaseDomain = psl.get(linkHostname);
    const pageBaseDomain = psl.get(baseHostname); // baseHostname is already normalized, but psl.get is idempotent

    if (linkBaseDomain !== pageBaseDomain) {
      continue; // Not the same registrable domain
    }

    // Check 2: Matches keyword regex in href or link text
    const linkText = anchor.textContent || '';
    if (keywordRegex.test(absoluteUrl) || keywordRegex.test(linkText)) {
      // Ensure we don't add duplicates from the same page
      if (!links.includes(absoluteUrl)) {
        links.push(absoluteUrl);
      }
    }
  }
  return links;
}
