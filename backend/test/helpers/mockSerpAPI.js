/**
 * Mock SerpAPI responses to avoid API costs during testing
 * This module provides realistic mock responses for different test scenarios
 */

class MockSerpAPI {
  /**
   * Create a successful SerpAPI response with privacy policy results
   * @param {string} domain - The domain being searched
   * @param {string} policyPath - The privacy policy path
   * @returns {Object} Mock SerpAPI response
   */
  static createSuccessResponse(domain, policyPath = '/privacy-policy') {
    return {
      search_metadata: {
        id: "mock-search-id",
        status: "Success",
        json_endpoint: "https://serpapi.com/searches/mock-search-id.json",
        created_at: new Date().toISOString(),
        processed_at: new Date().toISOString(),
        google_url: `https://www.google.com/search?q="privacy+policy"+site:${domain}`,
        raw_html_file: "https://serpapi.com/searches/mock-search-id/mock.html",
        total_time_taken: 1.23
      },
      search_parameters: {
        engine: "google",
        q: `"privacy policy" site:${domain}`,
        google_domain: "google.com",
        gl: "us",
        hl: "en",
        num: "5",
        start: "0"
      },
      search_information: {
        organic_results_state: "Results for exact spelling",
        query_displayed: `"privacy policy" site:${domain}`,
        total_results: 42,
        time_taken_displayed: 0.35
      },
      organic_results: [
        {
          position: 1,
          title: `Privacy Policy - ${domain}`,
          link: `https://${domain}${policyPath}`,
          displayed_link: `${domain} › privacy-policy`,
          snippet: "Our privacy policy explains how we collect, use, and protect your personal information when you use our services. We are committed to transparency...",
          snippet_highlighted_words: ["privacy", "policy"],
          cached_page_link: `https://webcache.googleusercontent.com/search?q=cache:${domain}${policyPath}`,
          related_pages_link: `https://www.google.com/search?q=related:${domain}${policyPath}`,
          source: domain
        },
        {
          position: 2,
          title: `Privacy Notice | ${domain}`,
          link: `https://${domain}/privacy-notice`,
          displayed_link: `${domain} › privacy-notice`,
          snippet: "This privacy notice describes how we handle your personal data in accordance with applicable privacy laws and regulations...",
          snippet_highlighted_words: ["privacy"],
          source: domain
        }
      ],
      related_searches: [
        {
          query: `${domain} terms of service`,
          link: `https://www.google.com/search?q=${domain}+terms+of+service`
        },
        {
          query: `${domain} cookie policy`,
          link: `https://www.google.com/search?q=${domain}+cookie+policy`
        }
      ]
    };
  }

  /**
   * Create a SerpAPI response with no results
   * @returns {Object} Mock SerpAPI response with no results
   */
  static createNoResultsResponse() {
    return {
      search_metadata: {
        id: "mock-search-no-results",
        status: "Success",
        json_endpoint: "https://serpapi.com/searches/mock-search-no-results.json",
        created_at: new Date().toISOString(),
        processed_at: new Date().toISOString(),
        total_time_taken: 0.89
      },
      search_parameters: {
        engine: "google",
        q: '"privacy policy" site:nopolicy.com',
        google_domain: "google.com",
        gl: "us",
        hl: "en",
        num: "5"
      },
      search_information: {
        organic_results_state: "No results found",
        query_displayed: '"privacy policy" site:nopolicy.com',
        total_results: 0,
        time_taken_displayed: 0.12
      },
      organic_results: []
    };
  }

  /**
   * Create a SerpAPI error response
   * @param {string} errorMessage - The error message
   * @returns {Object} Mock SerpAPI error response
   */
  static createErrorResponse(errorMessage) {
    return {
      error: errorMessage
    };
  }

  /**
   * Create a response with mixed domain results (some matching, some not)
   * @param {string} domain - The target domain
   * @returns {Object} Mock SerpAPI response with mixed results
   */
  static createMixedResultsResponse(domain) {
    return {
      search_metadata: {
        id: "mock-search-mixed",
        status: "Success",
        total_time_taken: 1.45
      },
      search_parameters: {
        engine: "google",
        q: `"privacy policy" site:${domain}`,
        num: "5"
      },
      search_information: {
        total_results: 156,
        time_taken_displayed: 0.42
      },
      organic_results: [
        {
          position: 1,
          title: `Privacy Policy - ${domain}`,
          link: `https://${domain}/privacy-policy`,
          snippet: "Our comprehensive privacy policy...",
          source: domain
        },
        {
          position: 2,
          title: "Privacy Policy - Different Site",
          link: "https://different-site.com/privacy",
          snippet: "This is from a different domain...",
          source: "different-site.com"
        },
        {
          position: 3,
          title: `Terms and Privacy - ${domain}`,
          link: `https://www.${domain}/legal/privacy`,
          snippet: "Combined terms and privacy information...",
          source: `www.${domain}`
        }
      ]
    };
  }

  /**
   * Setup axios mocks for different test scenarios
   * This method configures axios.get to return different responses based on the search query
   */
  static setupMocks() {
    const axios = require('axios');
    
    // Ensure axios.get is mocked
    if (!axios.get.mockImplementation) {
      throw new Error('axios.get must be mocked before calling setupMocks()');
    }
    
    axios.get.mockImplementation((url, config) => {
      // Extract parameters from the request
      const params = config?.params || {};
      const query = params.q || '';
      
      // Extract domain from search query using regex
      const domainMatch = query.match(/site:([^\s]+)/);
      if (!domainMatch) {
        // Default response if no domain found
        return Promise.resolve({
          status: 200,
          data: this.createSuccessResponse('default.com')
        });
      }
      
      const domain = domainMatch[1];
      
      // Return different responses based on domain for testing
      if (domain.includes('example.com')) {
        return Promise.resolve({
          status: 200,
          data: this.createSuccessResponse(domain)
        });
      } else if (domain.includes('nopolicy.com')) {
        return Promise.resolve({
          status: 200,
          data: this.createNoResultsResponse()
        });
      } else if (domain.includes('error.com')) {
        return Promise.resolve({
          status: 200,
          data: this.createErrorResponse('API quota exceeded')
        });
      } else if (domain.includes('mixed.com')) {
        return Promise.resolve({
          status: 200,
          data: this.createMixedResultsResponse(domain)
        });
      } else if (domain.includes('timeout.com')) {
        return Promise.reject(new Error('Request timeout'));
      } else if (domain.includes('network-error.com')) {
        const error = new Error('Network Error');
        error.code = 'ECONNREFUSED';
        return Promise.reject(error);
      } else if (domain.includes('rate-limit.com')) {
        const error = new Error('Rate limit exceeded');
        error.response = {
          status: 429,
          data: { error: 'Too Many Requests' }
        };
        return Promise.reject(error);
      }
      
      // Default success response for unknown domains
      return Promise.resolve({
        status: 200,
        data: this.createSuccessResponse(domain)
      });
    });
  }

  /**
   * Setup specific mock response for a domain
   * @param {string} domain - The domain to mock
   * @param {Object} response - The response to return
   */
  static setupMockForDomain(domain, response) {
    const axios = require('axios');
    
    const originalImplementation = axios.get.mockImplementation;
    
    axios.get.mockImplementation((url, config) => {
      const params = config?.params || {};
      const query = params.q || '';
      const domainMatch = query.match(/site:([^\s]+)/);
      
      if (domainMatch && domainMatch[1] === domain) {
        return Promise.resolve({
          status: 200,
          data: response
        });
      }
      
      // Fall back to original implementation for other domains
      return originalImplementation ? originalImplementation(url, config) : 
        Promise.resolve({ status: 200, data: this.createSuccessResponse('default.com') });
    });
  }

  /**
   * Reset all mocks to default state
   */
  static resetMocks() {
    const axios = require('axios');
    if (axios.get.mockReset) {
      axios.get.mockReset();
    }
  }

  /**
   * Get mock response for testing specific scenarios
   * @param {string} scenario - The test scenario
   * @param {string} domain - The domain (optional)
   * @returns {Object} Mock response for the scenario
   */
  static getMockResponse(scenario, domain = 'example.com') {
    switch (scenario) {
      case 'success':
        return this.createSuccessResponse(domain);
      case 'no-results':
        return this.createNoResultsResponse();
      case 'error':
        return this.createErrorResponse('Test error');
      case 'mixed':
        return this.createMixedResultsResponse(domain);
      default:
        return this.createSuccessResponse(domain);
    }
  }
}

module.exports = MockSerpAPI; 