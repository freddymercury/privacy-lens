/**
 * @jest-environment jsdom
 */
// Interaction tests for login.html + login.js (jsdom + mocked auth module).
import { loadPage, flush, initPage } from './helpers/loadPage.js';
import { login, register, isAuthenticated } from '../auth.js';

jest.mock('../auth.js', () => ({
  login: jest.fn(),
  register: jest.fn(),
  isAuthenticated: jest.fn()
}));

function setLocationStub() {
  delete window.location;
  window.location = { href: '' };
}

// login.js grabs DOM elements at module load; page must be in the DOM first.
setLocationStub();
loadPage('login.html');
require('../login.js');

function fillLogin(email, password) {
  document.getElementById('email').value = email;
  document.getElementById('password').value = password;
}

function fillRegister(name, email, password, confirm) {
  document.getElementById('register-name').value = name;
  document.getElementById('register-email').value = email;
  document.getElementById('register-password').value = password;
  document.getElementById('register-confirm-password').value = confirm;
}

beforeEach(async () => {
  jest.clearAllMocks();
  setLocationStub();
  isAuthenticated.mockResolvedValue(false);
  await initPage();
});

describe('page load', () => {
  test('shows login form by default and hides register form', () => {
    expect(document.getElementById('login-form').style.display).not.toBe('none');
    expect(document.getElementById('register-form').style.display).toBe('none');
  });

  test('redirects to popup.html when already authenticated', async () => {
    isAuthenticated.mockResolvedValue(true);
    await initPage();
    expect(window.location.href).toBe('popup.html');
  });
});

describe('form toggle links', () => {
  test('Sign Up link switches to register form', () => {
    document.getElementById('show-register').click();
    expect(document.getElementById('login-form').style.display).toBe('none');
    expect(document.getElementById('register-form').style.display).toBe('block');
  });

  test('Sign In link switches back to login form', () => {
    document.getElementById('show-register').click();
    document.getElementById('show-login').click();
    expect(document.getElementById('register-form').style.display).toBe('none');
    expect(document.getElementById('login-form').style.display).toBe('block');
  });
});

describe('login button', () => {
  test('rejects empty credentials without calling the API', async () => {
    fillLogin('', '');
    document.getElementById('login-button').click();
    await flush();

    expect(login).not.toHaveBeenCalled();
    expect(document.getElementById('login-error').textContent).toBe('Please enter both email and password');
  });

  test('rejects malformed email without calling the API', async () => {
    fillLogin('not-an-email', 'password123');
    document.getElementById('login-button').click();
    await flush();

    expect(login).not.toHaveBeenCalled();
    expect(document.getElementById('login-error').textContent).toBe('Please enter a valid email address');
  });

  test('valid credentials call login and redirect to popup.html', async () => {
    login.mockResolvedValue({ success: true, user: { email: 'user@example.com' } });
    fillLogin('user@example.com', 'password123');
    document.getElementById('login-button').click();
    await flush();

    expect(login).toHaveBeenCalledWith('user@example.com', 'password123');
    expect(window.location.href).toBe('popup.html');
    expect(document.getElementById('login-error').style.display).not.toBe('block');
  });

  test('failed login shows server error and stays on page', async () => {
    login.mockResolvedValue({ success: false, error: 'Invalid credentials' });
    fillLogin('user@example.com', 'wrongpass');
    document.getElementById('login-button').click();
    await flush();

    expect(window.location.href).toBe('');
    expect(document.getElementById('login-error').textContent).toBe('Invalid credentials');
    expect(document.getElementById('login-error').style.display).toBe('block');
    expect(document.getElementById('login-button').disabled).toBe(false);
  });

  test('unexpected login exception shows generic error', async () => {
    login.mockRejectedValue(new Error('network'));
    fillLogin('user@example.com', 'password123');
    document.getElementById('login-button').click();
    await flush();

    expect(document.getElementById('login-error').textContent).toBe('An unexpected error occurred. Please try again.');
  });

  test('Enter key in password field triggers login', async () => {
    login.mockResolvedValue({ success: true, user: {} });
    fillLogin('user@example.com', 'password123');
    document.getElementById('password').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await flush();

    expect(login).toHaveBeenCalledWith('user@example.com', 'password123');
  });
});

describe('register button', () => {
  beforeEach(() => {
    document.getElementById('show-register').click();
  });

  test('rejects incomplete fields', async () => {
    fillRegister('', 'user@example.com', 'password123', 'password123');
    document.getElementById('register-button').click();
    await flush();

    expect(register).not.toHaveBeenCalled();
    expect(document.getElementById('register-error').textContent).toBe('Please fill in all fields');
  });

  test('rejects short passwords', async () => {
    fillRegister('User', 'user@example.com', 'short', 'short');
    document.getElementById('register-button').click();
    await flush();

    expect(register).not.toHaveBeenCalled();
    expect(document.getElementById('register-error').textContent).toBe('Password must be at least 8 characters long');
  });

  test('rejects mismatched passwords', async () => {
    fillRegister('User', 'user@example.com', 'password123', 'password456');
    document.getElementById('register-button').click();
    await flush();

    expect(register).not.toHaveBeenCalled();
    expect(document.getElementById('register-error').textContent).toBe('Passwords do not match');
  });

  test('valid registration calls register and shows success', async () => {
    register.mockResolvedValue({ success: true, user: { email: 'new@example.com' } });
    fillRegister('New User', 'new@example.com', 'password123', 'password123');
    document.getElementById('register-button').click();
    await flush();

    expect(register).toHaveBeenCalledWith('new@example.com', 'password123', 'New User');
    expect(document.getElementById('register-success').textContent).toContain('Registration successful');
    // Form fields are cleared after success
    expect(document.getElementById('register-email').value).toBe('');
  });

  test('failed registration shows error', async () => {
    register.mockResolvedValue({ success: false, error: 'Email already in use' });
    fillRegister('User', 'taken@example.com', 'password123', 'password123');
    document.getElementById('register-button').click();
    await flush();

    expect(document.getElementById('register-error').textContent).toBe('Email already in use');
  });
});
