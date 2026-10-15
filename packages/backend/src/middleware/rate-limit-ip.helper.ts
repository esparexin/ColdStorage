/** Collapses IPv6 to /64 so one /64 cannot mint unlimited buckets; IPv4 unchanged. */
export function normalizeRateLimitIp(raw?: string): string {
  if (!raw) return '127.0.0.1';
  const ip = raw.split(',')[0].trim().replace(/^::ffff:/, '');
  if (!ip.includes(':')) return ip;
  const parts = ip.split(':').filter(Boolean);
  if (parts.length < 4) return ip;
  return `${parts.slice(0, 4).join(':')}::/64`;
}
