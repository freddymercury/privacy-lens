// Helpers for jsdom-based interaction tests: load the real extension HTML
// pages into the jsdom document and flush async UI updates.
const fs = require('fs');
const path = require('path');

/**
 * Load an extension HTML page's <body> into the current jsdom document,
 * stripping <script> tags (the page script is required separately so jest
 * module mocks apply).
 */
function loadPage(htmlFile) {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', htmlFile), 'utf8');
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (!bodyMatch) throw new Error(`No <body> found in ${htmlFile}`);
  document.body.innerHTML = bodyMatch[1].replace(/<script[\s\S]*?<\/script>/gi, '');
}

/** Let queued promises/timeouts settle so async event handlers complete. */
async function flush(rounds = 10) {
  for (let i = 0; i < rounds; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** Fire DOMContentLoaded to trigger page initialization listeners. */
async function initPage() {
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await flush();
}

module.exports = { loadPage, flush, initPage };
