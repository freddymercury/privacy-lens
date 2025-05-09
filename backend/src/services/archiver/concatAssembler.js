import { htmlToCleanText } from './normaliser.js'; // Assumes htmlToCleanText is in normaliser.js

/**
 * Assembles a concatenated snapshot from a root document and its assets.
 * - Sorts assets by depth, then URL.
 * - Extracts clean text from each HTML asset.
 * - Concatenates clean texts with a separator indicating the source URL.
 * - Creates a simple concatenated HTML (root HTML + asset HTMLs).
 *
 * @param {object} rootAsset The root asset object, expected to have at least:
 *                           { url: string, rawBody: string (HTML), depth: 0, mimeType: 'text/html' }
 * @param {Array<object>} subAssets An array of de-duplicated sub-asset objects, each expected to have:
 *                                { url: string, rawBody: string|Buffer, depth: number, mimeType: string }
 * @returns {{concatText: string, concatHtml: string, allAssetsCleanText: Array<{url: string, text: string, depth: number, mimeType: string, asset_hash: string}>}}
 *          - concatText: All clean texts joined together.
 *          - concatHtml: A basic concatenation of HTML bodies.
 *          - allAssetsCleanText: An array of objects, each containing the URL, clean text, depth, mimeType, and hash for an asset.
 */
export function assembleSnapshot(rootAsset, subAssets = []) {
  if (!rootAsset || !rootAsset.rawBody || rootAsset.mimeType !== 'text/html') {
    console.error('ConcatAssembler: Root asset is invalid or not HTML.');
    // Return empty/default structure to prevent downstream errors
    return { concatText: '', concatHtml: '', allAssetsCleanText: [] };
  }

  const allProcessableAssets = [rootAsset, ...subAssets];
  const allAssetsCleanText = [];
  let concatenatedCleanText = '';
  let concatenatedHtmlBody = ''; // For a very basic combined HTML

  // Sort assets: depth ascending, then URL ascending for deterministic order
  allProcessableAssets.sort((a, b) => {
    if (a.depth !== b.depth) {
      return a.depth - b.depth;
    }
    return a.url.localeCompare(b.url);
  });

  // Process root asset first for concatenatedHtmlBody
  if (rootAsset.rawBody && typeof rootAsset.rawBody === 'string') {
    // A very naive way to get body content for concatenation.
    // JSDOM could be used for more robust body extraction if needed.
    const bodyMatch = rootAsset.rawBody.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    concatenatedHtmlBody += `\n<!-- Source: ${rootAsset.url} -->\n`;
    concatenatedHtmlBody += bodyMatch ? bodyMatch[1] : rootAsset.rawBody;
  }


  for (const asset of allProcessableAssets) {
    let cleanText = '';
    // Only attempt to clean text from HTML assets. For PDFs, cleanText might be empty or handled differently.
    // The deep_crawler_spec implies clean text is primarily from HTML.
    if (asset.mimeType === 'text/html' && asset.rawBody && typeof asset.rawBody === 'string') {
      cleanText = htmlToCleanText(asset.rawBody);

      // Add to concatenated HTML body (if not the root asset, which was added already)
      if (asset.url !== rootAsset.url) {
         const bodyMatch = asset.rawBody.match(/<body[^>]*>([\s\S]*)<\/body>/i);
         concatenatedHtmlBody += `\n\n<!-- Source: ${asset.url} -->\n`;
         concatenatedHtmlBody += bodyMatch ? bodyMatch[1] : asset.rawBody;
      }

    } else if (asset.mimeType === 'application/pdf') {
      // Placeholder for PDF text extraction if it were to be implemented here.
      // For now, PDF clean text is considered empty for the concatenated snapshot.
      // The raw PDF is stored, and specific PDF processing is an "open item".
      cleanText = `[PDF Document: ${asset.url}]`; // Or empty string
    }
    // Other mime types will result in empty cleanText for the purpose of concatenation.

    allAssetsCleanText.push({
      url: asset.url,
      text: cleanText,
      depth: asset.depth,
      mimeType: asset.mimeType,
      asset_hash: asset.asset_hash, // Assumes dedupByHash added this
      bytes: asset.bytes,
    });

    if (concatenatedCleanText.length > 0) {
      concatenatedCleanText += '\n\n'; // Add separator if not the first piece of text
    }
    concatenatedCleanText += `=== SOURCE: ${asset.url} ===\n${cleanText}`;
  }

  // Construct the final concatenated HTML document
  const finalConcatHtml = `<html><head><title>Concatenated Policy Snapshot</title></head><body>${concatenatedHtmlBody}</body></html>`;

  return {
    concatText: concatenatedCleanText.trim(),
    concatHtml: finalConcatHtml, // The spec mentions "concatenated .html" - this is a basic interpretation
    allAssetsCleanText: allAssetsCleanText, // This array contains individual clean texts and hashes
  };
}
