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
  // E11000 is a duplicate-key error, and is normally a genuine conflict that
  // must surface. It is NOT transient here, because the counter increments
  // that contend on the same document already report code 112 (WriteConflict),
  // which is handled above: a genuine duplicate key must not be swallowed and
  // retried, or a real uniqueness violation would be retried into a success.
  if (typeof mongoErr.message === 'string' && mongoErr.message.includes('WriteConflict')) {
    return true;
  }
  return false;
}
/** Maximum attempts for a transient-conflict retry. */
export const MONGO_MAX_ATTEMPTS = 3;

/**
 * Runs a transactional unit of work, retrying MongoDB transient conflicts.
 *
 * Several write paths contend on the SAME counter document
 * (`CounterModel.findOneAndUpdate({facilityId, counterType, financialYear},
 * {$inc:{lastSequence:1}}, {upsert:true, session})`). Under concurrency that
 * is a guaranteed write-conflict hotspot, and a conflict surfaces as an
 * unhandled 500 to the operator.
 *
 * Only the delivery path had this retry, which is why GRN creation, rent
 * collection, merge and ownership transfer were the operations that failed
 * under load. E11000 is deliberately NOT treated as transient: a genuine
 * duplicate key must surface, not be retried into a false success.
 */
export async function withMongoRetry<T>(fn: () => Promise<T>, maxAttempts = MONGO_MAX_ATTEMPTS): Promise<T> {
  let attempt = 0;
  while (true) {
    attempt += 1;
    try {
      return await fn();
    } catch (err: unknown) {
      if (!isTransientError(err) || attempt >= maxAttempts) throw err;
      const delayMs = 50 * 2 ** attempt + Math.floor(Math.random() * 25);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
