import { getNormalizedDomain, normalizeUrl } from '../utils.js';

describe('getNormalizedDomain', () => {
  test('returns empty string for null/undefined/empty input', () => {
    expect(getNormalizedDomain(null)).toBe('');
    expect(getNormalizedDomain(undefined)).toBe('');
    expect(getNormalizedDomain('')).toBe('');
  });

  test('returns simple domains unchanged', () => {
    expect(getNormalizedDomain('example.com')).toBe('example.com');
    expect(getNormalizedDomain('localhost')).toBe('localhost');
  });

  test('strips subdomains to eTLD+1', () => {
    expect(getNormalizedDomain('legal.yahoo.com')).toBe('yahoo.com');
    expect(getNormalizedDomain('a.b.c.example.org')).toBe('example.org');
  });

  test('handles known multi-part TLDs', () => {
    expect(getNormalizedDomain('www.bbc.co.uk')).toBe('bbc.co.uk');
    expect(getNormalizedDomain('shop.example.com.au')).toBe('example.com.au');
    expect(getNormalizedDomain('deeper.sub.site.ac.uk')).toBe('site.ac.uk');
    expect(getNormalizedDomain('example.co.jp')).toBe('example.co.jp');
  });

  test('returns IP addresses unchanged', () => {
    expect(getNormalizedDomain('192.168.1.1')).toBe('192.168.1.1');
    expect(getNormalizedDomain('8.8.8.8')).toBe('8.8.8.8');
  });

  test('does not confuse co.uk-like suffixes with regular domains', () => {
    expect(getNormalizedDomain('example.co.uk')).toBe('example.co.uk');
  });
});

describe('normalizeUrl', () => {
  test('returns empty string for falsy input', () => {
    expect(normalizeUrl(null)).toBe('');
    expect(normalizeUrl('')).toBe('');
  });

  test('extracts and normalizes domain from full URLs', () => {
    expect(normalizeUrl('https://legal.yahoo.com/privacy')).toBe('yahoo.com');
    expect(normalizeUrl('http://sub.example.co.uk/path?q=1')).toBe('example.co.uk');
  });

  test('removes www prefix', () => {
    expect(normalizeUrl('https://www.example.com/')).toBe('example.com');
    expect(normalizeUrl('www.example.com/page')).toBe('example.com');
  });

  test('adds https scheme when missing', () => {
    expect(normalizeUrl('example.com/some/path')).toBe('example.com');
  });

  test('trims whitespace', () => {
    expect(normalizeUrl('  https://example.com/page  ')).toBe('example.com');
  });

  test('returns original input when URL cannot be parsed', () => {
    // A string of only spaces trims to empty then fails URL parsing
    const invalid = 'http://';
    expect(normalizeUrl(invalid)).toBe(invalid);
  });
});
