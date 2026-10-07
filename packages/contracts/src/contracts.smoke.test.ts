import { describe, expect, it } from 'vitest';
import {
  bagAccountingSchema,
  bagTypeSchema,
  bondNumberSchema,
  can,
  changePasswordInputSchema,
  createUserSchema,
  facilitySchema,
  gpNumberSchema,
  grnNumberSchema,
  inFacilityScope,
  loginInputSchema,
  receiptNumberSchema,
  rentReceiptNumberSchema,
  systemSettingsSchema,
  userSummarySchema,
  loanPaymentModeSchema,
  loanSettlementInputSchema,
  updateGrnLoanStatusSchema,
} from './index.js';

describe('P1 Governance & Shared Contracts Foundation', () => {
  it('enforces independent business identifiers and optional opaque GP', () => {
    expect(grnNumberSchema.parse('GRN-25-26-0001')).toBe('GRN-25-26-0001');
    expect(bondNumberSchema.parse('BND-26-27-0001')).toBe('BND-26-27-0001');
    expect(receiptNumberSchema.parse('RCPT-2025-0042')).toBe('RCPT-2025-0042');
    expect(rentReceiptNumberSchema.parse('RRCPT-25-26-0001')).toBe('RRCPT-25-26-0001');
    expect(gpNumberSchema.parse(undefined)).toBeUndefined();
    expect(gpNumberSchema.parse('GP-OPAQUE-123')).toBe('GP-OPAQUE-123');
    expect(gpNumberSchema.parse(null)).toBeNull();
  });

  it('enforces strictly controlled bag types (S, B, S+B, S/B)', () => {
    expect(bagTypeSchema.parse('S')).toBe('S');
    expect(bagTypeSchema.parse('B')).toBe('B');
    expect(bagTypeSchema.parse('S+B')).toBe('S+B');
    expect(bagTypeSchema.parse('S/B')).toBe('S/B');
    expect(bagTypeSchema.parse(undefined)).toBe('S/B');

    expect(() => bagTypeSchema.parse('SMALL')).toThrow();
    expect(() => bagTypeSchema.parse('LARGE')).toThrow();
    expect(() => bagTypeSchema.parse('OTHER')).toThrow();
  });

  it('captures per-bag weight only (Small / Big), no nominal or weighbridge totals', () => {
    const smallOnly = bagAccountingSchema.parse({
      bagType: 'S',
      bags: 100,
      smallBagWeight: 50,
    });
    expect(smallOnly.smallBagWeight).toBe(50);

    const mixed = bagAccountingSchema.parse({
      bagType: 'S+B',
      bags: 120,
      smallBagWeight: 50,
      bigBagWeight: 80,
    });
    expect(mixed.bigBagWeight).toBe(80);
  });

  it('validates Facility as the tenancy root with no storage hierarchy beneath it', () => {
    const facility = facilitySchema.parse({ id: 'fac-1', name: 'Main Unit', code: 'FAC1' });
    expect(facility.id).toBe('fac-1');
    expect(facility.name).toBe('Main Unit');
  });

  it('enforces machine-readable permissions and facility scoping', () => {
    expect(can('SUPER_ADMIN', 'settings:manage')).toBe(true);
    expect(can('ADMIN', 'settings:manage')).toBe(false);
    expect(can('OPERATOR', 'grn:create')).toBe(true);
    expect(can('OPERATOR', 'rent:collect')).toBe(true);
    expect(can('READ_ONLY', 'rent:collect')).toBe(false);
    expect(can('READ_ONLY', 'rent:view')).toBe(true);

    // Super Admin has global facility scope
    expect(inFacilityScope('SUPER_ADMIN', [], 'facility-north')).toBe(true);

    // Other roles are restricted to assigned facilities
    expect(inFacilityScope('ADMIN', ['fac-1', 'fac-2'], 'fac-1')).toBe(true);
    expect(inFacilityScope('ADMIN', ['fac-1'], 'fac-2')).toBe(false);
  });

  it('applies standard system settings defaults', () => {
    const settings = systemSettingsSchema.parse({
      orgName: 'Agro Cold Storage Ltd',
      address: 'Plot 42, Cold Chain Zone, Maharashtra',
      contact: '+91 9876543210',
    });

    expect(settings.timezone).toBe('Asia/Kolkata');
    expect(settings.backupPolicy.retentionDays).toBe(30);
    expect(settings.backupPolicy.backupEnabled).toBe(true);
  });

  it('validates user provisioning and authentication schemas', () => {
    const newUser = createUserSchema.parse({
      fullName: 'Ramesh Sharma',
      username: 'ramesh.s',
      employeeId: 'EMP-1001',
      mobile: '9876543210',
      email: 'ramesh@example.com',
      role: 'OPERATOR',
      facilityIds: ['fac-1'],
      temporaryPassword: 'SamplePassword#2026',
    });
    expect(newUser.username).toBe('ramesh.s');
    expect(newUser.role).toBe('OPERATOR');

    const loginInput = loginInputSchema.parse({
      username: 'ramesh.s',
      password: 'SamplePassword#2026',
    });
    expect(loginInput.username).toBe('ramesh.s');

    const changePasswordInput = changePasswordInputSchema.parse({
      currentPassword: 'SamplePassword#2026',
      newPassword: 'NewSecurePassword456!',
    });
    expect(changePasswordInput.newPassword).toBe('NewSecurePassword456!');

    const summary = userSummarySchema.parse({
      id: 'usr-1',
      fullName: newUser.fullName,
      username: newUser.username,
      employeeId: newUser.employeeId,
      mobile: newUser.mobile,
      email: newUser.email,
      role: newUser.role,
      facilityIds: newUser.facilityIds,
      status: 'ACTIVE',
      mustChangePassword: true,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(summary.mustChangePassword).toBe(true);
  });

  it('validates loan settlement payment modes (Cash, UPI, Bank Transfer) and required fields', () => {
    expect(loanPaymentModeSchema.parse('Cash')).toBe('Cash');
    expect(loanPaymentModeSchema.parse('UPI')).toBe('UPI');
    expect(loanPaymentModeSchema.parse('Bank Transfer')).toBe('Bank Transfer');
    expect(() => loanPaymentModeSchema.parse('Crypto')).toThrow();

    // Cash settlement
    const cashSettlement = loanSettlementInputSchema.parse({
      amountPaid: 50000,
      paymentMode: 'Cash',
      receiverName: 'Ramesh Patel',
      receiverAadhaar: '123456789012',
    });
    expect(cashSettlement.amountPaid).toBe(50000);
    expect(cashSettlement.paymentMode).toBe('Cash');

    // UPI settlement requires UTR
    expect(() =>
      loanSettlementInputSchema.parse({
        amountPaid: 25000,
        paymentMode: 'UPI',
        receiverName: 'Suresh Kumar',
      }),
    ).toThrow(/UTR/i);

    const upiSettlement = loanSettlementInputSchema.parse({
      amountPaid: 25000,
      paymentMode: 'UPI',
      utrNumber: 'UPI-UTR-998877',
      upiId: 'customer@okaxis',
      receiverName: 'Suresh Kumar',
    });
    expect(upiSettlement.utrNumber).toBe('UPI-UTR-998877');

    // Bank transfer requires IFSC, Bank, Account, UTR
    expect(() =>
      loanSettlementInputSchema.parse({
        amountPaid: 100000,
        paymentMode: 'Bank Transfer',
        receiverName: 'Vikram Singh',
      }),
    ).toThrow(/Bank Transfer/i);

    const bankSettlement = loanSettlementInputSchema.parse({
      amountPaid: 100000,
      paymentMode: 'Bank Transfer',
      bankName: 'State Bank of India',
      accountNumber: '112233445566',
      ifscCode: 'SBIN0001234',
      utrNumber: 'UTR-BANK-123456',
      receiverName: 'Vikram Singh',
    });
    expect(bankSettlement.ifscCode).toBe('SBIN0001234');

    // Update loan status schema accepting settlement
    const updateInput = updateGrnLoanStatusSchema.parse({
      loanStatus: 'CLEARED',
      settlement: cashSettlement,
    });
    expect(updateInput.loanStatus).toBe('CLEARED');
    expect(updateInput.settlement?.amountPaid).toBe(50000);
  });
});

