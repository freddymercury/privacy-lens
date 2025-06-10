// Generate test URLs for assessment testing
function generateTestUrl(context, events, done) {
  const domains = [
    'example.com',
    'testsite.com', 
    'demoapp.org',
    'samplewebsite.net',
    'privacytest.io',
    'mocksite.co'
  ];
  
  const randomDomain = domains[Math.floor(Math.random() * domains.length)];
  const randomId = Math.random().toString(36).substr(2, 5);
  
  context.vars.testUrl = `${randomDomain}/${randomId}`;
  return done();
}

// Generate sample privacy policy text for assessment
function generatePolicyText(context, events, done) {
  const policyTexts = [
    "We collect personal information including your name, email address, and usage data. This information is used to provide our services and may be shared with third-party partners for marketing purposes.",
    "Our privacy policy outlines how we handle your data. We collect minimal information necessary for service operation and do not sell personal data to third parties.",
    "We gather user information such as IP addresses, browser data, and cookies. This data helps us improve our services and may be used for targeted advertising.",
    "Personal data collection includes contact information and behavioral analytics. We implement strong security measures and only share data with trusted partners.",
    "We collect and process personal information in accordance with GDPR. Users have the right to access, modify, or delete their data at any time.",
    "Data collection includes essential service information and optional analytics. We use encryption and secure storage practices to protect user privacy."
  ];
  
  const randomText = policyTexts[Math.floor(Math.random() * policyTexts.length)];
  context.vars.policyText = randomText;
  return done();
}

// Generate random domain for testing
function generateDomain(context, events, done) {
  const tlds = ['com', 'org', 'net', 'io', 'co'];
  const randomName = Math.random().toString(36).substr(2, 8);
  const randomTld = tlds[Math.floor(Math.random() * tlds.length)];
  
  context.vars.testDomain = `${randomName}.${randomTld}`;
  return done();
}

module.exports = {
  generateTestUrl,
  generatePolicyText,
  generateDomain
}; 