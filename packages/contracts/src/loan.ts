import { z } from 'zod';
import { bondNumberSchema } from './identifiers.js';

export const loanPaymentModeSchema = z.enum(['Cash', 'UPI', 'Bank Transfer']);
export type LoanPaymentMode = z.infer<typeof loanPaymentModeSchema>;

export const ifscCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid Indian IFSC code format (e.g. SBIN0001234)');

export const aadhaarNumberSchema = z
  .string()
  .trim()
  .regex(/^\d{12}$/, 'Aadhaar number must be exactly 12 digits');

export const loanSettlementInputSchema = z
  .object({
    amountPaid: z
      .number({ invalid_type_error: 'Amount paid must be a number' })
      .positive('Amount paid must be greater than zero'),
    paymentMode: loanPaymentModeSchema,
    paymentDate: z.coerce.date().default(() => new Date()),
    utrNumber: z.string().trim().min(4).max(50).nullish(),
    upiId: z.string().trim().max(100).nullish(),
    bankName: z.string().trim().max(100).nullish(),
    branchName: z.string().trim().max(100).nullish(),
    accountNumber: z.string().trim().min(6).max(35).nullish(),
    ifscCode: ifscCodeSchema.nullish(),
    receiverName: z.string().trim().min(1, 'Receiver name is required').max(100),
    receiverAadhaar: aadhaarNumberSchema.nullish(),
    remarks: z.string().trim().max(500).nullish(),
  })
  .refine(
    (data) => {
      if (data.paymentMode === 'UPI') {
        return Boolean(data.utrNumber && data.utrNumber.trim().length >= 4);
      }
      return true;
    },
    {
      message: 'UTR / Transaction Reference number is required for UPI payment',
      path: ['utrNumber'],
    },
  )
  .refine(
    (data) => {
      if (data.paymentMode === 'Bank Transfer') {
        return Boolean(
          data.utrNumber &&
            data.utrNumber.trim().length >= 4 &&
            data.accountNumber &&
            data.bankName &&
            data.ifscCode,
        );
      }
      return true;
    },
    {
      message:
        'Bank Name, Account Number, IFSC Code, and UTR number are required for Bank Transfer',
      path: ['utrNumber'],
    },
  );

export type LoanSettlementInput = z.infer<typeof loanSettlementInputSchema>;

export const updateGrnLoanStatusSchema = z.object({
  loanStatus: z.enum(['NOT_TAKEN', 'TAKEN', 'CLEARED']),
  bondNumber: bondNumberSchema.nullish(),
  bankName: z.string().trim().max(100).optional(),
  referenceNumber: z.string().trim().max(50).optional(),
  remarks: z.string().trim().max(500).optional(),
  settlement: loanSettlementInputSchema.optional(),
});

export type UpdateGrnLoanStatusInput = z.infer<typeof updateGrnLoanStatusSchema>;
