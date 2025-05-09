import { fetchAsset, checkUrlAccessibility } from './assetFetcher.js';
import { extractPolicyLinks } from './linkExtractor.js';
import { filterLinks } from './linkFilter.js';
import { dedupByHash } from './dedup.js';
import { assembleSnapshot } from './concatAssembler.js';
import { getNormalizedDomain } from '../../utils/domainUtils.js'; // Assuming this path from domain-normalization.md
import { sha256, uploadToStorage, generateStoragePath } from './utils.js'; // For hashing final snapshot & storage
// import { upsertVersionAndAssets } from './versioner.js'; // This will be the next step

const DEFAULT_KEYWORD_REGEX = /(privacy|policy|dpa|gdpr|ccpa|cookies|terms|agreement|legal|notice)/i;
const S3_BUCKET_NAME = process.env.S3_BUCKET || 'privacylens-archive'; // From .env

/**
 * Performs a deep crawl starting from a root policy URL.
 *
 * @param {string} rootUrl The initial URL to start crawling from.
 * @param {string} policyType The type of policy (e.g., 'privacy', 'tos').
 * @param {object} crawlOptions Configuration for the crawler.
 * @param {number} [crawlOptions.maxDepth=2] Max depth to crawl. 0 is root only.
 * @param {number} [crawlOptions.maxLinksPerPage=20] Max links to extract per page.
 * @param {boolean} [crawlOptions.includePdfs=false] Whether to fetch and process PDFs.
 * @param {number} [crawlOptions.crawlDelayMs=500] Delay between GET requests to the same host.
 * @param {number} [crawlOptions.filterDelayMs=200] Delay between HEAD requests for filtering.
 * @param {RegExp} [crawlOptions.keywordRegex=DEFAULT_KEYWORD_REGEX] Regex for link discovery.
 * @param {string} [crawlOptions.userAgent] User agent for requests.
 * @param {number} [crawlOptions.requestTimeout=15000] Timeout for GET/HEAD requests.
 * @param {number} [crawlOptions.maxAssetSizeBytes=5242880] Max size for individual assets (GET).
 * @param {number} [crawlOptions.maxFilterSizeBytes=2097152] Max size for assets during HEAD filtering.
 * @returns {Promise<object|null>} An object containing the crawled data or null on failure.
 *                                  Includes { rootAsset, allFetchedAssets, snapshot, policyDomain, policyType }
 */
export async function performDeepCrawl(rootUrl, policyType, crawlOptions = {}) {
  const {
    maxDepth = 2,
    maxLinksPerPage = 20,
    includePdfs = false,
    crawlDelayMs = 500,
    filterDelayMs = 200, // Shorter delay for HEAD requests
    keywordRegex = DEFAULT_KEYWORD_REGEX,
    userAgent, // Pass to assetFetcher and linkFilter
    requestTimeout = 15000,
    maxAssetSizeBytes = 5 * 1024 * 1024, // 5MB for GET
    maxFilterSizeBytes = 2 * 1024 * 1024, // 2MB for HEAD
  } = crawlOptions;

  const policyDomain = getNormalizedDomain(new URL(rootUrl).hostname);
  if (!policyDomain) {
    console.error(`DeepCrawler: Could not normalize domain for root URL: ${rootUrl}`);
    return null;
  }

  const visitedUrls = new Set(); // Tracks URLs added to queue to avoid re-processing
  const queue = []; // Queue of { url, depth }
  const allFetchedAssets = []; // Stores { url, rawBody, depth, mimeType, bytes, asset_hash, finalUrl }

  // 0. Pre-check URL accessibility
  console.log(`DeepCrawler: Starting crawl for ${rootUrl} (Domain: ${policyDomain}, Type: ${policyType})`);
  const accessibilityCheck = await checkUrlAccessibility(rootUrl, { userAgent, timeout: requestTimeout / 2 });
  
  if (!accessibilityCheck.accessible) {
    console.error(`DeepCrawler: Root URL ${rootUrl} is not accessible: ${accessibilityCheck.error}`);
    console.log(`DeepCrawler: Attempting full fetch anyway as HEAD requests are sometimes blocked...`);
    // Continue with fetch attempt despite HEAD failure - some sites block HEAD but allow GET
  } else {
    console.log(`DeepCrawler: Root URL ${rootUrl} is accessible (status: ${accessibilityCheck.status})`);
  }

  // 1. Fetch root asset (depth 0)
  const rootAssetFetch = await fetchAsset(rootUrl, { 
    userAgent, 
    timeout: requestTimeout, 
    maxSizeBytes: maxAssetSizeBytes 
  });

  if (rootAssetFetch.error || !rootAssetFetch.rawBody) {
    console.error(`DeepCrawler: Failed to fetch root URL ${rootUrl}: ${rootAssetFetch.error}`);
    
    if (rootAssetFetch.errorDetails) {
      console.debug(`DeepCrawler: Detailed error for root URL:`, JSON.stringify(rootAssetFetch.errorDetails, null, 2));
    }
    
    // Try with an alternative user agent as a last resort if not already tried
    if (!userAgent || userAgent === DEFAULT_USER_AGENT) {
      const altUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
      console.log(`DeepCrawler: Trying one last fetch with alternative user agent for ${rootUrl}`);
      
      const lastResortFetch = await fetchAsset(rootUrl, {
        userAgent: altUserAgent,
        timeout: requestTimeout * 1.5, // Give it a bit more time
        maxSizeBytes: maxAssetSizeBytes
      });
      
      if (!lastResortFetch.error && lastResortFetch.rawBody) {
        console.log(`DeepCrawler: Last resort fetch with alternative user agent succeeded for ${rootUrl}`);
        // Continue with this successful fetch
        rootAssetFetch.rawBody = lastResortFetch.rawBody;
        rootAssetFetch.finalUrl = lastResortFetch.finalUrl;
        rootAssetFetch.mimeType = lastResortFetch.mimeType;
        rootAssetFetch.bytes = lastResortFetch.bytes;
        rootAssetFetch.error = null;
      } else {
        // Still failed, return null
        return null;
      }
    } else {
      return null;
    }
  }
  if (rootAssetFetch.mimeType !== 'text/html') {
      // If root is not HTML, we can't extract links from it.
      // We'll still archive it as a single-asset policy.
      console.warn(`DeepCrawler: Root URL ${rootUrl} is not HTML (${rootAssetFetch.mimeType}). Archiving as single asset.`);
      // Add to allFetchedAssets and proceed to snapshot/versioning
       const rootAsset = {
        url: rootUrl, // Original requested URL
        finalUrl: rootAssetFetch.finalUrl,
        rawBody: rootAssetFetch.rawBody,
        depth: 0,
        mimeType: rootAssetFetch.mimeType,
        bytes: rootAssetFetch.bytes,
        asset_hash: sha256(rootAssetFetch.rawBody)
      };
      allFetchedAssets.push(rootAsset);
      // Skip queue processing, go directly to assembly
  } else {
      const rootAsset = {
        url: rootUrl, // Original requested URL
        finalUrl: rootAssetFetch.finalUrl,
        rawBody: rootAssetFetch.rawBody,
        depth: 0,
        mimeType: rootAssetFetch.mimeType,
        bytes: rootAssetFetch.bytes,
        // asset_hash will be added by dedup or assembler
      };
      allFetchedAssets.push(rootAsset);
      queue.push({ url: rootAsset.finalUrl, depth: 0, htmlBody: rootAsset.rawBody });
      visitedUrls.add(rootAsset.finalUrl);
  }


  // 2. BFS Crawl
  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    const currentDepth = current.depth;

    if (currentDepth >= maxDepth) {
      continue; // Max depth reached for this path
    }

    // a. Extract links (only from HTML of current item)
    const candidateLinks = extractPolicyLinks(
      current.htmlBody, // HTML content of the current page
      policyDomain,     // Base domain for same-origin check
      current.url,      // Current page's URL for resolving relative links
      keywordRegex,
      { maxLinksPerPage }
    );

    if (crawlDelayMs > 0 && candidateLinks.length > 0) { // Delay if we are about to make HEAD requests
        await new Promise(resolve => setTimeout(resolve, crawlDelayMs));
    }
    
    // b. Filter links (makes HEAD requests)
    const filteredLinks = await filterLinks(candidateLinks, {
      baseHostname: policyDomain,
      maxSizeBytes: maxFilterSizeBytes,
      includePdfs,
      requestDelayMs: filterDelayMs,
      userAgent,
      timeout: requestTimeout,
    });

    // c. Fetch accepted links and add to queue/assets
    for (const linkUrl of filteredLinks) {
      if (visitedUrls.has(linkUrl)) {
        continue; // Already visited or in queue
      }
      visitedUrls.add(linkUrl);

      if (crawlDelayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, crawlDelayMs));
      }
      
      console.log(`DeepCrawler: Fetching depth ${currentDepth + 1} asset: ${linkUrl}`);
      const assetFetch = await fetchAsset(linkUrl, { userAgent, timeout: requestTimeout, maxSizeBytes: maxAssetSizeBytes });

      if (assetFetch.error || !assetFetch.rawBody) {
        console.warn(`DeepCrawler: Failed to fetch asset ${linkUrl}: ${assetFetch.error || 'No body'}`);
        continue;
      }

      const fetchedAsset = {
        url: linkUrl, // Original link URL
        finalUrl: assetFetch.finalUrl,
        rawBody: assetFetch.rawBody,
        depth: currentDepth + 1,
        mimeType: assetFetch.mimeType,
        bytes: assetFetch.bytes,
        // asset_hash will be added later
      };
      allFetchedAssets.push(fetchedAsset);

      // If HTML and not at max depth, add to queue for further crawling
      if (fetchedAsset.mimeType === 'text/html' && typeof fetchedAsset.rawBody === 'string' && (currentDepth + 1) < maxDepth) {
        queue.push({ url: fetchedAsset.finalUrl, depth: currentDepth + 1, htmlBody: fetchedAsset.rawBody });
      }
    }
  }

  // 3. De-duplicate assets
  // dedupByHash will add/update 'asset_hash' on each asset object
  const uniqueAssets = await dedupByHash(allFetchedAssets); 
  console.log(`DeepCrawler: Fetched ${allFetchedAssets.length} assets, ${uniqueAssets.length} unique after dedup.`);

  // 4. Assemble snapshot (concatenated text and HTML)
  // The first asset in uniqueAssets should be the root if it was HTML, or the only asset.
  // Ensure rootAsset is correctly identified for assembleSnapshot if it was non-HTML initially.
  const actualRootAssetForAssembly = uniqueAssets.find(a => a.depth === 0 && a.url === rootUrl);
  if (!actualRootAssetForAssembly) {
      console.error("DeepCrawler: Root asset missing after processing. This should not happen.");
      return null;
  }
  const subAssetsForAssembly = uniqueAssets.filter(a => !(a.depth === 0 && a.url === rootUrl));

  const snapshot = assembleSnapshot(actualRootAssetForAssembly, subAssetsForAssembly);
  
  // The 'snapshot' object contains:
  // - concatText: string
  // - concatHtml: string
  // - allAssetsCleanText: Array of {url, text, depth, mimeType, asset_hash, bytes}

  // TODO: Next steps:
  // 5. Versioning: Compare snapshot.concatText hash with previous version.
  // 6. Storage: Store raw assets (from uniqueAssets) and snapshot files to S3/Supabase Storage.
  // 7. Database: Insert into policy_versions and policy_assets.
  //    This will likely be handled by a modified versioner.js function.

  console.log(`DeepCrawler: Crawl finished for ${rootUrl}. Snapshot assembled.`);
  
  return {
    rootAsset: actualRootAssetForAssembly, // The root asset object
    allFetchedAssets: uniqueAssets, // Array of all unique fetched asset objects (with rawBody, hash, etc.)
    snapshotData: snapshot, // Contains concatText, concatHtml, and allAssetsCleanText array
    policyDomain,
    policyType,
    rootUrl // Original root URL requested
  };
}

// Example usage (for testing, would be called by a job):
// performDeepCrawl('https://example.com/privacy', 'privacy', { maxDepth: 1, includePdfs: true })
//   .then(result => {
//     if (result) {
//       console.log('Crawl successful:', result.snapshotData.concatText.substring(0, 200));
//       console.log('Assets:', result.snapshotData.allAssetsCleanText.map(a => ({url: a.url, hash: a.asset_hash, depth: a.depth})));
//     } else {
//       console.log('Crawl failed.');
//     }
//   });
