import axios from "axios";

/**
 * Fetches the raw HTML content of a given URL.
 * @param {string} url - The URL to fetch.
 * @returns {Promise<string>} - A promise that resolves with the HTML content.
 * @throws {Error} - Throws an error if the request fails or times out.
 */
export async function fetchHTML(url) {
  console.log(`[Crawler] Fetching HTML for: ${url}`);
  try {
    const { data } = await axios.get(url, {
      headers: {
        // Use a specific user agent to identify the crawler
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
      },
      // Set a reasonable timeout (e.g., 30 seconds)
      timeout: 30000,
      // Follow redirects
      maxRedirects: 5,
      // Validate status code (2xx)
      validateStatus: function (status) {
        return status >= 200 && status < 300;
      },
    });
    console.log(`[Crawler] Successfully fetched HTML for: ${url}`);
    return data;
  } catch (error) {
    console.error(`[Crawler] Error fetching ${url}:`, error.message);
    if (error.response) {
      console.error(`[Crawler] Status: ${error.response.status}, Data: ${error.response.data}`);
    } else if (error.request) {
      console.error('[Crawler] No response received:', error.request);
    } else {
      console.error('[Crawler] Error setting up request:', error.message);
    }
    // Re-throw the error to be handled by the caller (e.g., the job runner)
    throw new Error(`Failed to fetch HTML from ${url}: ${error.message}`);
  }
}

// No default export needed if only one function is exported.
