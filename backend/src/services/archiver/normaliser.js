const { JSDOM } = require("jsdom");

/**
 * Converts raw HTML into cleaned, normalized text.
 * Removes script and style elements, and normalizes whitespace.
 * @param {string} html - The raw HTML content.
 * @returns {string} - The cleaned and trimmed text content.
 */
function htmlToCleanText(html) {
  if (!html || typeof html !== 'string') {
    console.warn("[Normaliser] Input HTML is empty or not a string.");
    return "";
  }

  try {
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Remove script, style, noscript, and head elements
    document.querySelectorAll("script, style, noscript, head, link, meta").forEach(el => el.remove());

    // Get text content from the body, or fallback to documentElement if body is missing
    const textContent = document.body?.textContent || document.documentElement?.textContent || "";

    // Normalize whitespace: replace multiple spaces/newlines with single space, then trim
    const cleanedText = textContent.replace(/\s+/g, " ").trim();

    console.log(`[Normaliser] Cleaned text length: ${cleanedText.length}`);
    return cleanedText;
  } catch (error) {
    console.error("[Normaliser] Error processing HTML:", error);
    // Return empty string or re-throw, depending on desired error handling
    return "";
  }
}

module.exports = {
  htmlToCleanText,
};
