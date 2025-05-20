/**
 * Domain Utilities Module for PrivacyLens
 * 
 * This module provides utilities for working with domains and URLs.
 */

import { URL } from 'url';
import punycode from 'punycode';
import { createLogger } from '../config/logger.js';

// Initialize logger
const logger = createLogger('DomainUtils');

/**
 * Extract the domain from a URL
 * @param {string} url - URL to extract domain from
 * @returns {string|null} - Domain or null if invalid URL
 */
export function extractDomain(url) {
  try {
    if (!url) {
      return null;
    }
    
    // Add protocol if missing
    if (!url.includes('://')) {
      url = `https://${url}`;
    }
    
    const parsedUrl = new URL(url);
    return parsedUrl.hostname;
  } catch (error) {
    logger.debug(`Error extracting domain from URL: ${url}`, { error: error.message });
    return null;
  }
}

/**
 * Normalize a domain
 * @param {string} domain - Domain to normalize
 * @returns {string|null} - Normalized domain or null if invalid
 */
export function normalizeDomain(domain) {
  try {
    if (!domain) {
      return null;
    }
    
    // Remove leading/trailing whitespace
    domain = domain.trim();
    
    // Convert to lowercase
    domain = domain.toLowerCase();
    
    // Remove www. prefix
    if (domain.startsWith('www.')) {
      domain = domain.substring(4);
    }
    
    // Handle internationalized domain names
    if (domain.includes('xn--')) {
      try {
        domain = punycode.toUnicode(domain);
      } catch (error) {
        logger.debug(`Error converting punycode domain: ${domain}`, { error: error.message });
      }
    }
    
    return domain;
  } catch (error) {
    logger.debug(`Error normalizing domain: ${domain}`, { error: error.message });
    return null;
  }
}

/**
 * Normalize a URL
 * @param {string} url - URL to normalize
 * @returns {string|null} - Normalized URL or null if invalid
 */
export function normalizeUrl(url) {
  try {
    if (!url) {
      return null;
    }
    
    // Add protocol if missing
    if (!url.includes('://')) {
      url = `https://${url}`;
    }
    
    const parsedUrl = new URL(url);
    
    // Convert hostname to lowercase
    parsedUrl.hostname = parsedUrl.hostname.toLowerCase();
    
    // Remove www. prefix from hostname
    if (parsedUrl.hostname.startsWith('www.')) {
      parsedUrl.hostname = parsedUrl.hostname.substring(4);
    }
    
    // Remove trailing slash from pathname if it's just a slash
    if (parsedUrl.pathname === '/') {
      parsedUrl.pathname = '';
    }
    
    // Remove default ports
    if ((parsedUrl.protocol === 'http:' && parsedUrl.port === '80') ||
        (parsedUrl.protocol === 'https:' && parsedUrl.port === '443')) {
      parsedUrl.port = '';
    }
    
    // Sort query parameters
    if (parsedUrl.search) {
      const searchParams = new URLSearchParams(parsedUrl.search);
      const sortedParams = new URLSearchParams();
      
      // Get all keys and sort them
      const keys = Array.from(searchParams.keys()).sort();
      
      // Add parameters in sorted order
      for (const key of keys) {
        const values = searchParams.getAll(key).sort();
        
        for (const value of values) {
          sortedParams.append(key, value);
        }
      }
      
      parsedUrl.search = sortedParams.toString() ? `?${sortedParams.toString()}` : '';
    }
    
    // Remove hash
    parsedUrl.hash = '';
    
    return parsedUrl.toString();
  } catch (error) {
    logger.debug(`Error normalizing URL: ${url}`, { error: error.message });
    return null;
  }
}

/**
 * Check if a domain is valid
 * @param {string} domain - Domain to check
 * @returns {boolean} - True if valid, false otherwise
 */
export function isValidDomain(domain) {
  try {
    if (!domain) {
      return false;
    }
    
    // Simple domain validation regex
    // This is not perfect but catches most invalid domains
    const domainRegex = /^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
    
    return domainRegex.test(domain);
  } catch (error) {
    logger.debug(`Error validating domain: ${domain}`, { error: error.message });
    return false;
  }
}

/**
 * Check if a URL is valid
 * @param {string} url - URL to check
 * @returns {boolean} - True if valid, false otherwise
 */
export function isValidUrl(url) {
  try {
    if (!url) {
      return false;
    }
    
    // Add protocol if missing
    if (!url.includes('://')) {
      url = `https://${url}`;
    }
    
    new URL(url);
    return true;
  } catch (error) {
    logger.debug(`Error validating URL: ${url}`, { error: error.message });
    return false;
  }
}

/**
 * Get the root domain from a domain
 * @param {string} domain - Domain to get root domain from
 * @returns {string|null} - Root domain or null if invalid
 */
export function getRootDomain(domain) {
  try {
    if (!domain) {
      return null;
    }
    
    // Normalize the domain first
    domain = normalizeDomain(domain);
    
    if (!domain) {
      return null;
    }
    
    // Split the domain by dots
    const parts = domain.split('.');
    
    // If there are only two parts, return the domain as is
    if (parts.length <= 2) {
      return domain;
    }
    
    // Check for known TLDs with subdomains (e.g., co.uk, com.au)
    const knownTlds = [
      'co.uk', 'co.nz', 'co.jp', 'co.kr', 'co.za',
      'com.au', 'com.br', 'com.cn', 'com.mx', 'com.tw'
    ];
    
    const lastTwoParts = `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
    
    if (knownTlds.includes(lastTwoParts)) {
      // If it's a known TLD with subdomains, return the last three parts
      if (parts.length >= 3) {
        return `${parts[parts.length - 3]}.${lastTwoParts}`;
      }
      return domain;
    }
    
    // Otherwise, return the last two parts
    return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
  } catch (error) {
    logger.debug(`Error getting root domain: ${domain}`, { error: error.message });
    return null;
  }
}

/**
 * Compare two domains for equality
 * @param {string} domain1 - First domain
 * @param {string} domain2 - Second domain
 * @returns {boolean} - True if equal, false otherwise
 */
export function domainsEqual(domain1, domain2) {
  try {
    if (!domain1 || !domain2) {
      return false;
    }
    
    // Normalize both domains
    const normalizedDomain1 = normalizeDomain(domain1);
    const normalizedDomain2 = normalizeDomain(domain2);
    
    if (!normalizedDomain1 || !normalizedDomain2) {
      return false;
    }
    
    return normalizedDomain1 === normalizedDomain2;
  } catch (error) {
    logger.debug(`Error comparing domains: ${domain1} and ${domain2}`, { error: error.message });
    return false;
  }
}

/**
 * Compare two URLs for equality
 * @param {string} url1 - First URL
 * @param {string} url2 - Second URL
 * @returns {boolean} - True if equal, false otherwise
 */
export function urlsEqual(url1, url2) {
  try {
    if (!url1 || !url2) {
      return false;
    }
    
    // Normalize both URLs
    const normalizedUrl1 = normalizeUrl(url1);
    const normalizedUrl2 = normalizeUrl(url2);
    
    if (!normalizedUrl1 || !normalizedUrl2) {
      return false;
    }
    
    return normalizedUrl1 === normalizedUrl2;
  } catch (error) {
    logger.debug(`Error comparing URLs: ${url1} and ${url2}`, { error: error.message });
    return false;
  }
}

/**
 * Check if a URL is a subdomain of a domain
 * @param {string} url - URL to check
 * @param {string} domain - Domain to check against
 * @returns {boolean} - True if subdomain, false otherwise
 */
export function isSubdomainOf(url, domain) {
  try {
    if (!url || !domain) {
      return false;
    }
    
    // Extract domain from URL
    const urlDomain = extractDomain(url);
    
    if (!urlDomain) {
      return false;
    }
    
    // Normalize both domains
    const normalizedUrlDomain = normalizeDomain(urlDomain);
    const normalizedDomain = normalizeDomain(domain);
    
    if (!normalizedUrlDomain || !normalizedDomain) {
      return false;
    }
    
    // Check if the URL domain is the same as or ends with the domain
    return normalizedUrlDomain === normalizedDomain ||
           normalizedUrlDomain.endsWith(`.${normalizedDomain}`);
  } catch (error) {
    logger.debug(`Error checking if subdomain: ${url} of ${domain}`, { error: error.message });
    return false;
  }
}

/**
 * Get the path from a URL
 * @param {string} url - URL to get path from
 * @returns {string|null} - Path or null if invalid URL
 */
export function getPathFromUrl(url) {
  try {
    if (!url) {
      return null;
    }
    
    // Add protocol if missing
    if (!url.includes('://')) {
      url = `https://${url}`;
    }
    
    const parsedUrl = new URL(url);
    return parsedUrl.pathname;
  } catch (error) {
    logger.debug(`Error getting path from URL: ${url}`, { error: error.message });
    return null;
  }
}

/**
 * Get query parameters from a URL
 * @param {string} url - URL to get query parameters from
 * @returns {Object|null} - Query parameters or null if invalid URL
 */
export function getQueryParams(url) {
  try {
    if (!url) {
      return null;
    }
    
    // Add protocol if missing
    if (!url.includes('://')) {
      url = `https://${url}`;
    }
    
    const parsedUrl = new URL(url);
    const params = {};
    
    for (const [key, value] of parsedUrl.searchParams.entries()) {
      params[key] = value;
    }
    
    return params;
  } catch (error) {
    logger.debug(`Error getting query parameters from URL: ${url}`, { error: error.message });
    return null;
  }
}

/**
 * Build a URL from components
 * @param {Object} components - URL components
 * @param {string} components.protocol - Protocol (e.g., 'https')
 * @param {string} components.domain - Domain
 * @param {string} components.path - Path
 * @param {Object} components.queryParams - Query parameters
 * @returns {string|null} - Built URL or null if invalid components
 */
export function buildUrl(components) {
  try {
    if (!components || !components.domain) {
      return null;
    }
    
    const protocol = components.protocol || 'https';
    const domain = components.domain;
    const path = components.path || '';
    const queryParams = components.queryParams || {};
    
    // Create URL object
    const url = new URL(`${protocol}://${domain}${path}`);
    
    // Add query parameters
    for (const [key, value] of Object.entries(queryParams)) {
      url.searchParams.append(key, value);
    }
    
    return url.toString();
  } catch (error) {
    logger.debug(`Error building URL from components`, { error: error.message, components });
    return null;
  }
}

/**
 * Ensure a string is a canonical full URL (add https:// if missing, trim, remove trailing slashes)
 * @param {string} url - The input URL or domain
 * @returns {string|null} - The canonical full URL or null if invalid
 */
export function getFullUrl(url) {
  try {
    if (!url) return null;
    let fullUrl = url.trim();
    // Remove trailing slashes
    fullUrl = fullUrl.replace(/\/+$/, '');
    // Add protocol if missing
    if (!/^https?:\/\//i.test(fullUrl)) {
      fullUrl = 'https://' + fullUrl;
    }
    // Validate
    new URL(fullUrl); // Throws if invalid
    return fullUrl;
  } catch (error) {
    logger.debug(`Error in getFullUrl: ${url}`, { error: error.message });
    return null;
  }
}

/**
 * Heuristically determine the policy type from a URL or string
 * @param {string} url - The URL or string to check
 * @returns {string} - 'privacy', 'terms', 'cookie', or 'other'
 */
export function getPolicyType(url) {
  if (!url || typeof url !== 'string') return 'other';
  const lower = url.toLowerCase();
  if (lower.includes('privacy')) return 'privacy';
  if (lower.includes('terms') || lower.includes('tos')) return 'terms';
  if (lower.includes('cookie')) return 'cookie';
  return 'other';
}
