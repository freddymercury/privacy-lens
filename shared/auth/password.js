const bcrypt = require('bcrypt');

/**
 * Pure function to determine salt rounds based on environment
 * @param {string} environment - Environment (development, production, test)
 * @returns {number} Number of salt rounds
 */
function getSaltRounds(environment = 'production') {
  // Use fewer rounds in test environment for speed, more in production for security
  switch (environment) {
    case 'test':
      return 4;  // Faster for tests
    case 'development':
      return 8;  // Balance between speed and security
    case 'production':
    default:
      return 10; // Standard security level
  }
}

/**
 * Pure function to validate password requirements
 * @param {string} password - Password to validate
 * @returns {Object} Validation result with isValid boolean and errors array
 */
function validatePasswordRequirements(password) {
  const errors = [];
  
  if (!password) {
    errors.push('Password is required');
    return { isValid: false, errors };
  }
  
  if (typeof password !== 'string') {
    errors.push('Password must be a string');
    return { isValid: false, errors };
  }
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  
  if (password.length > 128) {
    errors.push('Password must be less than 128 characters');
  }
  
  // Optional: Add more password complexity requirements
  // if (!/[A-Z]/.test(password)) {
  //   errors.push('Password must contain at least one uppercase letter');
  // }
  
  // if (!/[a-z]/.test(password)) {
  //   errors.push('Password must contain at least one lowercase letter');
  // }
  
  // if (!/[0-9]/.test(password)) {
  //   errors.push('Password must contain at least one number');
  // }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Hash password using bcrypt
 * @param {string} password - Plain text password
 * @param {number} saltRounds - Number of salt rounds (optional)
 * @returns {Promise<string>} Hashed password
 */
async function hashPassword(password, saltRounds = 10) {
  const validation = validatePasswordRequirements(password);
  if (!validation.isValid) {
    throw new Error(`Password validation failed: ${validation.errors.join(', ')}`);
  }
  
  return await bcrypt.hash(password, saltRounds);
}

/**
 * Compare password with hash
 * @param {string} password - Plain text password
 * @param {string} hash - Hashed password
 * @returns {Promise<boolean>} Whether password matches hash
 */
async function comparePassword(password, hash) {
  if (!password || !hash) {
    return false;
  }
  
  if (typeof password !== 'string' || typeof hash !== 'string') {
    return false;
  }
  
  try {
    return await bcrypt.compare(password, hash);
  } catch (error) {
    // Invalid hash format or other bcrypt error
    return false;
  }
}

/**
 * Pure function to check if hash format is valid bcrypt
 * @param {string} hash - Hash to validate
 * @returns {boolean} Whether hash appears to be valid bcrypt format
 */
function isValidBcryptHash(hash) {
  if (!hash || typeof hash !== 'string') {
    return false;
  }
  
  // Bcrypt hashes start with $2a$, $2b$, $2x$, or $2y$ followed by cost and salt
  const bcryptPattern = /^\$2[abxy]\$\d{1,2}\$[./A-Za-z0-9]{22}[./A-Za-z0-9]{31}$/;
  return bcryptPattern.test(hash);
}

/**
 * Generate salt for password hashing
 * @param {number} rounds - Number of salt rounds
 * @returns {Promise<string>} Generated salt
 */
async function generateSalt(rounds = 10) {
  return await bcrypt.genSalt(rounds);
}

/**
 * Hash password with explicit salt (useful for testing)
 * @param {string} password - Plain text password
 * @param {string} salt - Pre-generated salt
 * @returns {Promise<string>} Hashed password
 */
async function hashPasswordWithSalt(password, salt) {
  const validation = validatePasswordRequirements(password);
  if (!validation.isValid) {
    throw new Error(`Password validation failed: ${validation.errors.join(', ')}`);
  }
  
  return await bcrypt.hash(password, salt);
}

/**
 * Wrapper function for user registration (with environment-aware salt rounds)
 * @param {string} password - Plain text password
 * @param {string} environment - Environment (for salt rounds)
 * @returns {Promise<string>} Hashed password
 */
async function hashPasswordForRegistration(password, environment = 'production') {
  const saltRounds = getSaltRounds(environment);
  return await hashPassword(password, saltRounds);
}

/**
 * Wrapper function for user login validation
 * @param {string} password - Plain text password
 * @param {string} storedHash - Stored password hash
 * @returns {Promise<boolean>} Whether login is valid
 */
async function validateUserPassword(password, storedHash) {
  if (!isValidBcryptHash(storedHash)) {
    return false;
  }
  
  return await comparePassword(password, storedHash);
}

module.exports = {
  // Pure functions
  getSaltRounds,
  validatePasswordRequirements,
  isValidBcryptHash,
  
  // Async functions (bcrypt operations)
  hashPassword,
  comparePassword,
  generateSalt,
  hashPasswordWithSalt,
  
  // Wrapper functions
  hashPasswordForRegistration,
  validateUserPassword
}; 