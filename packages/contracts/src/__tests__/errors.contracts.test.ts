import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  errorCodeSchema,
  errorResponseSchema,
  extractValidationDetails,
  validationDetailsSchema,
} from '../index.js';

describe('Error Contracts & Validation Envelope SSOT', () => {
  it('validates standard and extended error codes', () => {
    const validCodes = [
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
    ] as const;

    for (const code of validCodes) {
      expect(errorCodeSchema.parse(code)).toBe(code);
    }

    expect(() => errorCodeSchema.parse('UNKNOWN_ERROR_CODE')).toThrow();
  });

  it('validates canonical errorResponseSchema with code and details', () => {
    const envelope = {
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: {
        fieldErrors: { name: ['Name is required'] },
        formErrors: [],
      },
    };

    const parsed = errorResponseSchema.parse(envelope);
    expect(parsed.error).toBe('Validation failed');
    expect(parsed.code).toBe('VALIDATION_ERROR');
    expect(parsed.details).toBeDefined();
  });

  it('validates validationDetailsSchema and extractValidationDetails helper', () => {
    const testSchema = z.object({
      age: z.number().min(18, 'Must be at least 18'),
      name: z.string().min(1, 'Name is required'),
    });

    const result = testSchema.safeParse({ age: 15, name: '' });
    expect(result.success).toBe(false);

    if (!result.success) {
      const details = extractValidationDetails(result.error);
      const parsedDetails = validationDetailsSchema.parse(details);
      expect(parsedDetails.fieldErrors.age).toContain('Must be at least 18');
      expect(parsedDetails.fieldErrors.name).toContain('Name is required');
      expect(Array.isArray(parsedDetails.formErrors)).toBe(true);
    }
  });
});
