import { describe, expect, it } from 'vitest';
import { correctGrnSchema, createDeliverySchema, recordRentPaymentInputSchema } from '../index.js';

/**
 * Rent/stock separation boundary.
 *
 * The audited rent collection is untouched by the ledger work. These assertions pin the contract
 * behavior that enforces that: a rent term smuggled into a stock input is rejected or dropped,
 * and a stock figure smuggled into a payment input is dropped. If any side grows a field
 * reaching into the other's domain, this fails first.
 */
describe('Rent/stock separation boundary', () => {
  it('the GRN correction input rejects any rent term', () => {
    // Strict schema: an unrecognized rentAmount key fails validation outright.
    const rejected = correctGrnSchema.safeParse({
      rentAmount: 1,
      reason: 'Trying to change the rent through a correction',
    });
    expect(rejected.success).toBe(false);
  });

  it('the delivery input drops a smuggled rent term', () => {
    const parsed = createDeliverySchema.safeParse({
      grnId: 'grn-1',
      smallBags: 10,
      bigBags: 0,
      rentAmount: 999,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect('rentAmount' in parsed.data).toBe(false);
    }
  });

  it('the rent payment input drops a smuggled stock figure', () => {
    const parsed = recordRentPaymentInputSchema.safeParse({
      grnId: 'grn-1',
      amountPaid: 100,
      paymentMode: 'Cash',
      bags: 50,
      smallBags: 30,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect('bags' in parsed.data).toBe(false);
      expect('smallBags' in parsed.data).toBe(false);
    }
  });
});
