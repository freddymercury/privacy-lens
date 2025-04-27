const axios = require('axios');
const { JSDOM } = require('jsdom'); // Using jsdom to parse HTML for verification

// --- Configuration (Should be externalized: config file/env vars) ---
const COMMON_PATHS = [
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
    '/legal/privacy-notice', // Added based on rei.com example
    '/legal/privacy-notice/',
    '/help/privacy-policy', // Added based on rei.com example
    '/help/privacy-policy/',
    // Add non-English paths as needed:
    // '/datenschutz', '/datenschutz/',
    // '/politique-de-confidentialite', '/politique-de-confidentialite/',
];
const COMMON_SUBDOMAINS = ['', 'www.', 'privacy.', 'legal.']; // '' represents the root domain
const REQUEST_TIMEOUT_MS = 5000; // 5 seconds
const MAX_REDIRECTS = 5;
const MIN_CONTENT_LENGTH = 500; // Minimum characters for content verification
const BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'; // Standard User-Agent

// --- Helper Functions ---

/**
 * Attempts to fetch a URL, handling redirects and timeouts.
 * Includes basic SSRF prevention notes.
 * @param {string} url - The URL to check.
 * @returns {Promise<{url: string, status: number, error?: string}|null>} - Final URL and status, or null on critical error.
 */
async function checkUrl(url) {
    console.log(`Checking URL: ${url}`);
    try {
        // TODO: Implement robust SSRF Prevention:
        // 1. Validate URL format strictly.
        // 2. Resolve domain to IP.
        // 3. Check IP against private/reserved ranges (including loopback). Re-check after redirects.
        // 4. Only allow http/https on ports 80/443.

        // Removed custom validateStatus - let axios handle status validation (rejects on non-2xx)
        const response = await axios.get(url, {
            timeout: REQUEST_TIMEOUT_MS,
            maxRedirects: MAX_REDIRECTS,
            // validateStatus: function (status) { // REMOVED
            //     // Accept any status code initially, we'll check it later
            //     return status >= 200 && status < 600;
            // },
            headers: {
                'User-Agent': BROWSER_USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8' // Mimic browser accept header
            },
        });

        // axios automatically follows redirects and returns the final URL in response.request.res.responseUrl
        const finalUrl = response.request?.res?.responseUrl || url; // Fallback to original URL if responseUrl isn't available
        console.log(`  -> Final URL: ${finalUrl}, Status: ${response.status}`);
        return { url: finalUrl, status: response.status };

    } catch (error) {
        // If axios rejects, it's likely a non-2xx status or network error
        console.error(`Error checking URL ${url}: ${error.message}`);
        if (error.response) {
            // Non-2xx status code received
            const finalUrl = error.response.request?.res?.responseUrl || url; // Get final URL if redirect occurred
            console.log(`  -> Final URL: ${finalUrl}, Status: ${error.response.status}`);
            return { url: finalUrl, status: error.response.status, error: error.message };
        } else if (error.request) {
            // Network error (e.g., timeout, DNS resolution failure, connection refused)
            return { url: url, status: 0, error: `Network error: ${error.code || error.message}` }; // Status 0 for network errors
        } else {
            // Setup error or other issue
            return { url: url, status: 0, error: `Request setup error: ${error.message}` };
        }
    }
}

/**
 * Verifies if the content of a URL looks like a privacy policy using heuristics.
 * @param {string} url - The URL to verify.
 * @returns {Promise<{verified: boolean, content: string|null, isPdf: boolean, error?: string}>} - Verification result including content if successful.
 */
async function verifyContent(url) {
    console.log(`Verifying content of: ${url}`);
    const result = { verified: false, content: null, isPdf: false };
    try {
        // TODO: Add SSRF checks here as well if not done in checkUrl or if checkUrl is bypassed.
        const response = await axios.get(url, {
            timeout: REQUEST_TIMEOUT_MS,
            maxRedirects: MAX_REDIRECTS, // Follow redirects again if necessary (though checkUrl should handle most)
            responseType: 'text', // Ensure we get text content
            headers: {
                'User-Agent': BROWSER_USER_AGENT,
                'Accept': 'text/html' // Prioritize HTML for verification
            },
            // Limit download size to prevent abuse
            // maxContentLength: 5 * 1024 * 1024, // Example: 5MB limit (adjust as needed)
        });

        if (response.status >= 200 && response.status < 300) {
            const contentType = response.headers['content-type'] || '';
            const content = response.data;

            // Check for PDF
            if (contentType.includes('application/pdf')) {
                console.log(`  -> Content is PDF. Basic verification passed (URL exists).`);
                // TODO: Implement more robust PDF checks if needed (e.g., text extraction and keyword search)
                result.verified = true;
                result.isPdf = true;
                // We don't have the text content for PDFs easily here
                return result;
            }

            // Heuristics for HTML content
            if (contentType.includes('text/html')) {
                if (!content || content.length < MIN_CONTENT_LENGTH) {
                    console.log(`  -> Verification failed: Content too short (${content?.length || 0} chars).`);
                    result.error = 'Content too short';
                    return result;
                }

                // Use JSDOM to parse HTML and check title/h1
                const dom = new JSDOM(content);
                const title = dom.window.document.querySelector('title')?.textContent || '';
                const h1 = dom.window.document.querySelector('h1')?.textContent || '';
                const bodyText = dom.window.document.body?.textContent?.toLowerCase() || ''; // Get text content for keyword search

                const titleH1Keywords = ['privacy', 'policy', 'daten', 'confidentialité']; // English, German, French
                const bodyKeywords = ['privacy', 'data', 'collect', 'use', 'share', 'cookies', 'personal information', 'rights', 'daten', 'données'];

                const hasTitleH1Keyword = titleH1Keywords.some(kw => title.toLowerCase().includes(kw) || h1.toLowerCase().includes(kw));
                const hasBodyKeyword = bodyKeywords.some(kw => bodyText.includes(kw));

                if (hasTitleH1Keyword && hasBodyKeyword) {
                    console.log(`  -> Verification passed: Found relevant keywords in Title/H1 and Body.`);
                    result.verified = true;
                    result.content = content; // Return the HTML content
                    return result;
                } else {
                     console.log(`  -> Verification failed: Missing required keywords. Title/H1 match: ${hasTitleH1Keyword}, Body match: ${hasBodyKeyword}`);
                     result.error = 'Missing keywords';
                     return result;
                }
            }

            // If not HTML or PDF, verification fails for now
            console.log(`  -> Verification failed: Unsupported content type (${contentType}).`);
            result.error = `Unsupported content type: ${contentType}`;
            return result;
        } else {
            console.log(`  -> Verification failed: Non-2xx status code (${response.status}).`);
            result.error = `Non-2xx status: ${response.status}`;
            return result;
        }
    } catch (error) {
        console.error(`Error verifying content for ${url}: ${error.message}`);
        result.error = `Exception: ${error.message}`;
        return result; // Verification fails on error
    }
}


// --- Main Service Function ---

/**
 * Finds the privacy policy URL and its content for a given normalized domain.
 * @param {string} domain - The normalized domain name (e.g., "example.com").
 * @returns {Promise<{url: string, content: string|null, isPdf: boolean}|null>} - Object with URL and content/PDF status, or null.
 */
async function findPrivacyPolicyUrl(domain) {
    console.log(`Starting privacy policy search for domain: ${domain}`);
    if (!domain || typeof domain !== 'string' || domain.includes('/')) {
        console.error("Invalid domain provided:", domain);
        return null;
    }

    let potentialUrls = [];

    // --- Step 1: Initial Check (Common Paths & Subdomains) ---
    console.log("--- Step 1: Checking common paths ---");
    for (const sub of COMMON_SUBDOMAINS) {
        for (const path of COMMON_PATHS) {
            const urlsToCheck = [
                `https://${sub}${domain}${path}`,
                `http://${sub}${domain}${path}` // HTTP fallback
            ];

            for (const url of urlsToCheck) {
                const result = await checkUrl(url);
                if (result && result.status >= 200 && result.status < 300) {
                    // Check if we already have this final URL (after redirects)
                    if (!potentialUrls.some(p => p.url === result.url)) {
                         potentialUrls.push({
                            url: result.url,
                            priority: calculatePriority(result.url, sub, path) // Prioritize based on path, domain, https
                        });
                    }
                    // If HTTPS worked, don't bother checking HTTP for the same path/subdomain
                    if (url.startsWith('https://')) break;
                } else if (result && result.status === 0) {
                    // Network error, might indicate HTTPS isn't supported, so HTTP check is still relevant
                    continue;
                } else {
                     // Any other non-2xx status OR a network error on HTTPS means this specific URL failed
                     // If HTTPS failed definitively (not a network error like timeout/DNS), skip HTTP check for this path/subdomain.
                     if (url.startsWith('https://') && result.status > 0) {
                         break; // HTTPS failed with a status code, don't try HTTP for this path/sub
                     }
                     // If HTTPS had a network error (status 0), or if this was the HTTP check failing, continue to next path/subdomain.
                     // The 'continue' for status 0 handles the network error case for HTTPS.
                     // If HTTP fails (status > 0 or status 0), we naturally proceed to the next path/subdomain anyway.
                 }
            }
        }
    }

    // Sort potential URLs by priority (lower number is higher priority)
    potentialUrls.sort((a, b) => a.priority - b.priority);

    console.log(`Found ${potentialUrls.length} potential URLs from common paths.`);
    potentialUrls.forEach(p => console.log(`  - ${p.url} (Priority: ${p.priority})`));

    // --- Step 3: Content Verification (for Step 1 results) ---
    console.log("--- Step 3: Verifying content for Step 1 results ---");
    for (const potential of potentialUrls) {
        const verificationResult = await verifyContent(potential.url);
        if (verificationResult.verified) {
            console.log(`Verified successfully: ${potential.url}`);
            return {
                url: potential.url,
                content: verificationResult.content, // May be null for PDF
                isPdf: verificationResult.isPdf
            }; // Return the first verified URL with its content/status
        } else {
            console.log(`Verification failed for ${potential.url}: ${verificationResult.error || 'Heuristics failed'}`);
        }
    }

    console.log("Content verification failed for all URLs found in Step 1.");

    // --- Step 2: Fallback Search (Search Engine - Placeholder) ---
    console.log("--- Step 2: Fallback Search (Placeholder) ---");
    // TODO: Implement fallback search using a Search Engine API (e.g., SerpApi, Google Custom Search)
    // 1. Choose and configure an API client.
    // 2. Construct query: `"privacy policy" site:{domain}`
    // 3. Execute search, handle API errors, rate limits, costs.
    // 4. Parse results, filter by domain, check titles/snippets.
    // 5. Prioritize results.
    // 6. If a promising URL is found, proceed to Step 3 (Content Verification) for that URL.
    //    const searchResultUrl = await searchEngineFallback(domain); // This would return a URL string
    //    if (searchResultUrl) {
    //        const verificationResult = await verifyContent(searchResultUrl);
    //        if (verificationResult.verified) {
    //             console.log(`Verified successfully via fallback search: ${searchResultUrl}`);
    //             return {
    //                 url: searchResultUrl,
    //                 content: verificationResult.content,
    //                 isPdf: verificationResult.isPdf
    //             };
    //        }
    //    }

    console.log(`Privacy policy search failed for domain: ${domain}`);
    // TODO: Log failure to designated audit/operational log.
     // --- Step 2: Fallback Search (Search Engine - Placeholder Call) ---
     console.log("--- Step 2: Attempting Fallback Search ---");
     const fallbackResult = await searchEngineFallback(domain);

     if (fallbackResult) {
         // If fallback finds a URL, verify its content
         console.log("--- Step 3 (Fallback): Verifying content for Step 2 result ---");
         const verificationResult = await verifyContent(fallbackResult.url);
         if (verificationResult.verified) {
             console.log(`Verified successfully via fallback search: ${fallbackResult.url}`);
             return {
                 url: fallbackResult.url,
                 content: verificationResult.content,
                 isPdf: verificationResult.isPdf
             };
         } else {
              console.log(`Fallback URL ${fallbackResult.url} content verification failed: ${verificationResult.error || 'Heuristics failed'}`);
         }
     }

     console.log(`Privacy policy search failed for domain: ${domain} after Step 1 and Fallback.`);
     // TODO: Log failure to designated audit/operational log.
     return null; // Return null if no policy found after all steps
 }


 /**
  * Placeholder function for Step 2: Fallback Search using a Search Engine API.
  * This needs to be implemented with a real API client (e.g., SerpApi, Google Custom Search).
  * @param {string} domain - The normalized domain name.
  * @returns {Promise<{url: string}|null>} - An object with the potential URL found, or null.
  */
 async function searchEngineFallback(domain) {
     console.log(`[Placeholder] searchEngineFallback called for domain: ${domain}`);
     console.log(`[Placeholder] TODO: Implement actual search API call here.`);
     console.log(`[Placeholder] Search Query: "privacy policy" site:${domain}`);
     // Example structure if API call was made:
     // try {
     //   const searchResults = await searchApi.search(`"privacy policy" site:${domain}`);
     //   const prioritizedUrl = parseAndPrioritizeResults(searchResults, domain); // Implement this parsing/prioritization
     //   if (prioritizedUrl) {
     //      console.log(`[Placeholder] Fallback search found potential URL: ${prioritizedUrl}`);
     //      return { url: prioritizedUrl };
     //   } else {
     //      console.log(`[Placeholder] Fallback search did not find a relevant URL.`);
     //      return null;
     //   }
     // } catch (apiError) {
     //    console.error(`[Placeholder] Error during fallback search API call: ${apiError.message}`);
     //    return null;
     // }
     return null; // Returning null as it's just a placeholder
 }


 /**
 * Calculates a priority score for a URL found in Step 1.
 * Lower score = higher priority.
 * @param {string} url - The found URL.
 * @param {string} subdomain - The subdomain used (e.g., "www.", "").
 * @param {string} path - The path used (e.g., "/privacy").
 * @returns {number} Priority score.
 */
function calculatePriority(url, subdomain, path) {
    let score = 100; // Base score

    // Prefer HTTPS
    if (!url.startsWith('https://')) {
        score += 50;
    }

    // Prefer root domain or 'www' over other subdomains
    if (subdomain === '') score -= 10; // Root domain highest priority
    else if (subdomain === 'www.') score -= 5;
    else score += 10; // Other subdomains lower priority

    // Prefer shorter paths
    score += path.length;

    // Prefer paths explicitly containing 'privacy'
    if (!path.toLowerCase().includes('privacy')) {
        score += 20;
    }

    return score;
}


module.exports = {
    findPrivacyPolicyUrl,
    // Export helpers if needed for testing
    _checkUrl: checkUrl,
    _verifyContent: verifyContent,
    _calculatePriority: calculatePriority
};
