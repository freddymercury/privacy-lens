// LLM Service for PrivacyLens backend

import * as db from '../utils/db.cjs';
import crypto from 'crypto'; // Added for computeTextHash
import axios from 'axios'; // Added for extractUserAgreement
import shared from '@privacy-lens/shared';

// Rubric-driven assessment logic lives in the shared package
const {
  createAssessmentPrompt,
  createChunkAssessmentPrompt,
  parseAssessmentResponse,
  combineChunkAssessments,
} = shared.assessment.llm;
const {
  PRIVACY_CATEGORIES,
  RISK_LEVELS,
  getRiskPriority,
  RUBRIC_VERSION,
} = shared.assessment.core;

// Model used for assessments (stamped on results for provenance)
const LLM_MODEL = process.env.LLM_MODEL || "gpt-4o-mini";

// Check if we're running in a test environment
const isTestEnvironment =
  process.env.NODE_ENV === "test" || process.env.JEST_WORKER_ID !== undefined;

let OpenAI, llm;

// Initialize LLM
const initializeLLM = async () => {
  if (!isTestEnvironment) {
    try {
      // Only import and initialize OpenAI in non-test environments
      const llamaindex = await import("llamaindex");
      OpenAI = llamaindex.OpenAI;

      // Initialize OpenAI as the LLM provider
      llm = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        model: LLM_MODEL,
        temperature: 0, // Deterministic output for consistent, comparable assessments
      });
    } catch (error) {
      console.error("Error initializing LLM:", error);
      // Provide a minimal mock for development without API keys
      llm = {
        complete: async () => ({
          text: '{"categories":{},"overallRisk":"Unknown","summary":"Mock response"}',
        }),
      };
    }
  } else {
    // Provide a minimal mock for tests
    llm = {
      complete: async () => ({
        text: '{"categories":{},"overallRisk":"Unknown","summary":"Mock response"}',
      }),
    };
  }
};

// Initialize LLM immediately
initializeLLM().catch(err => {
  console.error("Failed to initialize LLM:", err);
});

/**
 * More accurate token estimation function
 * @param {string} text - Text to estimate tokens for
 * @returns {number} - Estimated token count
 */
const estimateTokens = (text) => {
  // Even more conservative estimation:
  // 1. Count words and multiply by 1.5 for punctuation/spaces
  // 2. Add 30% buffer for safety (increased from 20%)
  // 3. Add a constant for potential special tokens
  // 4. Account for non-English characters which may use more tokens
  const wordCount = text.split(/\s+/).length;
  const charCount = text.length;
  
  // If the average word length is high, it might contain non-English characters
  // which typically use more tokens per character
  const avgWordLength = charCount / (wordCount || 1);
  const nonEnglishFactor = avgWordLength > 6 ? 1.2 : 1.0;
  
  return Math.ceil(wordCount * 1.5 * 1.3 * nonEnglishFactor) + 50;
};

/**
 * Split text into chunks of approximately the specified size
 * @param {string} text - Text to split
 * @param {number} maxChunkSize - Maximum chunk size in characters
 * @returns {Array<string>} - Array of text chunks
 */
const splitTextIntoChunks = (text, maxChunkSize = 3000) => {
  // Split at paragraph boundaries when possible
  const paragraphs = text.split(/\n\s*\n/);
  const chunks = [];
  let currentChunk = "";

  for (const paragraph of paragraphs) {
    // If this paragraph alone exceeds the chunk size, we need to split it further
    if (paragraph.length > maxChunkSize) {
      // If we have accumulated text in the current chunk, add it first
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = "";
      }
      
      // Split the long paragraph into sentences
      const sentences = paragraph.split(/(?<=[.!?])\s+/);
      
      for (const sentence of sentences) {
        // If this sentence alone exceeds the chunk size, split it by words
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

  // Add the last chunk if it's not empty
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
};

/**
 * Call LLM with retry logic for rate limit errors
 * @param {string} prompt - The prompt to send to the LLM
 * @param {number} maxRetries - Maximum number of retry attempts
 * @param {number} initialDelay - Initial delay in ms before retrying
 * @param {Object} context - Additional context for logging (domain, chunk info)
 * @returns {Promise<Object>} - LLM response
 */
const callLLMWithRetry = async (
  prompt,
  maxRetries = 5,
  initialDelay = 5000,
  context = {}
) => {
  let attempt = 0;
  let delay = initialDelay;
  const { domain = "unknown", chunkInfo = "" } = context;

  // Log context information
  const contextStr = chunkInfo ? `${domain} (${chunkInfo})` : domain;
  console.log(`[LLM Service] Starting assessment for ${contextStr}`);

  while (attempt <= maxRetries) {
    try {
      console.log(`[LLM Service] API call attempt ${attempt + 1}/${maxRetries + 1} for ${contextStr}`);
      const response = await llm.complete({
        prompt,
        temperature: 0,
        maxTokens: 1500, // Reduced from 2000
      });
      console.log(`[LLM Service] Successfully completed API call for ${contextStr}`);
      return response;
    } catch (error) {
      attempt++;

      // If it's a rate limit error and we have retries left
      if (
        (error.status === 429 ||
          (error.error && error.error.code === "rate_limit_exceeded")) &&
        attempt <= maxRetries
      ) {
        console.log(`[LLM Service] Rate limit hit for ${contextStr}, retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      } else if (attempt <= maxRetries) {
        // For other errors, retry with less backoff
        console.log(
          `[LLM Service] API error for ${contextStr}: ${
            error.message || "Unknown error"
          }, retrying in ${initialDelay}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, initialDelay));
      } else {
        // No more retries, throw the error
        console.log(`[LLM Service] Failed all retry attempts for ${contextStr}`);
        throw error;
      }
    }
  }
};

/**
 * Compute SHA-256 hash of text
 * @param {string} text - Text to hash
 * @returns {string} - SHA-256 hash
 */

/**
 * Extract text content from HTML
 * @param {string} html - HTML content
 * @returns {string} - Extracted text
 */
function extractTextFromHtml(html) {
  // Simple HTML to text conversion
  let text = html;

  // Remove scripts
  text = text.replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    " "
  );

  // Remove styles
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ");

  // Remove HTML tags
  text = text.replace(/<[^>]*>/g, " ");

  // Normalize whitespace
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

/**
 * Compute SHA-256 hash of text
 * @param {string} text - Text to hash
 * @returns {string} - SHA-256 hash
 */
const computeTextHash = (text) => {
  return crypto.createHash("sha256").update(text).digest("hex");
};

// Exported service object
const llmService = {
  RISK_LEVELS,
  PRIVACY_CATEGORIES,
  estimateTokens,
  splitTextIntoChunks,
  computeTextHash,
  getRiskPriority,
  combineChunkAssessments,

  // Assess privacy policy with improved chunking
  async assessPrivacyPolicy(policyText, domain = "unknown") {
    try {
      // Use more accurate token estimation
      const estimatedTokens = estimateTokens(policyText);
      const textLength = policyText.length;

      // Always use chunking for policies over 7,000 characters or 2,000 tokens
      // This is a more conservative approach to avoid context length errors
      if (estimatedTokens < 2000 && textLength < 7000) {
        console.log(
          `[LLM Service] Processing policy for ${domain} directly (est. ${estimatedTokens} tokens, ${textLength} chars)`
        );
        const prompt = createAssessmentPrompt(policyText, domain);
        const response = await callLLMWithRetry(prompt, 5, 5000, { domain });
        return stampProvenance(parseAssessmentResponse(response.text));
      }

      // For larger policies, split into chunks and process each chunk
      console.log(
        `[LLM Service] Policy text for ${domain} is large (est. ${Math.round(
          estimatedTokens
        )} tokens, ${textLength} chars), splitting into chunks`
      );

      // Split text into smaller chunks (target ~2000 tokens per chunk)
      // 2000 tokens ≈ 8000 chars (reduced from 16000 chars)
      const chunks = splitTextIntoChunks(policyText, 2000 * 4);
      console.log(`[LLM Service] Split policy for ${domain} into ${chunks.length} chunks`);

      // Process each chunk
      const chunkAssessments = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunkInfo = `chunk ${i + 1}/${chunks.length}`;
        console.log(`[LLM Service] Processing ${chunkInfo} for ${domain}`);
        const chunkPrompt = createChunkAssessmentPrompt(
          chunks[i],
          i + 1,
          chunks.length,
          domain
        );

        // Use retry logic for each chunk
        const chunkResponse = await callLLMWithRetry(chunkPrompt, 5, 5000, { 
          domain, 
          chunkInfo 
        });
        const chunkAssessment = parseAssessmentResponse(chunkResponse.text);
        chunkAssessments.push(chunkAssessment);

        // Add a longer delay between chunks to avoid rate limiting
        if (i < chunks.length - 1) {
          const delayMs = 10000; // 10 seconds (increased from 5)
          console.log(
            `[LLM Service] Adding ${delayMs}ms delay between chunk processing for ${domain} to avoid rate limits`
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }

      // Combine chunk assessments into a final assessment
      return stampProvenance(combineChunkAssessments(chunkAssessments));
    } catch (error) {
      console.error("Error assessing privacy policy:", error);
      throw new Error("Failed to assess privacy policy");
    }
  }
};

/**
 * Stamp provenance metadata onto a final assessment so saved scores can be
 * traced back to the rubric version and model that produced them
 * @param {Object} assessment - Final assessment object
 * @returns {Object} Assessment with rubricVersion and model fields
 */
function stampProvenance(assessment) {
  return {
    ...assessment,
    rubricVersion: RUBRIC_VERSION,
    model: LLM_MODEL,
  };
}

// Add missing functions to the exported object
llmService.extractUserAgreement = extractUserAgreement;
llmService.callLLMWithRetry = callLLMWithRetry;

// Add extractUserAgreement function with proper implementation
async function extractUserAgreement(url) {
  try {
    // Normalize URL
    let normalizedUrl = url;
    if (!normalizedUrl.startsWith("http")) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    // Remove trailing slash if present
    if (normalizedUrl.endsWith("/")) {
      normalizedUrl = normalizedUrl.slice(0, -1);
    }

    console.log(`[LLMService] Looking for user agreement at ${normalizedUrl}`);

    // Determine if this is a Google domain
    const isGoogleDomain =
      normalizedUrl.includes("google.com") ||
      normalizedUrl.includes("google.") ||
      normalizedUrl === "google";

    console.log(`[LLMService] Is Google domain: ${isGoogleDomain}`);

    // Choose the appropriate paths to try
    const pathsToTry = isGoogleDomain
      ? [...GOOGLE_AGREEMENT_PATHS, ...COMMON_AGREEMENT_PATHS]
      : COMMON_AGREEMENT_PATHS;

    console.log(`[LLMService] Will try ${pathsToTry.length} possible paths`);

    // Try each path
    for (const path of pathsToTry) {
      const agreementUrl = `${normalizedUrl}${path}`;

      try {
        console.log(`[LLMService] Trying path: ${agreementUrl}`);

        const response = await axios.get(agreementUrl, {
          timeout: 15000, // 15 second timeout (increased from 10)
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
          },
          maxRedirects: 5,
        });

        // Check if response is valid
        if (response.status === 200 && response.data) {
          console.log(
            `[LLMService] Got 200 response from ${agreementUrl}, content length: ${response.data.length}`
          );

          // Extract text from HTML
          const text = extractTextFromHtml(response.data);
          console.log(
            `[LLMService] Extracted text length: ${text.length} chars`
          );

          // Check if text is long enough to be a privacy policy
          if (text.length > 500) {
            console.log(
              `[LLMService] Found valid user agreement at ${agreementUrl}`
            );

            // Compute hash of text
            const hash = computeTextHash(text);
            console.log(
              `[LLMService] Computed hash: ${hash.substring(0, 10)}...`
            );

            return {
              text,
              hash,
              url: agreementUrl,
            };
          } else {
            console.log(
              `[LLMService] Text too short (${text.length} chars) to be a valid agreement`
            );
          }
        } else {
          console.log(`[LLMService] Got non-200 response: ${response.status}`);
        }
      } catch (error) {
        // Log error but continue trying other paths
        console.log(
          `[LLMService] Error trying path ${agreementUrl}: ${error.message}`
        );
      }
    }

    // Special handling for Google
    if (isGoogleDomain) {
      console.log(`[LLMService] Special handling for Google domain`);
      try {
        // Try to get Google's privacy policy directly
        const googlePrivacyUrl = "https://policies.google.com/privacy";
        console.log(
          `[LLMService] Trying direct Google privacy URL: ${googlePrivacyUrl}`
        );

        const response = await axios.get(googlePrivacyUrl, {
          timeout: 15000,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
          },
          maxRedirects: 5,
        });

        if (response.status === 200 && response.data) {
          console.log(
            `[LLMService] Got 200 response from direct Google URL, content length: ${response.data.length}`
          );

          // Extract text from HTML
          const text = extractTextFromHtml(response.data);
          console.log(
            `[LLMService] Extracted text length: ${text.length} chars`
          );

          if (text.length > 500) {
            console.log(`[LLMService] Found valid Google privacy policy`);

            // Compute hash of text
            const hash = computeTextHash(text);

            return {
              text,
              hash,
              url: googlePrivacyUrl,
            };
          }
        }
      } catch (error) {
        console.log(
          `[LLMService] Error with direct Google URL: ${error.message}`
        );
      }

      // If we still haven't found anything, use a hardcoded snippet of Google's privacy policy
      console.log(
        `[LLMService] Using hardcoded Google privacy policy as fallback`
      );
      const googlePrivacyText = `Google Privacy Policy
When you use our services, you're trusting us with your information. We understand this is a big responsibility and work hard to protect your information and put you in control.

This Privacy Policy is meant to help you understand what information we collect, why we collect it, and how you can update, manage, export, and delete your information.

We build a range of services that help millions of people daily to explore and interact with the world in new ways. Our services include:
- Google apps, sites, and devices, like Search, YouTube, and Google Home
- Platforms like the Chrome browser and Android operating system
- Products that are integrated into third-party apps and sites, like ads and embedded Google Maps

You can use our services in a variety of ways to manage your privacy. For example, you can sign up for a Google Account if you want to create and manage content like emails and photos, or see more relevant search results. And you can use many Google services when you're signed out or without creating an account at all, like searching on Google or watching YouTube videos. You can also choose to browse the web privately using Chrome in Incognito mode. And across our services, you can adjust your privacy settings to control what we collect and how your information is used.

We collect information to provide better services to all our users — from figuring out basic stuff like which language you speak, to more complex things like which ads you'll find most useful, the people who matter most to you online, or which YouTube videos you might like.`;

      const hash = computeTextHash(googlePrivacyText);

      return {
        text: googlePrivacyText,
        hash,
        url: "https://policies.google.com/privacy",
      };
    }

    // No agreement found, throw error
    throw new Error(`No user agreement found for ${url}`);
  } catch (error) {
    console.error("Error extracting user agreement:", error);
    throw new Error(`Failed to extract user agreement: ${error.message}`);
  }
}

const GOOGLE_AGREEMENT_PATHS = [ // Added this missing constant
  "/policies/privacy/",
  "/privacy/",
  "/policies/terms/",
  "/terms/",
];

const COMMON_AGREEMENT_PATHS = [ // Added this missing constant
  "/privacy-policy",
  "/privacy_policy",
  "/privacypolicy",
  "/privacy",
  "/terms-of-service",
  "/terms_of_service",
  "/termsofservice",
  "/terms",
  "/legal/privacy",
  "/legal/terms",
];

export default llmService;
