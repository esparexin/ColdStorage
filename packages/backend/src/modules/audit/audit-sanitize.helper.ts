export function sanitizeLogString(raw: string, maxLength = 255): string {
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\r\n\x00-\x1F\x7F]/g, '').slice(0, maxLength).trim();
}

export function normalizeIpAddress(rawIp?: string): string {
  if (!rawIp) return '127.0.0.1';
  const first = rawIp.split(',')[0].trim().replace(/^::ffff:/, '') || '127.0.0.1';
  return sanitizeLogString(first, 64) || '127.0.0.1';
}

export function normalizeUserAgentString(rawAgent?: string): string {
  if (!rawAgent) return 'Unknown';
  return sanitizeLogString(rawAgent, 255) || 'Unknown';
}
