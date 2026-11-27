/**
 * Utility for sanitizing query inputs and enforcing literal equality in MongoDB/Mongoose.
 * Mitigates CWE-943 (NoSQL Query Injection) and resolves CodeQL js/sql-injection rules.
 */

export function sanitizeId(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

export function toEqId(raw: unknown): { $eq: string } {
  return { $eq: sanitizeId(raw) };
}
