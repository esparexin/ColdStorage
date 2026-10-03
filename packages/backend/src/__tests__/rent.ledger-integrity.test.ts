import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditLogModel } from '../database/models/audit-log.model.js';
import { RentPaymentModel } from '../database/models/rent-payment.model.js';
import { rentService } from '../modules/rent/rent.service.js';
import {
  connectRentSuite,
  disconnectRentSuite,
  resetRentCollections,
  seedRentScenario,
  type RentScenario,
} from './helpers/rent-fixtures.js';

const USER_ID = 'usr-operator-rent';
const FACILITY_ID = 'fac-rent-ledger-1';
const OTHER_FACILITY_ID = 'fac-rent-ledger-2';

/**
 * Durability of the confirmed rent ledger: append-only enforcement, deterministic payment
 * history ordering and the post-commit audit trail.
 */
describe('Suite 2b: Rent Ledger Immutability, Ordering & Audit — rent.ledger-integrity.test.ts', () => {
  let scenario: RentScenario;

  beforeAll(connectRentSuite);
  afterAll(disconnectRentSuite);

  beforeEach(async () => {
    await resetRentCollections({ facilityIds: [FACILITY_ID, OTHER_FACILITY_ID] });
    scenario = await seedRentScenario({
      facilityId: FACILITY_ID,
      otherFacilityId: OTHER_FACILITY_ID,
      grnNumber: 'GRN-26-27-0007',
    });
  });

  const collect = (amountPaid: number, paymentDate: Date) =>
    rentService.recordPayment(
      scenario.facilityId,
      { grnId: scenario.grnId, amountPaid, paymentMode: 'Cash', paymentDate },
      USER_ID,
    );

  // 1. Model Immutability
  it('model immutability: RentPaymentModel rejects updateOne, deleteMany, and in-place mutation', async () => {
    const res = await collect(1000, new Date());

    // Attempt updateOne
    await expect(
      RentPaymentModel.updateOne({ id: res.payment.id }, { amountPaid: 9999 }),
    ).rejects.toThrow(/RENT_PAYMENT_IMMUTABLE/);

    // Attempt deleteMany
    await expect(RentPaymentModel.deleteMany({ id: res.payment.id })).rejects.toThrow(
      /RENT_PAYMENT_IMMUTABLE/,
    );

    // Attempt doc.save() mutation
    const doc = await RentPaymentModel.findOne({ id: res.payment.id }).exec();
    expect(doc).toBeDefined();
    if (doc) {
      doc.amountPaid = 9999;
      await expect(doc.save()).rejects.toThrow(/RENT_PAYMENT_IMMUTABLE/);
    }
  });

  // 2. Deterministic Payment History Ordering (paymentDate DESC, _id DESC)
  it('deterministic payment history ordering: returns records sorted by paymentDate DESC, _id DESC', async () => {
    const d1 = new Date('2026-04-01T10:00:00Z');
    const d2 = new Date('2026-04-05T10:00:00Z');
    const d3 = new Date('2026-04-03T10:00:00Z');

    await collect(1000, d1);
    await collect(1000, d2);
    await collect(1000, d3);

    const summary = await rentService.getRentSummary(scenario.facilityId, scenario.grnId);
    expect(summary.payments).toHaveLength(3);
    expect(new Date(summary.payments[0]!.paymentDate).getTime()).toBe(d2.getTime());
    expect(new Date(summary.payments[1]!.paymentDate).getTime()).toBe(d3.getTime());
    expect(new Date(summary.payments[2]!.paymentDate).getTime()).toBe(d1.getTime());
  });

  // 3. Post-Commit Audit
  it('post-commit audit: emits RENT_PAYMENT_COLLECTED audit log with non-sensitive details after successful commit', async () => {
    const res = await rentService.recordPayment(
      scenario.facilityId,
      {
        grnId: scenario.grnId,
        amountPaid: 2500,
        paymentMode: 'UPI',
        paymentDate: new Date(),
        notes: 'Audit check payment',
      },
      USER_ID,
    );

    const auditLogs = await AuditLogModel.find({
      eventType: 'RENT_PAYMENT_COLLECTED',
      resourceId: res.payment.id,
    })
      .lean()
      .exec();

    expect(auditLogs).toHaveLength(1);
    const log = auditLogs[0]!;
    expect(log.severity).toBe('INFO');
    expect(log.facilityId).toBe(scenario.facilityId);
    expect(log.userId).toBe(USER_ID);
    expect(log.details).toBeDefined();
    expect(log.details?.grnId).toBe(scenario.grnId);
    expect(log.details?.receiptNumber).toBe(res.payment.receiptNumber);
    expect(log.details?.amountPaid).toBe(2500);
    expect(log.details?.paymentMode).toBe('UPI');
    expect(log.details?.remainingBalance).toBe(2500);
    expect(log.details?.paymentStatus).toBe('Not Settled');
  });
});
