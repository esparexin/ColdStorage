import type { Response } from 'express';
import { sendInternalError } from '../utils/http-error.js';

export function handleRentPaymentError(res: Response, err: unknown, operation: string): void {
  const message = err instanceof Error ? err.message : 'Rent payment collection failed';
  const status = message.includes('not found')
    ? 404
    : message.includes('exceeds remaining') ||
        message.includes('future') ||
        message.includes('Validation') ||
        message.includes('belongs to customer') ||
        message.includes('Duplicate GRN')
      ? 400
      : null;

  if (status) {
    res.status(status).json({ error: message });
    return;
  }
  sendInternalError(res, err, operation);
}

export function handleExtensionError(res: Response, err: unknown, operation: string): void {
  const message = err instanceof Error ? err.message : `${operation} failed`;
  const status = message.includes('not found')
    ? 404
    : message.includes('only to Seasonal') ||
        message.includes('belongs to season') ||
        message.includes('already covered') ||
        message.includes('before it begins') ||
        message.includes('No bags remained') ||
        message.includes('no bag rate')
      ? 400
      : 500;
  res.status(status).json({ error: message });
}
