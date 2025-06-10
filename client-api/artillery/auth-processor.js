const jwt = require('jsonwebtoken');

// Generate a test JWT token for validation/refresh testing
function generateTestToken(context, events, done) {
  const testUser = {
    id: 'test_user_' + Math.random().toString(36).substr(2, 9),
    email: 'test@example.com',
    name: 'Test User'
  };
  
  const token = jwt.sign(testUser, process.env.JWT_SECRET || 'test_jwt_secret', {
    expiresIn: '1h'
  });
  
  context.vars.testToken = token;
  return done();
}

// Generate random string for unique identifiers
function randomString(context, events, done) {
  context.vars.randomId = Math.random().toString(36).substr(2, 9);
  return done();
}

// Generate random email for registration
function randomEmail(context, events, done) {
  const randomId = Math.random().toString(36).substr(2, 9);
  context.vars.randomEmail = `test_${randomId}@example.com`;
  return done();
}

module.exports = {
  generateTestToken,
  randomString,
  randomEmail
}; 