import type { Response } from 'express';
import type { RentPaymentRequiredError } from '../modules/common/rent-gate.service.js';

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
  'already exists',
  'already registered',
  'already in use',
  'active chambers',
  'active inventory',
  'reduce capacity',
  'inactive',
  // Broadest marker, evaluated last, matching the original per-router predicates.
  'active',
];

/** Substrings indicating the addressed entity does not exist. */
const NOT_FOUND_MARKERS = ['not found', 'no longer exists'];

export type DomainErrorKind = 'unauthorized' | 'conflict' | 'notFound' | 'badRequest';

/**
 * Classifies a domain error message into an HTTP-ish kind.
 * Exported so handlers and tests can assert on the classification directly.
 */
export function classifyDomainError(message: string): DomainErrorKind {
  if (UNAUTHORIZED_MARKERS.some((marker) => message.includes(marker))) {
    return 'unauthorized';
  }
  if (CONFLICT_MARKERS.some((marker) => message.includes(marker))) {
    return 'conflict';
  }
  if (NOT_FOUND_MARKERS.some((marker) => message.includes(marker))) {
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
 */
export function sendServiceError(res: Response, err: unknown, fallbackMessage: string): void {
  const message = err instanceof Error ? err.message : fallbackMessage;
  res.status(statusForDomainError(message)).json({ error: message });
}
/**
 * Canonical 402 responder for the shared rent gate.
 *
 * Put-away and delivery both raise `RentPaymentRequiredError` and both previously restated the
 * same response body, so the two could drift. The wire shape is defined once here.
 */
export function sendRentPaymentRequired(res: Response, err: RentPaymentRequiredError): void {
  res.status(err.statusCode).json({
    error: err.message,
    code: err.code,
    rent: {
      grnId: err.grnId,
      grnNumber: err.grnNumber,
      rentAmount: err.rentAmount,
      totalPaid: err.totalPaid,
      remainingBalance: err.remainingBalance,
    },
  });
}
