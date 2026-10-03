/**
 * MongoDB transient-failure classification SSOT.
 *
 * Multi-document transactions can fail for reasons that are safe to retry (write conflicts
 * from concurrent allocation or delivery). This predicate was previously duplicated
 * verbatim in the delivery and inventory mappers; it now has a single owner so the retry
 * policy cannot drift between bounded contexts.
 */
export function isTransientError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const mongoErr = err as {
    code?: number;
    hasErrorLabel?: (label: string) => boolean;
    message?: string;
  };
  if (
    typeof mongoErr.hasErrorLabel === 'function' &&
    mongoErr.hasErrorLabel('TransientTransactionError')
  ) {
    return true;
  }
  if (mongoErr.code === 112 || mongoErr.code === 251) {
    return true;
  }
  if (typeof mongoErr.message === 'string' && mongoErr.message.includes('WriteConflict')) {
    return true;
  }
  return false;
}