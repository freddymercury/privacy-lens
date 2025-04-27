# Specification: Privacy Policy Search Logic

## Goal

To reliably find the URL of the privacy policy for a given domain name.

## Inputs

-   `domain`: The **normalized** domain name (e.g., "example.com") for which to find the privacy policy. Normalization follows the project standard (typically extracting the effective Top-Level Domain plus one level, eTLD+1, as defined in `docs/domain-normalization.md`). Input hostnames (e.g., `www.example.co.uk`, `blog.example.com`) must be normalized to their base domain (e.g., `example.co.uk`, `example.com`) *before* being passed to this search logic.

## Outputs

-   `privacy_policy_url`: The URL of the found privacy policy, or `null` if none could be reliably identified.

## Context & Triggering

-   **Integration Point:** This logic is expected to run within the backend service.
-   **Triggering Conditions:**
    -   Primarily triggered when a new, normalized domain is encountered (e.g., reported by a client like the Chrome plugin and not found in the existing database).
    -   Should also be designed to be triggerable periodically (e.g., via a scheduled job or admin action) to update potentially changed URLs for existing domains.
-   **Success Handling:** Upon successfully finding and verifying a `privacy_policy_url`, it should be stored (e.g., in the Supabase database associated with the normalized domain) for use in subsequent assessment processes and API responses (as detailed in `docs/design_spec_policy_link.md`).
-   **Failure Handling:** If the process completes without finding a verifiable URL, this failure should be logged to a designated audit/operational log, and the domain might be flagged for manual review.

## Process Flow

1.  **Initial Check (Common Paths & Subdomains):**
    *   Define an *initial* list of common relative paths (English-centric: `/privacy`, `/privacy-policy`, `/legal/privacy`, `/privacy_policy`, `/terms/privacy`, `/en/privacy`).
    *   Define an *initial* list of common subdomains to check: `www.`, `privacy.`, `legal.`. (Also check the root domain without any subdomain).
    *   **Configurability:** These lists (paths, subdomains) *should be configurable* (e.g., via config file or environment variables) to allow adaptation and expansion. Consider adding non-English paths (e.g., `/datenschutz`, `/politique-de-confidentialite`) based on target user base or detected language. Future enhancement: Dynamically update lists based on successful search patterns.
    *   For each subdomain (including none) and each common path:
        *   Construct the URL: `https://{subdomain}{domain}{path}` (and potentially fallback to `http://` if HTTPS fails). Use a standard browser `User-Agent` string for requests to minimize blocking.
        *   Attempt to access the URL, following redirects (limit depth to prevent loops). Implement reasonable timeouts.
        *   Check the HTTP status code. A `2xx` status code indicates a potential match.
    *   Collect all successful `2xx` URLs.
    *   If one or more potential matches are found:
        *   **Prioritize:** Rank results (e.g., prefer shorter paths, paths containing "privacy", root domain over subdomains, HTTPS over HTTP).
        *   Proceed to **Step 3 (Content Verification)** with the highest-priority URL.

2.  **Fallback Search (Search Engine):**
    *   If **Step 1** fails to find any valid URL *or* if **Step 3** fails for the URL found in **Step 1**, utilize a search engine API (e.g., SerpApi, Google Custom Search, Bing Web Search).
    *   **API Selection Criteria:** Choose an API based on factors like: result quality/relevance, cost structure, rate limits, ease of integration, terms of service.
    *   **API Considerations:**
        *   Requires API key/authentication.
        *   Be mindful of usage costs and rate limits.
        *   Implement robust error handling for API failures (timeouts, invalid responses, quota exceeded) and consider retries.
    *   Construct a specific search query using the normalized domain: `"privacy policy" site:{domain}`.
    *   Execute the search via the chosen API.
    *   Analyze the search results:
        *   Parse the API response carefully.
        *   Filter results to prioritize links directly to the input `domain` or its known subdomains.
        *   Examine titles and snippets for keywords: "privacy", "policy", "data", "terms", "legal".
        *   **Prioritize:** Rank results based on search engine rank, keyword relevance in title/snippet, direct domain match vs. subdomain.
    *   Select the highest-priority URL from the search results.
    *   If a promising URL is identified:
        *   Proceed to **Step 3 (Content Verification)** with this URL.
    *   If no promising URL is found:
        *   Return `null`.

3.  **Content Verification:**
    *   Access the content of the candidate `privacy_policy_url` (from **Step 1** or **Step 2**). Use a standard browser `User-Agent`. Handle potential errors (connection, timeout).
    *   **Heuristic Limitations:** Verify content using heuristics. *Acknowledge that these heuristics (keywords, structure, length) are imperfect.* They may yield false positives (finding pages *about* privacy policies) or false negatives (missing unconventionally formatted policies). The tolerance for inaccuracy needs to be defined based on the application's requirements.
    *   **Heuristics:**
        *   **Keywords:** Check for relevant keywords (e.g., "privacy", "data", "collect", "use", "share", "cookies", "personal information", "rights") in main content and key HTML elements.
        *   **HTML Structure:** Look for indicative elements like `<title>` or `<h1>` containing "Privacy" or "Policy".
        *   **Content Length:** Check if the content length exceeds a minimum threshold (e.g., 500 characters) to avoid trivial pages.
        *   **Content Type:** Primarily focus on HTML, but note if the `Content-Type` header indicates PDF (verification might be limited).
    *   If verification heuristics pass:
        *   Return the `privacy_policy_url`.
    *   If verification fails (e.g., connection error, timeout, content doesn't meet heuristics, page is a generic 404 despite 2xx status):
        *   If the URL came from **Step 1**: Proceed to **Step 2 (Fallback Search)**.
        *   If the URL came from **Step 2**: Potentially try the next highest-priority search result (limit attempts), or give up and return `null`.

## Error Handling & Edge Cases (Summary)

*   **Redirects:** Handle limited HTTP redirects.
*   **HTTPS/HTTP:** Prefer HTTPS, allow HTTP fallback for initial checks.
*   **Subdomains:** Explicitly check common ones initially; list should be configurable.
*   **Non-HTML Content:** Note PDFs; verification might be basic.
*   **API Issues:** Handle authentication, rate limits, costs, errors, retries (based on chosen API).
*   **Ambiguity:** Use defined prioritization rules at each stage.
*   **Timeouts:** Implement timeouts for all network requests.
*   **User-Agent:** Use a standard browser User-Agent string for all HTTP requests to avoid blocking.
*   **Dynamic Content (JavaScript):** Basic HTTP fetches may fail to find policies on sites heavily reliant on JavaScript rendering. This is a limitation of the described approach. Detecting/handling such cases might require more advanced techniques (e.g., headless browser execution), significantly increasing complexity and resource usage. This should be considered for future enhancement if critical.
*   **Internationalization (i18n):** Initial common paths are English-centric. Add/configure paths for other relevant languages.
*   **Failure Logging:** Log failures (inability to find a URL after all steps) to the system's audit/operational logs.

## Security Considerations

*   **Server-Side Request Forgery (SSRF):** Since this process fetches external URLs based on domain inputs, implement SSRF prevention measures:
    *   **Input Validation:** Strictly validate input domains and constructed URLs.
    *   **Protocol/Port Allowlist:** Only allow HTTP/HTTPS protocols and connections on ports 80 and 443.
    *   **IP Address Blocking:** Resolve domain names to IPs. Before connecting, check the resolved IP against a blocklist of private/reserved ranges (including loopback addresses like `127.0.0.1`, `::1`). Re-validate IPs after following redirects.
    *   **Network Controls:** If possible, run fetching logic in an isolated environment or use a dedicated, configured proxy for outbound requests.
    *   **Limit Response Size:** Limit the maximum size of downloaded content.

## Future Considerations

*   **Language Detection:** Identify policy language to aid verification or path selection.
*   **Advanced Content Analysis:** Use NLP or ML models for more robust verification, overcoming heuristic limitations.
*   **Dynamic Content Handling:** Implement headless browser rendering for JS-heavy sites if required.
*   **Dynamic Path Learning:** Automatically learn and prioritize common paths based on success rates.
*   **Caching:** Cache results per domain.
*   **User-Agent Rotation:** Consider rotating User-Agent strings if aggressive blocking is encountered.

## Testing Strategy

To ensure the reliability and correctness of the privacy policy search logic, the following types of tests should be implemented:

*   **Unit Tests:**
    *   **Focus:** Test individual functions/components (URL generation, API parsing mocks, verification heuristics) in isolation. Mock dependencies.
*   **Module/Integration Tests:**
    *   **Focus:** Test interactions between components (e.g., common path failure triggering search, URL fetch + verification). Mock external APIs.
*   **End-to-End (E2E) Tests:**
    *   **Focus:** Test the entire flow with real domains (or well-controlled stubs). Test standard paths, search fallback, no policy cases. May hit actual APIs (use carefully).
*   **Acceptance Tests:**
    *   **Focus:** Confirm feature meets requirements described here. Driven by specification criteria (e.g., "Given domain X, expect URL Y"). Often overlaps with E2E. 