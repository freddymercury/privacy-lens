import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { JSDOM } from 'jsdom'; // Using jsdom to parse HTML for verification
// import { getJson } from "serpapi"; // No longer using serpapi library directly

// Setup dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// --- Configuration (Should be externalized: config file/env vars) ---
const SERPAPI_ENDPOINT = 'https://serpapi.com/search'; // SerpApi endpoint URL
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
// Updated User-Agent to a more recent Chrome version
const BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Common headers to mimic a browser
const COMMON_HEADERS = {
    'User-Agent': BROWSER_USER_AGENT,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"macOS"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
};

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
            headers: COMMON_HEADERS, // Use common headers
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
            headers: { // Use common headers but prioritize text/html for Accept
                ...COMMON_HEADERS,
                'Accept': 'text/html',
                'Sec-Fetch-Site': 'cross-site', // Adjust fetch site if verifying content from a different origin than initial check
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
 * @param {string[]} [suggestedUrls=[]] - Optional array of suggested policy URLs to try first.
 * @returns {Promise<{url: string, content: string|null, isPdf: boolean}|null>} - Object with URL and content/PDF status, or null.
 */
async function findPrivacyPolicyUrl(domain, suggestedUrls = []) {
    const serpApiKey = process.env.SERPAPI_API_KEY;
    // Add debug log for API key
    console.log(`[PolicyFinder] Loaded SERPAPI_API_KEY: ${serpApiKey ? '******' + serpApiKey.slice(-4) : 'Not Found'}`);
    if (!serpApiKey) {
        console.warn("[PolicyFinder] SERPAPI_API_KEY not found in environment variables. Fallback search will be skipped.");
    }

    console.log(`[PolicyFinder] Starting privacy policy search for domain: ${domain}. Received suggestedUrls: ${JSON.stringify(suggestedUrls)}`);

    // Check if suggestedUrls is a valid, non-empty array before proceeding
    if (Array.isArray(suggestedUrls) && suggestedUrls.length > 0) {
        console.log(`[PolicyFinder] Attempting suggested URLs first: ${suggestedUrls.join(', ')}`);
        for (const suggestedUrl of suggestedUrls) {
            if (!suggestedUrl || typeof suggestedUrl !== 'string' || !suggestedUrl.trim()) {
                console.warn(`[PolicyFinder] Invalid or empty suggested URL skipped: '${suggestedUrl}'`);
                continue;
            }
            console.log(`[PolicyFinder] --- Checking Suggested URL: ${suggestedUrl} ---`);
            // We can directly use checkUrl and verifyContent for suggested URLs
            // as they are expected to be full URLs.
            const checkResult = await checkUrl(suggestedUrl);
            if (checkResult && checkResult.status >= 200 && checkResult.status < 300) {
                const verificationResult = await verifyContent(checkResult.url); // Use final URL from checkResult
                if (verificationResult.verified) {
                    console.log(`[PolicyFinder] Verified successfully (from suggested URL): ${checkResult.url}`);
                    return {
                        url: checkResult.url,
                        content: verificationResult.content,
                        isPdf: verificationResult.isPdf
                    };
                } else {
                    console.log(`[PolicyFinder] Suggested URL ${checkResult.url} content verification failed: ${verificationResult.error || 'Heuristics failed'}`);
                }
            } else {
                console.log(`[PolicyFinder] Suggested URL ${suggestedUrl} check failed or returned non-2xx status: ${checkResult?.status} - ${checkResult?.error}`);
            }
        }
        console.log("[PolicyFinder] --- Finished checking suggested URLs. None verified or all failed. Proceeding to standard search. ---");
    } else {
        console.log("[PolicyFinder] No valid suggested URLs provided or array is empty. Proceeding to standard search.");
    }

    if (!domain || typeof domain !== 'string' || domain.includes('/')) {
        console.error("[PolicyFinder] Invalid domain provided for standard search:", domain);
        // If suggested URLs were provided and failed, we might still want to return null
        // or proceed if domain is valid for common path/fallback search.
        // For now, if domain is invalid, we stop.
        return null;
    }

    let potentialUrls = [];

    // --- Step 1: Initial Check (Common Paths & Subdomains) ---
    // This is now effectively Step 2 if suggested URLs were processed
    console.log("[PolicyFinder] --- Step 1 (Standard Search): Checking common paths ---");
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

     // --- Step 2: Fallback Search (Search Engine) --- // Removed Placeholder comment
     // TODO: Refine fallback search logic (e.g., better prioritization, handling different search engine structures)
     // 1. Consider alternative search engines or APIs if SerpApi is unreliable/costly.
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
     // --- Step 2: Fallback Search (Search Engine) ---
     console.log("--- Step 2: Attempting Fallback Search ---");
     const fallbackResult = serpApiKey ? await searchEngineFallback(domain, serpApiKey) : null;

     if (fallbackResult && fallbackResult.url) {
         // If fallback finds a URL, verify its content
         // Ensure the URL is absolute
         let absoluteFallbackUrl = fallbackResult.url;
         try {
             const parsedUrl = new URL(absoluteFallbackUrl);
             if (!parsedUrl.protocol) {
                 // Attempt to fix relative URLs (though SerpApi usually returns absolute)
                 console.warn(`Fallback URL ${absoluteFallbackUrl} seems relative. Attempting to make absolute using https://${domain}`);
                 absoluteFallbackUrl = `https://${domain}${absoluteFallbackUrl.startsWith('/') ? '' : '/'}${absoluteFallbackUrl}`;
             }
         } catch (e) {
             console.error(`Error parsing fallback URL ${absoluteFallbackUrl}: ${e.message}. Skipping verification.`);
             absoluteFallbackUrl = null; // Invalidate URL if parsing fails
         }

         if (absoluteFallbackUrl) {
             console.log("--- Step 3 (Fallback): Verifying content for Step 2 result ---");
             const verificationResult = await verifyContent(absoluteFallbackUrl);
             if (verificationResult.verified) {
                 console.log(`Verified successfully via fallback search: ${absoluteFallbackUrl}`);
                 return {
                     url: absoluteFallbackUrl,
                     content: verificationResult.content,
                     isPdf: verificationResult.isPdf
                 };
             } else {
                 console.log(`Fallback URL ${absoluteFallbackUrl} content verification failed: ${verificationResult.error || 'Heuristics failed'}`);
             }
         }
     } else if (fallbackResult && fallbackResult.error) {
         console.log(`Fallback search failed: ${fallbackResult.error}`);
     } else if (!serpApiKey) {
         console.log("Fallback search skipped due to missing API key.");
     } else {
         // This 'else' covers the case where fallbackResult was null (meaning SerpApi found no relevant URL or an error occurred before returning a URL object)
         // and an API key was present. The specific reason (no results vs. API error) is logged within searchEngineFallback or the preceding 'else if'.
         console.log("Fallback search did not yield a verifiable URL.");
     }
     // If we reach here, it means either:
     // - Step 1 found URLs, but none verified.
     // - Step 1 found no URLs AND:
     //   - Fallback search was skipped (no API key).
     //   - Fallback search failed with an error.
     //   - Fallback search succeeded but found no relevant/verifiable URL.
     //   - Fallback search found a URL, but it failed verification.

     console.log(`Privacy policy search failed for domain: ${domain} after Step 1 and Fallback.`);
     // TODO: Log failure to designated audit/operational log.
     return null; // Return null if no policy found after all steps
 }


 /**
  * Performs a fallback search using the SerpApi Google Search API.
  * @param {string} domain - The normalized domain name.
  * @param {string} apiKey - The SerpApi API key.
 * @returns {Promise<{url: string}|{error: string}|null>} - An object with the URL, an error object, or null if no relevant result found.
 */
async function searchEngineFallback(domain, apiKey) {
    const query = `"privacy policy" site:${domain}`;
    console.log(`[SerpApi/Axios] Performing fallback search for domain: ${domain}`);
    console.log(`[SerpApi/Axios] Search Query: ${query}`);
    console.log(`[SerpApi/Axios] Using API Key ending in: ${apiKey ? apiKey.slice(-4) : 'N/A'}`);

    const params = {
        q: query,
        api_key: apiKey,
        num: 5, // Request top 5 results
        engine: 'google' // Specify Google engine
    };

    try {
        console.log(`[SerpApi/Axios] Making GET request to ${SERPAPI_ENDPOINT} with params:`, params);
        // Use axios.get with params object - axios handles URL encoding
        const response = await axios.get(SERPAPI_ENDPOINT, {
            params: params,
            timeout: REQUEST_TIMEOUT_MS + 5000 // Slightly longer timeout for external API
        });

        console.log(`[SerpApi/Axios] Request successful (Status: ${response.status}). Response data snippet:`, JSON.stringify(response.data).substring(0, 200));

        const responseData = response.data;

        // Check for API-level errors reported in the response body
        if (responseData && responseData.error) {
            console.error(`[SerpApi/Axios] API Error reported in response: ${responseData.error}`);
            return { error: `SerpApi API Error: ${responseData.error}` };
        }

        // Check for organic results
        if (responseData && responseData.organic_results && responseData.organic_results.length > 0) {
            // Prioritize results (same logic as before)
            for (const result of responseData.organic_results) {
                const title = result.title?.toLowerCase() || '';
                const link = result.link;
                const snippet = result.snippet?.toLowerCase() || '';

                if (link && typeof link === 'string' && (title.includes('privacy') || title.includes('policy') || snippet.includes('privacy') || snippet.includes('policy'))) {
                    console.log(`[SerpApi/Axios] Found potential URL: ${link} (Title: ${result.title})`);
                    try {
                        const resultDomain = new URL(link).hostname;
                        if (resultDomain === domain || resultDomain.endsWith('.' + domain)) {
                            console.log(`[SerpApi/Axios] Prioritized URL (matches domain): ${link}`);
                            return { url: link };
                        } else {
                            console.log(`[SerpApi/Axios] Skipping URL ${link} - domain mismatch (${resultDomain} vs ${domain})`);
                        }
                    } catch (e) {
                        console.warn(`[SerpApi/Axios] Could not parse URL ${link}: ${e.message}`);
                    }
                }
            }
            console.log(`[SerpApi/Axios] No relevant URL found in top ${responseData.organic_results.length} results matching domain criteria.`);
            return null;
        } else {
            console.log("[SerpApi/Axios] No organic results found in response.");
            return null;
        }

    } catch (error) {
        console.error(`[SerpApi/Axios] Caught error during axios GET request.`);
        if (error.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            console.error('[SerpApi/Axios] Error Status:', error.response.status);
            console.error('[SerpApi/Axios] Error Data:', error.response.data);
            return { error: `SerpApi request failed with status ${error.response.status}: ${error.response.data?.error || error.message}` };
        } else if (error.request) {
            // The request was made but no response was received
            console.error('[SerpApi/Axios] No response received:', error.request);
            return { error: `SerpApi request failed: No response received (${error.message})` };
        } else {
            // Something happened in setting up the request that triggered an Error
            console.error('[SerpApi/Axios] Error setting up request:', error.message);
            // Log stack trace if available
            if (error.stack) {
                console.error("[SerpApi/Axios] Error stack:", error.stack);
            }
            return { error: `SerpApi request setup failed: ${error.message}` };
        }
    }
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


export default {
    findPrivacyPolicyUrl,
    // Export helpers if needed for testing
    _checkUrl: checkUrl,
    _verifyContent: verifyContent,
    _calculatePriority: calculatePriority
};
