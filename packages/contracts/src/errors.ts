import { z } from 'zod';

/**
 * Transport-level error envelope shared by backend responders and frontend
 * error states. Documents the ad-hoc `{ error, code?, details?, rent? }`
 * shape already used on the wire so clients can branch exhaustively.
 */
export const errorCodeSchema = z.enum([
  'NOT_FOUND',
  'INVALID_JSON',
  'PAYLOAD_TOO_LARGE',
  'RENT_PAYMENT_REQUIRED',
  'CONCURRENCY_CONFLICT',
  'BACKUP_DISABLED',
  'BACKUP_KEY_INVALID',
  'ORGANIZATION_NOT_CONFIGURED',
  'FACILITY_MISMATCH',
]);

export const errorResponseSchema = z.object({
  error: z.string().min(1),
  code: z.string().min(1).optional(),
  details: z.unknown().optional(),
  rent: z
    .object({
      grnId: z.string(),
      grnNumber: z.string(),
      rentAmount: z.number(),
      totalPaid: z.number(),
      remainingBalance: z.number(),
    })
    .optional(),
});

export type ErrorCode = z.infer<typeof errorCodeSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
