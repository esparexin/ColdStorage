import { describe, expect, it } from 'vitest';
import type { Grn } from '@cold-storage/contracts';
import {
  buildSettlementPayload,
  initSettlementState,
  validateLoanSettlement,
  type LoanSettlementState,
} from '../loanSettlement.helper';

const mockGrn: Grn = {
  id: 'grn-1',
  facilityId: 'fac-1',
  grnNumber: '0001',
  date: new Date('2025-01-01'),
  customerId: 'cust-1',
  customerName: 'Ramesh Patel',
  commodityId: 'comm-1',
  commodityName: 'Potatoes',
  chamber: 'Chamber 1',
  bags: 100,
  closingBags: 100,
  smallBags: 100,
  bigBags: 0,
  bagType: 'S',
  rentType: 'Seasonal',
  rentAmount: 10000,
  status: 'OPEN',
  storageMark: 'LOT-A',
  partyMark: 'PM-01',
  loanStatus: 'TAKEN',
  loanBankName: 'SBI',
  bondNumber: 'BOND-0001',
  isBondForLoan: false,
  inwardReceiptNumber: 'IRN-0001',
  createdBy: 'user-admin',
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

const baseValidSettlement: LoanSettlementState = {
  amountPaid: '50000',
  paymentMode: 'Cash',
  paymentDate: '2025-02-01',
  utrNumber: '',
  upiId: '',
  bankName: '',
  branchName: '',
  accountNumber: '',
  ifscCode: '',
  receiverName: 'Ramesh Kumar',
  receiverAadhaar: '',
  remarks: 'Paid in full',
};

describe('loanSettlement.helper', () => {
  describe('initSettlementState', () => {
    it('initializes from GRN data', () => {
      const state = initSettlementState(mockGrn);
      expect(state.paymentMode).toBe('Cash');
      expect(state.bankName).toBe('SBI');
      expect(state.amountPaid).toBe('');
      expect(state.receiverName).toBe('');
    });
  });

  describe('validateLoanSettlement', () => {
    it('passes for valid cash settlement', () => {
      expect(validateLoanSettlement(baseValidSettlement)).toBeNull();
    });

    it('rejects missing or non-positive amount', () => {
      expect(validateLoanSettlement({ ...baseValidSettlement, amountPaid: '' })).toBe(
        'Valid settlement amount paid is required',
      );
      expect(validateLoanSettlement({ ...baseValidSettlement, amountPaid: '0' })).toBe(
        'Valid settlement amount paid is required',
      );
      expect(validateLoanSettlement({ ...baseValidSettlement, amountPaid: '-50' })).toBe(
        'Valid settlement amount paid is required',
      );
    });

    it('rejects missing receiver name', () => {
      expect(validateLoanSettlement({ ...baseValidSettlement, receiverName: '   ' })).toBe(
        'Receiver / Collector name is required',
      );
    });

    it('validates UPI payment mode UTR presence and minimum length', () => {
      const upiState: LoanSettlementState = {
        ...baseValidSettlement,
        paymentMode: 'UPI',
        utrNumber: '',
      };
      expect(validateLoanSettlement(upiState)).toBe('UPI UTR / Reference number is required');

      expect(validateLoanSettlement({ ...upiState, utrNumber: '123' })).toBe(
        'UPI UTR / Reference number must be at least 4 characters',
      );

      expect(validateLoanSettlement({ ...upiState, utrNumber: '123456789' })).toBeNull();
    });

    it('validates Bank Transfer required fields, UTR length, and IFSC format', () => {
      const bankState: LoanSettlementState = {
        ...baseValidSettlement,
        paymentMode: 'Bank Transfer',
        bankName: 'HDFC',
        accountNumber: '1234567890',
        ifscCode: 'HDFC0001234',
        utrNumber: 'UTR12345',
      };
      expect(validateLoanSettlement(bankState)).toBeNull();

      expect(validateLoanSettlement({ ...bankState, bankName: '' })).toBe(
        'Bank Name, Account #, IFSC, and UTR are required for Bank Transfer',
      );
      expect(validateLoanSettlement({ ...bankState, utrNumber: '12' })).toBe(
        'UTR / Reference number must be at least 4 characters',
      );
      expect(validateLoanSettlement({ ...bankState, ifscCode: 'INVALID_IFSC' })).toBe(
        'Invalid Indian IFSC code format (e.g. SBIN0001234)',
      );
    });

    it('validates receiver Aadhaar format when provided', () => {
      expect(
        validateLoanSettlement({ ...baseValidSettlement, receiverAadhaar: '123456789012' }),
      ).toBeNull();

      expect(
        validateLoanSettlement({ ...baseValidSettlement, receiverAadhaar: '12345' }),
      ).toBe('Aadhaar number must be exactly 12 digits');

      expect(
        validateLoanSettlement({ ...baseValidSettlement, receiverAadhaar: '12345678901A' }),
      ).toBe('Aadhaar number must be exactly 12 digits');
    });
  });

  describe('buildSettlementPayload', () => {
    it('constructs a clean payload omitting empty optional fields', () => {
      const payload = buildSettlementPayload(baseValidSettlement);
      expect(payload.amountPaid).toBe(50000);
      expect(payload.paymentMode).toBe('Cash');
      expect(payload.receiverName).toBe('Ramesh Kumar');
      expect(payload.remarks).toBe('Paid in full');
      expect(payload.utrNumber).toBeUndefined();
      expect(payload.bankName).toBeUndefined();
    });
  });
});
