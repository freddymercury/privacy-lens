/**
 * LLM-related pure functions for privacy policy assessment
 * Separated from LLM service to be environment-agnostic
 */

const crypto = require('crypto');
const { PRIVACY_CATEGORIES, RISK_LEVELS, normalizeRiskLevel, getRiskPriority, getRubric } = require('./core');

/**
 * Pure function to estimate token count for text
 * @param {string} text - Text to estimate tokens for
 * @returns {number} Estimated token count
 */
function estimateTokens(text) {
  if (!text || typeof text !== 'string') {
    return 0;
  }
  
  // Conservative estimation:
  // 1. Count words and multiply by 1.5 for punctuation/spaces
  // 2. Add 30% buffer for safety
  // 3. Add constant for potential special tokens
  // 4. Account for non-English characters which may use more tokens
  const wordCount = text.split(/\s+/).length;
  const charCount = text.length;
  
  // If average word length is high, might contain non-English characters
  const avgWordLength = charCount / (wordCount || 1);
  const nonEnglishFactor = avgWordLength > 6 ? 1.2 : 1.0;
  
  return Math.ceil(wordCount * 1.5 * 1.3 * nonEnglishFactor) + 50;
}

/**
 * Pure function to split text into chunks of approximately specified size
 * @param {string} text - Text to split
 * @param {number} maxChunkSize - Maximum chunk size in characters
 * @returns {Array<string>} Array of text chunks
 */
function splitTextIntoChunks(text, maxChunkSize = 3000) {
  if (!text || typeof text !== 'string') {
    return [];
  }
  
  if (text.length <= maxChunkSize) {
    return [text];
  }
  
  // Split at paragraph boundaries when possible
  const paragraphs = text.split(/\n\s*\n/);
  const chunks = [];
  let currentChunk = "";

  for (const paragraph of paragraphs) {
    // If this paragraph alone exceeds the chunk size, split it further
    if (paragraph.length > maxChunkSize) {
      // If we have accumulated text, add it first
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = "";
      }
      
      // Split the long paragraph into sentences
      const sentences = paragraph.split(/(?<=[.!?])\s+/);
      
      for (const sentence of sentences) {
        // If sentence exceeds chunk size, split by words
        if (sentence.length > maxChunkSize) {
          const words = sentence.split(/\s+/);
          let sentenceChunk = "";
          
          for (const word of words) {
            if (sentenceChunk.length + word.length + 1 > maxChunkSize) {
              chunks.push(sentenceChunk);
              sentenceChunk = word;
            } else {
              sentenceChunk += (sentenceChunk.length > 0 ? " " : "") + word;
            }
          }
          
          // Add the last sentence chunk if not empty
          if (sentenceChunk.length > 0) {
            if (currentChunk.length + sentenceChunk.length + 2 <= maxChunkSize) {
              currentChunk += (currentChunk.length > 0 ? "\n\n" : "") + sentenceChunk;
            } else {
              chunks.push(currentChunk);
              currentChunk = sentenceChunk;
            }
          }
        } else {
          // Normal sentence handling
          if (currentChunk.length + sentence.length + 2 > maxChunkSize) {
            chunks.push(currentChunk);
            currentChunk = sentence;
          } else {
            currentChunk += (currentChunk.length > 0 ? " " : "") + sentence;
          }
        }
      }
    } else {
      // Normal paragraph handling
      if (currentChunk.length + paragraph.length + 2 > maxChunkSize) {
        chunks.push(currentChunk);
        currentChunk = paragraph;
      } else {
        currentChunk += (currentChunk.length > 0 ? "\n\n" : "") + paragraph;
      }
    }
  }

  // Add the last chunk if not empty
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * Pure function to compute SHA256 hash of text
 * @param {string} text - Text to hash
 * @returns {string} SHA256 hash as hex string
 */
function computeTextHash(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * Pure function to build the rubric section of an assessment prompt
 * Categories, definitions, anchor criteria, and risk level definitions
 * are all derived from rubric.json
 * @returns {string} Rubric section text for prompts
 */
function buildRubricSection() {
  const rubric = getRubric();

  const categorySections = rubric.categories.map((category) => {
    const anchors = Object.entries(category.anchors)
      .map(([level, criteria]) => `  - ${level}: ${criteria}`)
      .join("\n");
    return `${category.name}\n${category.definition}\n${anchors}`;
  }).join("\n\n");

  const riskDefinitions = rubric.riskLevels
    .map((level) => `- ${level.name}: ${level.definition}`)
    .join("\n");

  return { categorySections, riskDefinitions };
}

/**
 * Pure function to build the response format section of an assessment prompt
 * @returns {string} Response format instructions
 */
function buildResponseFormatSection() {
  return `Respond with JSON:
{
  "categories": {
    "Category Name": {
      "risk": "High/Medium/Low/Unknown",
      "explanation": "Brief explanation",
      "evidence": "Verbatim quote from the policy supporting this risk rating"
    }
  },
  "overallRisk": "High/Medium/Low/Unknown",
  "summary": "Brief overall summary"
}`;
}

/**
 * Pure function to create assessment prompt for LLM
 * @param {string} policyText - Privacy policy text
 * @param {string} domain - Domain being assessed (for context)
 * @returns {string} Formatted prompt
 */
function createAssessmentPrompt(policyText, domain = "unknown") {
  if (!policyText || typeof policyText !== 'string') {
    throw new Error('Valid policy text is required');
  }

  const { categorySections, riskDefinitions } = buildRubricSection();

  return `Analyze this privacy policy and assess risks for users.

Categories to evaluate (assign exactly one of High/Medium/Low/Unknown per category):
${categorySections}

Risk definitions:
${riskDefinitions}

For each category, quote the policy text that supports your rating in the "evidence" field (use an empty string if the category is Unknown).

Privacy Policy:
${policyText}

${buildResponseFormatSection()}`;
}

/**
 * Pure function to create assessment prompt for policy chunk
 * @param {string} chunkText - Chunk of privacy policy text
 * @param {number} chunkNumber - Current chunk number
 * @param {number} totalChunks - Total number of chunks
 * @param {string} domain - Domain being assessed
 * @returns {string} Formatted prompt
 */
function createChunkAssessmentPrompt(chunkText, chunkNumber, totalChunks, domain = "unknown") {
  if (!chunkText || typeof chunkText !== 'string') {
    throw new Error('Valid chunk text is required');
  }

  if (typeof chunkNumber !== 'number' || typeof totalChunks !== 'number') {
    throw new Error('Valid chunk numbers are required');
  }

  const { categorySections, riskDefinitions } = buildRubricSection();

  return `Analyze CHUNK ${chunkNumber}/${totalChunks} of this privacy policy.

Only assess categories addressed in this chunk (assign exactly one of High/Medium/Low/Unknown per category):
${categorySections}

Risk definitions:
${riskDefinitions}

For each category you assess, quote the chunk text that supports your rating in the "evidence" field (use an empty string if the category is Unknown).

Privacy Policy Chunk ${chunkNumber}/${totalChunks}:
${chunkText}

${buildResponseFormatSection()}`;
}

/**
 * Pure function to extract plain text from HTML content
 * @param {string} html - HTML content
 * @returns {string} Plain text content
 */
function extractTextFromHtml(html) {
  if (!html || typeof html !== 'string') {
    return '';
  }
  
  return html
    // Remove script and style tags and their content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    // Remove HTML tags
    .replace(/<[^>]*>/g, ' ')
    // Decode HTML entities (basic ones)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Pure function to parse LLM response into structured assessment
 * @param {string} responseText - LLM response text
 * @returns {Object} Structured assessment object
 */
function parseAssessmentResponse(responseText) {
  if (!responseText || typeof responseText !== 'string') {
    throw new Error('Valid response text is required');
  }
  
  try {
    // Extract JSON from response (in case there's additional text)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No valid JSON found in response");
    }

    const assessment = JSON.parse(jsonMatch[0]);

    // Validate assessment structure
    if (!assessment.categories || !assessment.overallRisk || !assessment.summary) {
      throw new Error("Invalid assessment structure");
    }

    // Normalize risk levels
    const normalizedCategories = {};
    for (const category in assessment.categories) {
      if (assessment.categories[category] && assessment.categories[category].risk) {
        const categoryData = assessment.categories[category];
        normalizedCategories[category] = {
          risk: normalizeRiskLevel(categoryData.risk),
          explanation: categoryData.explanation || "No explanation provided",
          // Carry the verbatim evidence quote through when present
          ...(typeof categoryData.evidence === 'string' && categoryData.evidence.trim()
            ? { evidence: categoryData.evidence }
            : {})
        };
      }
    }

    return {
      categories: normalizedCategories,
      riskLevel: normalizeRiskLevel(assessment.overallRisk),
      summary: assessment.summary || "No summary provided",
    };
  } catch (error) {
    throw new Error(`Failed to parse assessment response: ${error.message}`);
  }
}

/**
 * Pure function to pick the majority risk from a list of risks
 * Most common non-Unknown risk wins; ties break toward higher risk
 * @param {Array<string>} risks - Risk levels to aggregate
 * @returns {string} Majority risk level (Unknown if none are known)
 */
function majorityRisk(risks) {
  const counts = {};
  for (const risk of risks) {
    const normalized = normalizeRiskLevel(risk);
    if (normalized === RISK_LEVELS.UNKNOWN) continue;
    counts[normalized] = (counts[normalized] || 0) + 1;
  }

  let best = null;
  for (const risk in counts) {
    if (best === null ||
        counts[risk] > counts[best] ||
        (counts[risk] === counts[best] && getRiskPriority(risk) > getRiskPriority(best))) {
      best = risk;
    }
  }

  return best || RISK_LEVELS.UNKNOWN;
}

/**
 * Pure function to combine multiple chunk assessments into final assessment
 * Aggregation strategies are read from the rubric (aggregation.categoryAcrossChunks
 * and aggregation.overall); supported strategies are "max" and "majority"
 * @param {Array<Object>} chunkAssessments - Array of chunk assessments
 * @param {Object} [aggregationOverrides] - Optional overrides for the rubric's aggregation settings
 * @returns {Object} Combined assessment
 */
function combineChunkAssessments(chunkAssessments, aggregationOverrides = {}) {
  if (!Array.isArray(chunkAssessments) || chunkAssessments.length === 0) {
    throw new Error('Valid chunk assessments array is required');
  }

  const aggregation = { ...(getRubric().aggregation || {}), ...aggregationOverrides };
  const categoryStrategy = aggregation.categoryAcrossChunks || "max";
  const overallStrategy = aggregation.overall || "max";

  // Collect per-category entries (risk + explanation + evidence) across chunks
  const categoryEntries = {};
  for (const category of PRIVACY_CATEGORIES) {
    categoryEntries[category] = [];
  }

  // Combine chunk summaries
  const chunkSummaries = chunkAssessments
    .map(a => a.summary || "No summary available")
    .filter(s => s.length > 0);

  // Process each chunk assessment
  for (const assessment of chunkAssessments) {
    if (!assessment || !assessment.categories) continue;

    for (const category in assessment.categories) {
      const chunkCategoryData = assessment.categories[category];
      if (!chunkCategoryData || !chunkCategoryData.risk || !(category in categoryEntries)) continue;

      const normalizedRisk = normalizeRiskLevel(chunkCategoryData.risk);
      if (normalizedRisk === RISK_LEVELS.UNKNOWN) continue;

      categoryEntries[category].push({
        risk: normalizedRisk,
        explanation: chunkCategoryData.explanation || "No explanation provided",
        // Carry the verbatim evidence quote through when present
        ...(typeof chunkCategoryData.evidence === 'string' && chunkCategoryData.evidence.trim()
          ? { evidence: chunkCategoryData.evidence }
          : {})
      });
    }
  }

  // Reduce each category's entries to a single assessment
  const combinedCategories = {};
  for (const category of PRIVACY_CATEGORIES) {
    const entries = categoryEntries[category];

    if (entries.length === 0) {
      combinedCategories[category] = {
        risk: RISK_LEVELS.UNKNOWN,
        explanation: "Not addressed in the policy",
      };
      continue;
    }

    let winningEntry;
    if (categoryStrategy === "majority") {
      // Majority vote across chunks; keep evidence from a chunk that voted for it
      const majority = majorityRisk(entries.map(e => e.risk));
      winningEntry = entries.find(e => e.risk === majority);
    } else {
      // "max" (default): highest risk wins; keep evidence from the winning chunk
      winningEntry = entries.reduce((best, entry) =>
        getRiskPriority(entry.risk) > getRiskPriority(best.risk) ? entry : best
      );
    }

    combinedCategories[category] = { ...winningEntry };
  }

  // Determine overall risk level from the combined categories
  const categoryRisks = PRIVACY_CATEGORIES.map(c => combinedCategories[c].risk);
  const overallRisk = overallStrategy === "majority"
    ? majorityRisk(categoryRisks)
    : categoryRisks.reduce((maxRisk, risk) =>
        getRiskPriority(risk) > getRiskPriority(maxRisk) ? risk : maxRisk,
      RISK_LEVELS.UNKNOWN);

  // Create comprehensive summary
  const summary = chunkSummaries.length > 0
    ? `This privacy policy assessment is based on analysis of multiple sections. ${chunkSummaries.join(" ")}`
    : "Assessment completed but no detailed summary available.";

  return {
    categories: combinedCategories,
    riskLevel: overallRisk,
    summary: summary,
  };
}

/**
 * Pure function to determine if policy text should be chunked
 * @param {string} policyText - Policy text to analyze
 * @param {number} maxTokens - Maximum tokens before chunking
 * @param {number} maxChars - Maximum characters before chunking
 * @returns {Object} Analysis result with shouldChunk boolean and metadata
 */
function shouldChunkPolicy(policyText, maxTokens = 2000, maxChars = 7000) {
  if (!policyText || typeof policyText !== 'string') {
    return { shouldChunk: false, estimatedTokens: 0, textLength: 0 };
  }
  
  const estimatedTokens = estimateTokens(policyText);
  const textLength = policyText.length;
  
  return {
    shouldChunk: estimatedTokens >= maxTokens || textLength >= maxChars,
    estimatedTokens,
    textLength,
    recommendedChunkSize: 2000 * 4 // 8000 chars target per chunk
  };
}

module.exports = {
  // Text processing functions
  estimateTokens,
  splitTextIntoChunks,
  computeTextHash,
  extractTextFromHtml,
  
  // Prompt creation functions
  createAssessmentPrompt,
  createChunkAssessmentPrompt,
  
  // Response processing functions
  parseAssessmentResponse,
  combineChunkAssessments,
  
  // Analysis helper functions
  shouldChunkPolicy
}; 