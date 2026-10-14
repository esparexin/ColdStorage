/**
 * Validates and sanitizes untrusted client-side returnUrl query parameters
 * to prevent open redirects (CWE-601) and client-side XSS (CWE-79).
 *
 * Rules:
 * - Must be a safe relative path starting with a single '/'
 * - Must NOT start with '//' (protocol-relative URL)
 * - Must NOT contain '\\' (path normalization bypass)
 * - Falls back to '/' for any invalid or external target.
 */
export function sanitizeReturnUrl(url: string | null | undefined): string {
  if (!url || typeof url !== 'string') return '/';
  const trimmed = url.trim();
  if (
    trimmed.startsWith('/') &&
    !trimmed.startsWith('//') &&
    !trimmed.includes('\\')
  ) {
    return trimmed;
  }
  return '/';
}
