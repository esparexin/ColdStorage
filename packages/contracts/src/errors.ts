import { z } from 'zod';

/**
 * Transport-level error envelope shared by backend responders and frontend
 * error states. Documents the ad-hoc `{ error, code?, details?, rent? }`
 * shape already used on the wire so clients can branch exhaustively.
 * Adoption is incremental (API-04); new handlers should prefer this shape
 * over ad-hoc `{ error }` without breaking existing clients.
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
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'CONFLICT',
  'INTERNAL_SERVER_ERROR',
]);

export const validationDetailsSchema = z.object({
  formErrors: z.array(z.string()).default([]),
  fieldErrors: z.record(z.array(z.string())).default({}),
});

export type ValidationDetails = z.infer<typeof validationDetailsSchema>;

/**
 * Extracts flattened field and form errors from a ZodError into canonical ValidationDetails.
 */
export function extractValidationDetails(error: z.ZodError): ValidationDetails {
  const flattened = error.flatten();
  const fieldErrors: Record<string, string[]> = {};
  for (const [key, val] of Object.entries(flattened.fieldErrors)) {
    if (Array.isArray(val) && val.length > 0) {
      fieldErrors[key] = val;
    }
  }
  return {
    formErrors: flattened.formErrors ?? [],
    fieldErrors,
  };
}

export const errorResponseSchema = z.object({
  error: z.string().min(1),
  code: errorCodeSchema.optional(),
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
