import type { Response } from 'express';
import { sendInternalError, sendServiceError } from '../utils/http-error.js';

export function handleGrnCreateError(res: Response, err: unknown, grnNumber?: string): void {
  const isMongoDuplicate =
    typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 11000;
  const isAlreadyExists = err instanceof Error && err.message.includes('already exists');
  if (isMongoDuplicate || isAlreadyExists) {
    const errorMsg = isMongoDuplicate
      ? `GRN '${grnNumber ?? ''}' already exists for this facility.`
      : (err as Error).message;
    res.status(409).json({ error: errorMsg });
    return;
  }
  const message = err instanceof Error ? err.message : 'GRN creation failed';
  const isKnownClientError =
    message.includes('not found') ||
    message.includes('inactive') ||
    message.includes('not registered') ||
    message.includes('does not belong') ||
    message.includes('do not match') ||
    message.includes('controller rate') ||
    message.includes('future') ||
    message.includes('exceeds permitted') ||
    message.includes('Financial Year');
  if (isKnownClientError) {
    res.status(400).json({ error: message });
    return;
  }
  sendInternalError(res, err, 'createGrn');
}

export function handleGrnDeleteError(res: Response, err: unknown): void {
  const message = err instanceof Error ? err.message : 'GRN deletion failed';
  if (message.includes('disabled in production')) {
    res.status(403).json({ error: message });
    return;
  }
  if (message.includes('not found')) {
    res.status(404).json({ error: message });
    return;
  }
  if (
    message.includes('Confirmation token') ||
    message.includes('merged into') ||
    message.includes('ISSUED') ||
    message.includes('deleted by another')
  ) {
    res.status(409).json({ error: message });
    return;
  }
  sendServiceError(res, err, 'GRN deletion failed');
}
