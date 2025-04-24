// Login and registration functionality for PrivacyLens Chrome Plugin

import { login, register, isAuthenticated } from './auth.js';

// DOM Elements
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const loginButton = document.getElementById('login-button');
const registerButton = document.getElementById('register-button');
const showRegisterLink = document.getElementById('show-register');
const showLoginLink = document.getElementById('show-login');
const loginError = document.getElementById('login-error');
const registerError = document.getElementById('register-error');
const registerSuccess = document.getElementById('register-success');
const loadingIndicator = document.getElementById('loading');

// Email validation regex
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Check if user is already authenticated
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const authenticated = await isAuthenticated();
    if (authenticated) {
      // Redirect to popup.html if already authenticated
      window.location.href = 'popup.html';
    }
  } catch (error) {
    console.error('[PrivacyLens Login] Error checking authentication:', error);
  }
});

// Toggle between login and register forms
showRegisterLink.addEventListener('click', () => {
  loginForm.style.display = 'none';
  registerForm.style.display = 'block';
  clearErrors();
});

showLoginLink.addEventListener('click', () => {
  registerForm.style.display = 'none';
  loginForm.style.display = 'block';
  clearErrors();
});

// Handle login form submission
loginButton.addEventListener('click', async () => {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  
  clearErrors();
  
  // Validate inputs
  if (!email || !password) {
    showError(loginError, 'Please enter both email and password');
    return;
  }
  
  if (!emailRegex.test(email)) {
    showError(loginError, 'Please enter a valid email address');
    return;
  }
  
  // Show loading indicator
  showLoading(true);
  
  try {
    const result = await login(email, password);
    
    if (result.success) {
      // Redirect to popup.html on successful login
      window.location.href = 'popup.html';
    } else {
      showError(loginError, result.error || 'Login failed. Please check your credentials.');
    }
  } catch (error) {
    console.error('[PrivacyLens Login] Login error:', error);
    showError(loginError, 'An unexpected error occurred. Please try again.');
  } finally {
    showLoading(false);
  }
});

// Handle register form submission
registerButton.addEventListener('click', async () => {
  const name = document.getElementById('register-name').value.trim();
  const email = document.getElementById('register-email').value.trim();
  const password = document.getElementById('register-password').value;
  const confirmPassword = document.getElementById('register-confirm-password').value;
  
  clearErrors();
  
  // Validate inputs
  if (!name || !email || !password || !confirmPassword) {
    showError(registerError, 'Please fill in all fields');
    return;
  }
  
  if (!emailRegex.test(email)) {
    showError(registerError, 'Please enter a valid email address');
    return;
  }
  
  if (password.length < 8) {
    showError(registerError, 'Password must be at least 8 characters long');
    return;
  }
  
  if (password !== confirmPassword) {
    showError(registerError, 'Passwords do not match');
    return;
  }
  
  // Show loading indicator
  showLoading(true);
  
  try {
    const result = await register(email, password, name);
    
    if (result.success) {
      // Show success message
      showSuccess(registerSuccess, 'Registration successful! You can now sign in.');
      
      // Clear form fields
      document.getElementById('register-name').value = '';
      document.getElementById('register-email').value = '';
      document.getElementById('register-password').value = '';
      document.getElementById('register-confirm-password').value = '';
      
      // Switch to login form after a delay
      setTimeout(() => {
        registerForm.style.display = 'none';
        loginForm.style.display = 'block';
        clearErrors();
      }, 3000);
    } else {
      showError(registerError, result.error || 'Registration failed. Please try again.');
    }
  } catch (error) {
    console.error('[PrivacyLens Login] Registration error:', error);
    showError(registerError, 'An unexpected error occurred. Please try again.');
  } finally {
    showLoading(false);
  }
});

// Helper functions
function showError(element, message) {
  element.textContent = message;
  element.style.display = 'block';
}

function showSuccess(element, message) {
  element.textContent = message;
  element.style.display = 'block';
}

function clearErrors() {
  loginError.style.display = 'none';
  registerError.style.display = 'none';
  registerSuccess.style.display = 'none';
}

function showLoading(show) {
  if (show) {
    loadingIndicator.style.display = 'block';
    loginButton.disabled = true;
    registerButton.disabled = true;
  } else {
    loadingIndicator.style.display = 'none';
    loginButton.disabled = false;
    registerButton.disabled = false;
  }
}
