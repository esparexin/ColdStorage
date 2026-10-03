import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RentPaymentModel } from '../database/models/rent-payment.model.js';
import { rentRepository } from '../modules/rent/rent.repository.js';
import { rentService } from '../modules/rent/rent.service.js';
import { SEASONAL_MONTHS } from './helpers/master-data-fixtures.js';
import {
  connectRentSuite,
  disconnectRentSuite,
  resetRentCollections,
  seedRentScenario,
  type RentScenario,
} from './helpers/rent-fixtures.js';

const USER_ID = 'usr-operator-rent';
const FACILITY_ID = 'fac-rent-test-1';
const OTHER_FACILITY_ID = 'fac-rent-test-2';
const RENT_AMOUNT = 5000;

/**
 * Rent payment recording: balance derivation, the strict overpayment guard, FY-sequential
 * receipt numbering, GRN-lock serialization of concurrent collections and facility isolation.
 */
describe('Suite 2a: Rent Service Balance, Receipts & Concurrency — rent.service.test.ts', () => {
  let scenario: RentScenario;

  beforeAll(connectRentSuite);
  afterAll(disconnectRentSuite);

  beforeEach(async () => {
    await resetRentCollections({ facilityIds: [FACILITY_ID, OTHER_FACILITY_ID] });
    scenario = await seedRentScenario({
      facilityId: FACILITY_ID,
      otherFacilityId: OTHER_FACILITY_ID,
      rentAmount: RENT_AMOUNT,
    });
  });

  // 1. Full Payment
  it('records full payment in single transaction, derives status Settled and balance 0', async () => {
    const result = await rentService.recordPayment(
      scenario.facilityId,
      {
        grnId: scenario.grnId,
        amountPaid: RENT_AMOUNT,
        paymentMode: 'Cash',
        paymentDate: new Date(),
        notes: 'Full payment cleared in cash',
      },
      USER_ID,
    );

    expect(result.payment.amountPaid).toBe(RENT_AMOUNT);
    expect(result.payment.paymentMode).toBe('Cash');
    expect(result.payment.receiptNumber).toMatch(/^RRCPT-\d{2}-\d{2}-0001$/);
    expect(result.summary.totalPaid).toBe(RENT_AMOUNT);
    expect(result.summary.remainingBalance).toBe(0);
    expect(result.summary.paymentStatus).toBe('Settled');
    expect(result.summary.payments).toHaveLength(1);
    // Seasonal rent always carries the fixed 10-month term and a free-text chamber label.
    expect(result.summary.rentMonths).toBe(SEASONAL_MONTHS);
    expect(result.summary.chamber).toBe(scenario.chamber);
    expect(result.summary).not.toHaveProperty('customerMobile');
  });

  // 2. Partial Payment
  it('records partial payment, derives status Not Settled and exact remaining balance', async () => {
    const result = await rentService.recordPayment(
      scenario.facilityId,
      {
        grnId: scenario.grnId,
        amountPaid: 2000,
        paymentMode: 'UPI',
        paymentDate: new Date(),
        notes: 'First installment via UPI',
      },
      USER_ID,
    );

    expect(result.payment.amountPaid).toBe(2000);
    expect(result.payment.paymentMode).toBe('UPI');
    expect(result.summary.totalPaid).toBe(2000);
    expect(result.summary.remainingBalance).toBe(3000);
    expect(result.summary.paymentStatus).toBe('Not Settled');
  });

  // 3. Sequential Partial Payments until Settled
  it('records sequential partial payments until balance is zero and transitions to Settled', async () => {
    const installments: Array<[number, 'Cash' | 'UPI', number]> = [
      [2000, 'Cash', 3000],
      [2000, 'UPI', 1000],
      [1000, 'Cash', 0],
    ];

    for (const [amountPaid, paymentMode, remaining] of installments) {
      const result = await rentService.recordPayment(
        scenario.facilityId,
        { grnId: scenario.grnId, amountPaid, paymentMode, paymentDate: new Date() },
        USER_ID,
      );
      expect(result.summary.remainingBalance).toBe(remaining);
      expect(result.summary.paymentStatus).toBe(remaining === 0 ? 'Settled' : 'Not Settled');
    }

    const summary = await rentService.getRentSummary(scenario.facilityId, scenario.grnId);
    expect(summary.payments).toHaveLength(3);
  });

  // 4. Overpayment Guard
  it('overpayment guard rejects payment exceeding remaining balance and leaves ledger uncommitted', async () => {
    await expect(
      rentService.recordPayment(
        scenario.facilityId,
        { grnId: scenario.grnId, amountPaid: 5500, paymentMode: 'Cash', paymentDate: new Date() },
        USER_ID,
      ),
    ).rejects.toThrow(/exceeds remaining rent balance/);

    // Verify zero writes occurred
    expect(
      await RentPaymentModel.collection.countDocuments({ facilityId: scenario.facilityId }),
    ).toBe(0);

    const summary = await rentService.getRentSummary(scenario.facilityId, scenario.grnId);
    expect(summary.totalPaid).toBe(0);
    expect(summary.remainingBalance).toBe(RENT_AMOUNT);
    expect(summary.paymentStatus).toBe('Not Settled');
  });

  // 5. Non-existent GRN Rejection
  it('rejects payment attempt against non-existent GRN', async () => {
    await expect(
      rentService.recordPayment(
        scenario.facilityId,
        {
          grnId: 'grn-non-existent',
          amountPaid: 1000,
          paymentMode: 'Cash',
          paymentDate: new Date(),
        },
        USER_ID,
      ),
    ).rejects.toThrow(/not found in facility/);
  });

  // 6. Independent FY-Sequential Receipt Number Generation
  it('generates independent FY-sequential receipt numbers using counter', async () => {
    const res1 = await rentService.recordPayment(
      scenario.facilityId,
      { grnId: scenario.grnId, amountPaid: 1000, paymentMode: 'Cash', paymentDate: new Date() },
      USER_ID,
    );
    const res2 = await rentService.recordPayment(
      scenario.facilityId,
      { grnId: scenario.grnId, amountPaid: 1000, paymentMode: 'UPI', paymentDate: new Date() },
      USER_ID,
    );

    expect(res1.payment.receiptNumber).toMatch(/^RRCPT-\d{2}-\d{2}-0001$/);
    expect(res2.payment.receiptNumber).toMatch(/^RRCPT-\d{2}-\d{2}-0002$/);
    expect(res1.payment.receiptNumber).not.toBe(res2.payment.receiptNumber);
  });

  // 7. Concurrent Race Condition: Two Parallel Overpayment Requests
  it('concurrent race condition: simultaneous parallel payments exceeding balance serialize via GRN lock and prevent overpayment', async () => {
    // GRN rent obligation = 5000.
    // Two simultaneous requests of ₹3500 each (total 7000 > 5000).
    // Exactly one must succeed and commit; exactly one must fail and rollback.
    const results = await Promise.allSettled([
      rentService.recordPayment(
        scenario.facilityId,
        { grnId: scenario.grnId, amountPaid: 3500, paymentMode: 'Cash', paymentDate: new Date() },
        'usr-op-a',
      ),
      rentService.recordPayment(
        scenario.facilityId,
        { grnId: scenario.grnId, amountPaid: 3500, paymentMode: 'UPI', paymentDate: new Date() },
        'usr-op-b',
      ),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);

    // Ledger must have exactly 1 record for ₹3500
    const payments = await rentRepository.findPaymentsByGrnId(scenario.facilityId, scenario.grnId);
    expect(payments).toHaveLength(1);
    expect(payments[0]?.amountPaid).toBe(3500);

    const summary = await rentService.getRentSummary(scenario.facilityId, scenario.grnId);
    expect(summary.totalPaid).toBe(3500);
    expect(summary.remainingBalance).toBe(1500);
    expect(summary.paymentStatus).toBe('Not Settled');
  });

  // 8. Facility Isolation
  it('facility isolation: rejects payment collection for GRN in unauthorized facility', async () => {
    await expect(
      rentService.recordPayment(
        scenario.otherFacilityId,
        { grnId: scenario.grnId, amountPaid: 1000, paymentMode: 'Cash', paymentDate: new Date() },
        USER_ID,
      ),
    ).rejects.toThrow(/not found in facility/);
  });
});
