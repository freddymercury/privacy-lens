// Build script to generate pre-packaged database for PrivacyGuard Chrome Plugin
// This script fetches all assessments from the server and generates assessments.json

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { API_BASE_URL } = require('./config.node.js');

// Configuration
const OUTPUT_FILE = path.join(__dirname, 'assessments.json');

/**
 * Fetch all assessments from the server
 * @returns {Promise<Object>} - Object with domains as keys and assessments as values
 */
async function fetchAllAssessments() {
  try {
    console.log(`Fetching all assessments from ${API_BASE_URL}/all-assessments`);
    
    const response = await fetch(`${API_BASE_URL}/all-assessments`);
    
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.status !== 'success' || !data.assessments) {
      throw new Error('Invalid server response format');
    }
    
    console.log(`Successfully fetched ${Object.keys(data.assessments).length} assessments`);
    return data.assessments;
  } catch (error) {
    console.error('Error fetching assessments:', error);
    throw error;
  }
}

/**
 * Generate the pre-packaged database file
 * @param {Object} assessments - Object with domains as keys and assessments as values
 */
function generatePrepackagedDatabase(assessments) {
  try {
    const prepackagedData = {
      version: '1.0.0',
      generatedAt: Date.now(),
      assessments: {}
    };
    
    // Process each assessment
    for (const [domain, assessment] of Object.entries(assessments)) {
      prepackagedData.assessments[domain] = {
        assessment: assessment,
        metadata: {
          timestamp: Date.now(),
          version: '1.0.0'
        }
      };
    }
    
    // Write to file
    fs.writeFileSync(
      OUTPUT_FILE,
      JSON.stringify(prepackagedData, null, 2),
      'utf8'
    );
    
    console.log(`Successfully generated pre-packaged database with ${Object.keys(prepackagedData.assessments).length} assessments`);
    console.log(`Output file: ${OUTPUT_FILE}`);
  } catch (error) {
    console.error('Error generating pre-packaged database:', error);
    throw error;
  }
}

/**
 * Generate sample data if server fetch fails
 * This ensures we always have some data to work with during development
 */
function generateSampleData() {
  console.log('Generating sample data...');
  
  const domains = [
    'google.com',
    'facebook.com',
    'amazon.com',
    'twitter.com',
    'microsoft.com',
    'apple.com',
    'netflix.com',
    'reddit.com',
    'wikipedia.org',
    'github.com'
  ];
  
  const riskLevels = ['low', 'medium', 'high'];
  const categories = ['dataCollection', 'dataSharing', 'userControl', 'dataRetention'];
  
  const sampleAssessments = {};
  
  domains.forEach(domain => {
    const riskLevel = riskLevels[Math.floor(Math.random() * riskLevels.length)];
    
    const assessment = {
      riskLevel: riskLevel,
      categories: {},
      summary: `Sample assessment for ${domain}`
    };
    
    // Generate random categories
    categories.forEach(category => {
      const categoryRisk = riskLevels[Math.floor(Math.random() * riskLevels.length)];
      assessment.categories[category] = {
        risk: categoryRisk,
        details: `Sample ${categoryRisk} risk for ${category}`
      };
    });
    
    sampleAssessments[domain] = assessment;
  });
  
  return sampleAssessments;
}

/**
 * Main function
 */
async function main() {
  try {
    console.log('Starting pre-packaged database build...');
    
    let assessments;
    
    try {
      // Try to fetch from server
      assessments = await fetchAllAssessments();
    } catch (error) {
      // Never silently ship fabricated risk levels. Sample data is only allowed
      // when explicitly requested (local UI development with no backend).
      if (process.env.ALLOW_SAMPLE_DATA === '1') {
        console.warn('Failed to fetch from server, using sample data instead (ALLOW_SAMPLE_DATA=1)');
        assessments = generateSampleData();
      } else {
        console.error('Failed to fetch assessments from server and ALLOW_SAMPLE_DATA is not set.');
        console.error('Refusing to write sample data to assessments.json (fake risk levels must never ship).');
        throw error;
      }
    }
    
    // Generate the pre-packaged database
    generatePrepackagedDatabase(assessments);
    
    console.log('Pre-packaged database build completed successfully');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

// Run the main function
main();
