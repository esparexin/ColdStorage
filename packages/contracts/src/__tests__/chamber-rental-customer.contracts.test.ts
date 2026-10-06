import { describe, expect, it } from 'vitest';
import {
  chamberTextSchema,
  createCommoditySchema,
  createCustomerSchema,
  createFacilitySchema,
  createGrnSchema,
  customerNameSchema,
  getFinancialYearKey,
  rentalAmountSchema,
  rentMonthsForType,
  SEASONAL_RENT_MONTHS,
} from '../index.js';

/**
 * Chamber, rental and customer rules. Kept separate from the P1 foundation smoke test so each
 * file stays within the 250-line ratchet and the business rules are discoverable by name.
 */
describe('Chamber, Rental & Customer Contracts', () => {
  it('treats Chamber as free text capped at 20 characters', () => {
    expect(chamberTextSchema.parse('A')).toBe('A');
    expect(chamberTextSchema.parse('  CH-01  ')).toBe('CH-01');
    expect(chamberTextSchema.parse('c'.repeat(20))).toHaveLength(20);
    expect(() => chamberTextSchema.parse('c'.repeat(21))).toThrow();
    expect(() => chamberTextSchema.parse('   ')).toThrow();
  });

  it('locks a Seasonal subscription to exactly 10 months', () => {
    expect(SEASONAL_RENT_MONTHS).toBe(10);
    expect(rentMonthsForType('Seasonal')).toBe(10);
    expect(rentMonthsForType('Monthly')).toBeNull();
  });

  it('rejects non-numeric and infinite rental amounts', () => {
    expect(rentalAmountSchema.parse(0)).toBe(0);
    expect(rentalAmountSchema.parse(1500.5)).toBe(1500.5);
    expect(() => rentalAmountSchema.parse('abc' as unknown as number)).toThrow();
    expect(() => rentalAmountSchema.parse(Number.NaN)).toThrow();
    expect(() => rentalAmountSchema.parse(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => rentalAmountSchema.parse(-1)).toThrow();
  });

  it('caps a customer name at 50 characters and allows special characters', () => {
    expect(customerNameSchema.parse('Ramesh Patel')).toBe('Ramesh Patel');
    expect(customerNameSchema.parse("O'Brien & Sons (P) Ltd.")).toBe("O'Brien & Sons (P) Ltd.");
    expect(customerNameSchema.parse('n'.repeat(50))).toHaveLength(50);
    expect(() => customerNameSchema.parse('n'.repeat(51))).toThrow();
  });

  it('validates a customer from its name and target facility only', () => {
    // facilityId comes from the app's facility selector, never from operator input.
    const customer = createCustomerSchema.parse({ name: 'Ramesh Patel', facilityId: 'fac-1' });
    expect(customer.name).toBe('Ramesh Patel');
    expect(customer.facilityId).toBe('fac-1');
    expect(customer.isActive).toBe(true);

    // Obsolete identity fields are rejected outright rather than silently dropped.
    for (const obsolete of [
      { mobile: '9876543210' },
      { gstin: '27AAAAA0000A1Z5' },
      { address: 'Village Khed, Pune' },
      { facilityIds: ['fac-1'] },
    ]) {
      expect(() =>
        createCustomerSchema.parse({ name: 'Ramesh Patel', facilityId: 'fac-1', ...obsolete }),
      ).toThrow();
    }

    expect(() => createCustomerSchema.parse({ name: '', facilityId: 'fac-1' })).toThrow();
    expect(() =>
      createCustomerSchema.parse({ name: 'n'.repeat(51), facilityId: 'fac-1' }),
    ).toThrow();
    expect(() => createCustomerSchema.parse({ name: 'Ramesh Patel' })).toThrow();
  });

  it('validates commodity and facility master data', () => {
    const commodity = createCommoditySchema.parse({ name: 'Potato Jyoti' });
    expect(commodity.name).toBe('Potato Jyoti');
    expect(commodity.isActive).toBe(true);

    const facility = createFacilitySchema.parse({ name: 'Nashik Cold Hub', code: 'NSK-01' });
    expect(facility.code).toBe('NSK-01');
  });

  it('derives the Indian financial year key', () => {
    expect(getFinancialYearKey(new Date('2026-10-15T00:00:00Z'))).toBe('26-27');
    expect(getFinancialYearKey(new Date('2027-02-10T00:00:00Z'))).toBe('26-27');
    expect(getFinancialYearKey(new Date('2026-03-31T12:00:00Z'))).toBe('25-26');
  });

  /** Minimal valid GRN payload; individual cases override only what they exercise. */
  const grnPayload = (overrides: Record<string, unknown> = {}) => ({
    grnNumber: '0001',
    customerId: 'cust-123',
    commodityId: 'comm-123',
    chamber: 'CH-01',
    bags: 100,
    bagType: 'S',
    smallBagWeight: 50,
    rentType: 'Seasonal',
    rentAmount: 2500,
    ...overrides,
  });

  it('accepts a Monthly GRN with an explicit month count', () => {
    const validMonthly = createGrnSchema.parse(grnPayload({ rentType: 'Monthly', rentMonths: 3, rentAmount: 1500, vehicleNumber: 'MH12AB1234' }));
    expect(validMonthly.bags).toBe(100);
    expect(validMonthly.bagType).toBe('S');
    expect(validMonthly.rentMonths).toBe(3);
    expect(validMonthly.chamber).toBe('CH-01');
  });

  it('rejects a Monthly GRN that omits the month count', () => {
    expect(() =>
      createGrnSchema.parse(grnPayload({ bagType: 'B', bigBagWeight: 80, rentType: 'Monthly', rentAmount: 1500 })),
    ).toThrow();
  });

  it('accepts a Seasonal GRN with no operator-supplied month count', () => {
    const validSeasonal = createGrnSchema.parse(grnPayload({ bagType: 'S+B', smallBags: 60, bigBags: 40, smallBagWeight: 50, bigBagWeight: 80, rentAmount: 2500 }));
    expect(validSeasonal.rentMonths).toBeUndefined();
    expect(rentMonthsForType(validSeasonal.rentType)).toBe(SEASONAL_RENT_MONTHS);
  });

  it('rejects a Seasonal GRN that carries a month count', () => {
    expect(() =>
      createGrnSchema.parse(grnPayload({ bigBagWeight: 80, rentMonths: 2, rentAmount: 2500 })),
    ).toThrow();
  });

  it('rejects a non-numeric rental amount on a GRN', () => {
    expect(() =>
      createGrnSchema.parse(grnPayload({ rentAmount: 'abc' as unknown as number })),
    ).toThrow();
  });

  it('rejects a chamber longer than 20 characters on a GRN', () => {
    expect(() =>
      createGrnSchema.parse(grnPayload({ chamber: 'c'.repeat(21) })),
    ).toThrow();
  });

  it('rejects an invalid bag type on a GRN', () => {
    expect(() =>
      createGrnSchema.parse(grnPayload({ bagType: 'INVALID_BAG' as unknown as 'S', rentAmount: 2500 })),
    ).toThrow();
  });

  it('validates storageMark and partyMark up to 20 characters on a GRN', () => {
    const valid = createGrnSchema.parse(grnPayload({ storageMark: '  ST-01  ', partyMark: 'KSN-99' }));
    expect(valid.storageMark).toBe('ST-01');
    expect(valid.partyMark).toBe('KSN-99');

    expect(() =>
      createGrnSchema.parse(grnPayload({ storageMark: 'm'.repeat(21) })),
    ).toThrow(/Storage mark cannot exceed 20 characters/);

    expect(() =>
      createGrnSchema.parse(grnPayload({ partyMark: 'p'.repeat(21) })),
    ).toThrow(/Party mark cannot exceed 20 characters/);
  });
});