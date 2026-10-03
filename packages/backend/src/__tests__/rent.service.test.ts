import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditLogModel } from '../database/models/audit-log.model.js';
import { CounterModel } from '../database/models/counter.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { RentPaymentModel } from '../database/models/rent-payment.model.js';
import { SystemSettingsModel } from '../database/models/system-settings.model.js';
import { rentRepository } from '../modules/rent/rent.repository.js';
import { rentService } from '../modules/rent/rent.service.js';

describe('Suite 2: Rent Service, Immutability & Concurrency — rent.service.test.ts', () => {
  const facilityId = 'fac-rent-test-1';
  const otherFacilityId = 'fac-rent-test-2';
  const grnId = 'grn-rent-test-1';
  const userId = 'usr-operator-rent';

  beforeAll(async () => {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cold_storage_test';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  beforeEach(async () => {
    await FacilityModel.deleteMany({});
    await GrnModel.deleteMany({});
    await CounterModel.deleteMany({});
    await SystemSettingsModel.deleteMany({});
    await mongoose.connection.collection('auditlogs').deleteMany({});
    await mongoose.connection.collection('rentpayments').deleteMany({});

    // Fixture 1: Facility
    await FacilityModel.create({
      id: facilityId,
      name: 'Cold Rent Test Facility',
      code: 'CTF',
      isActive: true,
    });

    // Fixture 2: System Settings
    await SystemSettingsModel.create({
      orgName: 'Sheetal Cold Storage Ltd',
      address: 'Plot 42, Cold Chain Zone, Nashik, MH',
      contact: '+91 98765 43210',
      gstin: '27AAAAA0000A1Z5',
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      receiptPrefix: 'RCPT',
      printFooter: 'Thank you for your business.',
    });

    // Fixture 3: GRN with Rent Obligation
    await GrnModel.create({
      id: grnId,
      facilityId,
      grnNumber: 'GRN-26-27-0001',
      inwardReceiptNumber: 'RCPT-26-27-0001',
      date: new Date(),
      customerId: 'cust-1',
      customerName: 'Ramesh Agro Traders',
      commodityId: 'cmd-1',
      commodityName: 'Potatoes (Chipsona)',
      chamberId: 'ch-1',
      chamberNumber: 'CH-01',
      bags: 100,
      bagType: 'B',
      rentType: 'Seasonal',
      rentMonths: null,
      rentAmount: 5000,
      status: 'OPEN',
      createdBy: userId,
    });
  });

  // 1. Full Payment
  it('records full payment in single transaction, derives status Settled and balance 0', async () => {
    const result = await rentService.recordPayment(
      facilityId,
      {
        grnId,
        amountPaid: 5000,
        paymentMode: 'Cash',
        paymentDate: new Date(),
        notes: 'Full payment cleared in cash',
      },
      userId,
    );

    expect(result.payment.amountPaid).toBe(5000);
    expect(result.payment.paymentMode).toBe('Cash');
    expect(result.payment.receiptNumber).toMatch(/^RRCPT-\d{2}-\d{2}-0001$/);
    expect(result.summary.totalPaid).toBe(5000);
    expect(result.summary.remainingBalance).toBe(0);
    expect(result.summary.paymentStatus).toBe('Settled');
    expect(result.summary.payments).toHaveLength(1);
  });

  // 2. Partial Payment
  it('records partial payment, derives status Not Settled and exact remaining balance', async () => {
    const result = await rentService.recordPayment(
      facilityId,
      {
        grnId,
        amountPaid: 2000,
        paymentMode: 'UPI',
        paymentDate: new Date(),
        notes: 'First installment via UPI',
      },
      userId,
    );

    expect(result.payment.amountPaid).toBe(2000);
    expect(result.payment.paymentMode).toBe('UPI');
    expect(result.summary.totalPaid).toBe(2000);
    expect(result.summary.remainingBalance).toBe(3000);
    expect(result.summary.paymentStatus).toBe('Not Settled');
  });

  // 3. Sequential Partial Payments until Settled
  it('records sequential partial payments until balance is zero and transitions to Settled', async () => {
    // Payment 1
    const p1 = await rentService.recordPayment(
      facilityId,
      { grnId, amountPaid: 2000, paymentMode: 'Cash', paymentDate: new Date() },
      userId,
    );
    expect(p1.summary.remainingBalance).toBe(3000);
    expect(p1.summary.paymentStatus).toBe('Not Settled');

    // Payment 2
    const p2 = await rentService.recordPayment(
      facilityId,
      { grnId, amountPaid: 2000, paymentMode: 'UPI', paymentDate: new Date() },
      userId,
    );
    expect(p2.summary.remainingBalance).toBe(1000);
    expect(p2.summary.paymentStatus).toBe('Not Settled');

    // Payment 3 (final balance)
    const p3 = await rentService.recordPayment(
      facilityId,
      { grnId, amountPaid: 1000, paymentMode: 'Cash', paymentDate: new Date() },
      userId,
    );
    expect(p3.summary.remainingBalance).toBe(0);
    expect(p3.summary.paymentStatus).toBe('Settled');
    expect(p3.summary.payments).toHaveLength(3);
  });

  // 4. Overpayment Guard
  it('overpayment guard rejects payment exceeding remaining balance with HTTP 400 and leaves ledger uncommitted', async () => {
    await expect(
      rentService.recordPayment(
        facilityId,
        {
          grnId,
          amountPaid: 5500, // exceeds 5000
          paymentMode: 'Cash',
          paymentDate: new Date(),
        },
        userId,
      ),
    ).rejects.toThrow(/exceeds remaining rent balance/);

    // Verify zero writes occurred
    const count = await RentPaymentModel.collection.countDocuments();
    expect(count).toBe(0);

    const summary = await rentService.getRentSummary(facilityId, grnId);
    expect(summary.totalPaid).toBe(0);
    expect(summary.remainingBalance).toBe(5000);
    expect(summary.paymentStatus).toBe('Not Settled');
  });

  // 5. Non-existent GRN Rejection
  it('rejects payment attempt against non-existent GRN', async () => {
    await expect(
      rentService.recordPayment(
        facilityId,
        {
          grnId: 'grn-non-existent',
          amountPaid: 1000,
          paymentMode: 'Cash',
          paymentDate: new Date(),
        },
        userId,
      ),
    ).rejects.toThrow(/not found in facility/);
  });

  // 6. Independent FY-Sequential Receipt Number Generation
  it('generates independent FY-sequential receipt numbers using counter', async () => {
    const res1 = await rentService.recordPayment(
      facilityId,
      { grnId, amountPaid: 1000, paymentMode: 'Cash', paymentDate: new Date() },
      userId,
    );
    const res2 = await rentService.recordPayment(
      facilityId,
      { grnId, amountPaid: 1000, paymentMode: 'UPI', paymentDate: new Date() },
      userId,
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
    const promises = [
      rentService.recordPayment(
        facilityId,
        { grnId, amountPaid: 3500, paymentMode: 'Cash', paymentDate: new Date() },
        'usr-op-a',
      ),
      rentService.recordPayment(
        facilityId,
        { grnId, amountPaid: 3500, paymentMode: 'UPI', paymentDate: new Date() },
        'usr-op-b',
      ),
    ];

    const results = await Promise.allSettled(promises);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // Ledger must have exactly 1 record for ₹3500
    const payments = await rentRepository.findPaymentsByGrnId(facilityId, grnId);
    expect(payments).toHaveLength(1);
    expect(payments[0]?.amountPaid).toBe(3500);

    const summary = await rentService.getRentSummary(facilityId, grnId);
    expect(summary.totalPaid).toBe(3500);
    expect(summary.remainingBalance).toBe(1500);
    expect(summary.paymentStatus).toBe('Not Settled');
  });

  // 8. Model Immutability
  it('model immutability: RentPaymentModel rejects updateOne, deleteMany, and in-place mutation', async () => {
    const res = await rentService.recordPayment(
      facilityId,
      { grnId, amountPaid: 1000, paymentMode: 'Cash', paymentDate: new Date() },
      userId,
    );

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

  // 9. Deterministic Payment History Ordering (paymentDate DESC, _id DESC)
  it('deterministic payment history ordering: returns records sorted by paymentDate DESC, _id DESC', async () => {
    const d1 = new Date('2026-04-01T10:00:00Z');
    const d2 = new Date('2026-04-05T10:00:00Z');
    const d3 = new Date('2026-04-03T10:00:00Z');

    await rentService.recordPayment(
      facilityId,
      { grnId, amountPaid: 1000, paymentMode: 'Cash', paymentDate: d1 },
      userId,
    );
    await rentService.recordPayment(
      facilityId,
      { grnId, amountPaid: 1000, paymentMode: 'Cash', paymentDate: d2 },
      userId,
    );
    await rentService.recordPayment(
      facilityId,
      { grnId, amountPaid: 1000, paymentMode: 'Cash', paymentDate: d3 },
      userId,
    );

    const summary = await rentService.getRentSummary(facilityId, grnId);
    expect(summary.payments).toHaveLength(3);
    expect(new Date(summary.payments[0]!.paymentDate).getTime()).toBe(d2.getTime());
    expect(new Date(summary.payments[1]!.paymentDate).getTime()).toBe(d3.getTime());
    expect(new Date(summary.payments[2]!.paymentDate).getTime()).toBe(d1.getTime());
  });

  // 10. Facility Isolation
  it('facility isolation: rejects payment collection for GRN in unauthorized facility', async () => {
    await FacilityModel.create({
      id: otherFacilityId,
      name: 'Other Facility',
      code: 'OTH',
      isActive: true,
    });

    await expect(
      rentService.recordPayment(
        otherFacilityId,
        { grnId, amountPaid: 1000, paymentMode: 'Cash', paymentDate: new Date() },
        userId,
      ),
    ).rejects.toThrow(/not found in facility/);
  });

  // 11. Post-Commit Audit
  it('post-commit audit: emits RENT_PAYMENT_COLLECTED audit log with non-sensitive details after successful commit', async () => {
    const res = await rentService.recordPayment(
      facilityId,
      {
        grnId,
        amountPaid: 2500,
        paymentMode: 'UPI',
        paymentDate: new Date(),
        notes: 'Audit check payment',
      },
      userId,
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
    expect(log.facilityId).toBe(facilityId);
    expect(log.userId).toBe(userId);
    expect(log.details).toBeDefined();
    expect(log.details?.grnId).toBe(grnId);
    expect(log.details?.receiptNumber).toBe(res.payment.receiptNumber);
    expect(log.details?.amountPaid).toBe(2500);
    expect(log.details?.paymentMode).toBe('UPI');
    expect(log.details?.remainingBalance).toBe(2500);
    expect(log.details?.paymentStatus).toBe('Not Settled');
  });
});
