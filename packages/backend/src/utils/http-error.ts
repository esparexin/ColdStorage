import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { logger } from './logger.js';

/**
 * Canonical domain-error to HTTP mapping.
 *
 * Route handlers previously derived status codes by substring-matching free-text service
 * messages (`message.includes('already exists') ? 409 : 400`). That is fragile: the status
 * silently changes if a message is reworded, and the same predicates were restated across
 * every router. The marker sets below are the union of every predicate the routes used, so
 * behaviour is preserved while the rules themselves now live in one place.
 */

/** Authorization failures surface as 403 and are checked first. */
const UNAUTHORIZED_MARKERS = ['Unauthorized'];

/** Substrings indicating a uniqueness/duplicate-key or referential-integrity conflict. */
const CONFLICT_MARKERS = [
  // MongoDB surfaces a lost check-then-insert race as a driver error. Without this marker the
  // duplicate-key case was reported as 400 while the guarded path returned 409.
  'duplicate key',
  'E11000',
  'already exists',
  'cannot be deleted',
  'already registered',
  'already in use',
  'active chambers',
  'active inventory',
  'reduce capacity',
  // Narrowed from bare 'inactive'/'active': every current producer phrases the state as
  // "<entity> is inactive" (facility/customer/commodity/user), so match that phrase
  // instead of any message merely containing those substrings.
  'is inactive',
];

/** Substrings indicating the addressed entity does not exist. */
const NOT_FOUND_MARKERS = ['not found', 'no longer exists'];

export type DomainErrorKind = 'unauthorized' | 'conflict' | 'notFound' | 'badRequest';

/**
 * Classifies a domain error message into an HTTP-ish kind.
 * Matching is case-insensitive so uppercase codes (GRN_NOT_FOUND,
 * FACILITY_MISMATCH) classify the same as their lowercase phrases.
 * Exported so handlers and tests can assert on the classification directly.
 */
export function classifyDomainError(message: string): DomainErrorKind {
  const normalized = message.toLowerCase();
  if (UNAUTHORIZED_MARKERS.some((marker) => normalized.includes(marker.toLowerCase()))) {
    return 'unauthorized';
  }
  if (CONFLICT_MARKERS.some((marker) => normalized.includes(marker.toLowerCase()))) {
    return 'conflict';
  }
  if (
    NOT_FOUND_MARKERS.some((marker) => normalized.includes(marker.toLowerCase())) ||
    normalized.includes('not_found')
  ) {
    return 'notFound';
  }
  return 'badRequest';
}

export function statusForDomainError(message: string): 400 | 403 | 404 | 409 {
  switch (classifyDomainError(message)) {
    case 'unauthorized':
      return 403;
    case 'conflict':
      return 409;
    case 'notFound':
      return 404;
    default:
      return 400;
  }
}

/**
 * Writes a domain error to the response using the canonical classification.
 * `fallbackMessage` is used when the thrown value carries no message.
 *
 * Response envelope SSOT note (F29, non-breaking): success shapes vary by
 * domain ({entity} vs {items,total} vs {success:true}) and are preserved for
 * frontend compatibility. Error shape is uniforme {error:message}. Do not add
 * a second `code` field without a contract minor + frontend trace.
 */
export function sendServiceError(res: Response, err: unknown, fallbackMessage: string): void {
  const message = err instanceof Error ? err.message : fallbackMessage;
  res.status(statusForDomainError(message)).json({ error: message });
}


/**
 * Writes an UNEXPECTED server fault without echoing the underlying error.
 *
 * Route handlers previously did `res.status(500).json({ error: err.message })`
 * in ~15 places. Mongoose and MongoDB errors carry internal structure, for
 * example:
 *
 *   E11000 duplicate key error collection: cold_storage.grns
 *   index: facilityId_1_grnNumber_1 dup key: { facilityId: "..." }
 *
 * which discloses the database name, collection names, index names and key
 * paths to any authenticated user who can trigger a duplicate or a schema
 * error. The widest exposures were settings.routes.ts and audit.routes.ts,
 * both reachable by every READ_ONLY user.
 *
 * The detail is logged server-side; the client receives a fixed message plus a
 * correlation id it can quote in a support request. This mirrors the terminal
 * handler in app.ts, which already did this correctly and was the only place
 * that did.
 */
export function sendInternalError(res: Response, err: unknown, context: string): void {
  const reference = randomUUID();
  const detail = err instanceof Error ? err.message : String(err);
  logger.error('Unhandled request error', { context, reference, detail, stack: err instanceof Error ? err.stack : undefined });
  res.status(500).json({ error: 'Internal server error', reference });
}
