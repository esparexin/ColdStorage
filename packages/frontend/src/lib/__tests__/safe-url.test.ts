import { describe, expect, it } from 'vitest';
import { sanitizeReturnUrl } from '../safe-url';

describe('sanitizeReturnUrl', () => {
  it('allows valid safe relative paths', () => {
    expect(sanitizeReturnUrl('/deliveries')).toBe('/deliveries');
    expect(sanitizeReturnUrl('/grns?tab=issue')).toBe('/grns?tab=issue');
    expect(sanitizeReturnUrl('/rent/billing')).toBe('/rent/billing');
    expect(sanitizeReturnUrl('/')).toBe('/');
  });

  it('rejects external URLs (open redirect)', () => {
    expect(sanitizeReturnUrl('https://evil.com')).toBe('/');
    expect(sanitizeReturnUrl('http://evil.com/phish')).toBe('/');
    expect(sanitizeReturnUrl('//evil.com')).toBe('/');
    expect(sanitizeReturnUrl('//evil.com/path')).toBe('/');
  });

  it('rejects javascript: and data: URIs (XSS)', () => {
    expect(sanitizeReturnUrl('javascript:void(0)')).toBe('/');
    expect(sanitizeReturnUrl('data:text/html,<script>console.log(1)</script>')).toBe('/');
  });

  it('rejects backslash bypasses', () => {
    expect(sanitizeReturnUrl('/\\evil.com')).toBe('/');
    expect(sanitizeReturnUrl('/path\\subpath')).toBe('/');
  });

  it('handles null, undefined, empty, or non-string inputs safely', () => {
    expect(sanitizeReturnUrl(null)).toBe('/');
    expect(sanitizeReturnUrl(undefined)).toBe('/');
    expect(sanitizeReturnUrl('')).toBe('/');
    expect(sanitizeReturnUrl('   ')).toBe('/');
  });
});
