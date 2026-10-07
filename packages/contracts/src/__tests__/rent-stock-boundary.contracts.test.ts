import { describe, expect, it } from 'vitest';
import { correctGrnSchema, createDeliverySchema, recordRentPaymentInputSchema } from '../index.js';

/**
 * Rent/stock separation boundary.
 *
 * True full-edit allows rent terms through the authorized GRN correction workflow
 * (with a mandatory reason and a collected-payments guard in the handler). The
 * boundary that remains: delivery and payment inputs still drop smuggled fields
 * from the other's domain. If any side grows a field reaching into the other's
 * domain, this fails first.
 */
describe('Rent/stock separation boundary', () => {
  it('the GRN full-edit input accepts rent terms with a reason', () => {
    const accepted = correctGrnSchema.safeParse({
      rentAmount: 6000,
      reason: 'Full edit of rent terms with audit reason',
    });
    expect(accepted.success).toBe(true);
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
