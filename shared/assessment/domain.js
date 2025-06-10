/**
 * Domain utility functions for assessment processing
 * Pure functions for domain normalization and validation
 */

/**
 * Pure function to extract effective top-level domain plus one level from hostname
 * @param {string} hostname - The hostname to normalize (e.g., "legal.yahoo.com")
 * @returns {string} The normalized domain (e.g., "yahoo.com")
 */
function getNormalizedDomain(hostname) {
  // If hostname is null or undefined, return empty string
  if (!hostname || typeof hostname !== 'string') {
    return "";
  }

  // Handle IP addresses
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) {
    return hostname;
  }

  // Split the hostname by dots
  const parts = hostname.split(".");

  // If we have 2 or fewer parts, return as is (already a TLD or TLD+1)
  if (parts.length <= 2) {
    return hostname;
  }

  // Handle special cases for known multi-part TLDs
  const knownTLDs = [
    "co.uk",
    "com.au",
    "co.jp",
    "co.kr",
    "org.uk",
    "gov.uk",
    "ac.uk",
    "net.au",
    "org.au",
    "edu.au",
  ];
  
  for (const tld of knownTLDs) {
    if (hostname.endsWith("." + tld)) {
      // Extract the part before the known TLD
      const domainPart = parts[parts.length - 3];
      if (domainPart) {
        return `${domainPart}.${tld}`;
      }
    }
  }

  // Default case: return the last two parts
  return parts.slice(-2).join(".");
}

/**
 * Pure function to normalize a full URL to its base domain
 * @param {string} url - The URL to normalize (e.g., "https://legal.yahoo.com/privacy")
 * @returns {string} The normalized domain (e.g., "yahoo.com")
 */
function normalizeUrl(url) {
  try {
    // Handle null, undefined, or empty strings
    if (!url || typeof url !== 'string') {
      return '';
    }

    // Remove any whitespace
    let normalizedUrl = url.trim();

    // Remove any trailing slashes
    normalizedUrl = normalizedUrl.replace(/\/+$/, '');

    // If the URL doesn't start with http:// or https://, add https://
    if (!normalizedUrl.match(/^https?:\/\//i)) {
      normalizedUrl = "https://" + normalizedUrl;
    }

    // Handle special cases where URL might contain email addresses
    if (normalizedUrl.includes('@')) {
      normalizedUrl = normalizedUrl.split('@')[1];
      if (!normalizedUrl.match(/^https?:\/\//i)) {
        normalizedUrl = "https://" + normalizedUrl;
      }
    }

    // Extract the hostname from the URL and remove 'www.' if present
    const hostname = new URL(normalizedUrl).hostname.replace(/^www\./, '');

    // Get the normalized domain
    return getNormalizedDomain(hostname);
  } catch (error) {
    // If URL is invalid, try to extract domain-like pattern
    try {
      const domainMatch = url.match(/[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}/);
      if (domainMatch) {
        return getNormalizedDomain(domainMatch[0]);
      }
    } catch (e) {
      // Ignore secondary error
    }
    return ''; // Return empty string for invalid URLs
  }
}

/**
 * Pure function to check if a given domain is a Google domain
 * @param {string} url - The URL or domain to check
 * @returns {boolean} True if the domain is a Google domain, false otherwise
 */
function isGoogleDomain(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }
  
  const normalizedDomain = normalizeUrl(url);
  const googleDomains = [
    'google.com',
    'youtube.com',
    'gmail.com',
    'google.co.uk',
    'google.ca',
    'google.fr',
    'google.de',
    'google.es',
    'google.it',
    'google.nl',
    'google.pl',
    'google.ru',
    'google.com.au',
    'google.co.jp',
    'google.co.in',
    'google.com.br',
    'google.com.mx'
  ];

  return googleDomains.some(domain => 
    normalizedDomain === domain || normalizedDomain.endsWith('.' + domain)
  );
}

/**
 * Pure function to check if a domain is a well-known social media platform
 * @param {string} url - The URL or domain to check
 * @returns {boolean} True if the domain is a social media platform
 */
function isSocialMediaDomain(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }
  
  const normalizedDomain = normalizeUrl(url);
  const socialMediaDomains = [
    'facebook.com',
    'twitter.com',
    'x.com',
    'instagram.com',
    'linkedin.com',
    'tiktok.com',
    'snapchat.com',
    'pinterest.com',
    'reddit.com',
    'tumblr.com',
    'discord.com',
    'whatsapp.com',
    'telegram.org'
  ];

  return socialMediaDomains.some(domain => 
    normalizedDomain === domain || normalizedDomain.endsWith('.' + domain)
  );
}

/**
 * Pure function to check if a domain is a major e-commerce platform
 * @param {string} url - The URL or domain to check
 * @returns {boolean} True if the domain is an e-commerce platform
 */
function isEcommerceDomain(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }
  
  const normalizedDomain = normalizeUrl(url);
  const ecommerceDomains = [
    'amazon.com',
    'amazon.co.uk',
    'amazon.ca',
    'amazon.de',
    'amazon.fr',
    'amazon.it',
    'amazon.es',
    'amazon.co.jp',
    'amazon.com.au',
    'amazon.in',
    'ebay.com',
    'etsy.com',
    'shopify.com',
    'walmart.com',
    'target.com',
    'alibaba.com',
    'aliexpress.com'
  ];

  return ecommerceDomains.some(domain => 
    normalizedDomain === domain || normalizedDomain.endsWith('.' + domain)
  );
}

/**
 * Pure function to validate if a domain string is well-formed
 * @param {string} domain - Domain to validate
 * @returns {boolean} True if domain is well-formed
 */
function isValidDomain(domain) {
  if (!domain || typeof domain !== 'string') {
    return false;
  }

  // Basic domain validation regex
  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  
  // Check length constraints
  if (domain.length > 253) {
    return false;
  }
  
  // Check each label length
  const labels = domain.split('.');
  for (const label of labels) {
    if (label.length === 0 || label.length > 63) {
      return false;
    }
  }
  
  return domainRegex.test(domain);
}

/**
 * Pure function to extract base domain from subdomain
 * @param {string} domain - Domain that may include subdomains
 * @returns {string} Base domain without subdomains
 */
function getBaseDomain(domain) {
  if (!domain || typeof domain !== 'string') {
    return '';
  }
  
  return getNormalizedDomain(domain);
}

/**
 * Pure function to check if two domains are related (same base domain)
 * @param {string} domain1 - First domain
 * @param {string} domain2 - Second domain
 * @returns {boolean} True if domains have the same base domain
 */
function areDomainsRelated(domain1, domain2) {
  if (!domain1 || !domain2 || typeof domain1 !== 'string' || typeof domain2 !== 'string') {
    return false;
  }
  
  const base1 = getBaseDomain(domain1);
  const base2 = getBaseDomain(domain2);
  
  return base1 === base2 && base1.length > 0;
}

/**
 * Pure function to categorize domain by type
 * @param {string} url - URL or domain to categorize
 * @returns {Object} Category information
 */
function categorizeDomain(url) {
  if (!url || typeof url !== 'string') {
    return { type: 'unknown', confidence: 0 };
  }
  
  const domain = normalizeUrl(url);
  
  if (isGoogleDomain(url)) {
    return { type: 'google', confidence: 1 };
  }
  
  if (isSocialMediaDomain(url)) {
    return { type: 'social_media', confidence: 1 };
  }
  
  if (isEcommerceDomain(url)) {
    return { type: 'ecommerce', confidence: 1 };
  }
  
  // Check for common patterns
  if (domain.includes('gov.')) {
    return { type: 'government', confidence: 0.8 };
  }
  
  if (domain.includes('edu.') || domain.includes('.edu')) {
    return { type: 'education', confidence: 0.8 };
  }
  
  if (domain.includes('.org')) {
    return { type: 'organization', confidence: 0.6 };
  }
  
  if (domain.includes('.com') || domain.includes('.net')) {
    return { type: 'commercial', confidence: 0.4 };
  }
  
  return { type: 'unknown', confidence: 0 };
}

/**
 * Pure function to generate common privacy policy URL patterns for a domain
 * @param {string} domain - Base domain
 * @returns {Array<string>} Array of possible privacy policy URLs
 */
function generatePrivacyPolicyUrls(domain) {
  if (!domain || typeof domain !== 'string' || !isValidDomain(domain)) {
    return [];
  }
  
  const protocols = ['https', 'http'];
  const subdomains = ['', 'www.'];
  const paths = [
    '/privacy',
    '/privacy/',
    '/privacy-policy',
    '/privacy-policy/',
    '/legal/privacy',
    '/legal/privacy/',
    '/privacy_policy',
    '/privacy_policy/',
    '/terms/privacy',
    '/terms/privacy/',
    '/en/privacy',
    '/en/privacy/',
    '/legal/privacy-notice',
    '/legal/privacy-notice/',
    '/help/privacy-policy',
    '/help/privacy-policy/'
  ];
  
  const urls = [];
  
  for (const protocol of protocols) {
    for (const subdomain of subdomains) {
      for (const path of paths) {
        urls.push(`${protocol}://${subdomain}${domain}${path}`);
      }
    }
  }
  
  return urls;
}

module.exports = {
  // Core domain normalization functions
  getNormalizedDomain,
  normalizeUrl,
  getBaseDomain,
  
  // Domain validation functions
  isValidDomain,
  areDomainsRelated,
  
  // Domain categorization functions
  isGoogleDomain,
  isSocialMediaDomain,
  isEcommerceDomain,
  categorizeDomain,
  
  // URL generation functions
  generatePrivacyPolicyUrls
}; 