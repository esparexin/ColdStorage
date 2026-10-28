import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { GrnModel } from '../database/models/grn.model.js';
import { deliveryService } from '../modules/delivery/delivery.service.js';
import { rentService } from '../modules/rent/rent.service.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

describe('Multi-GRN Batch Rent Payment Collection', () => {
  const app = createApp();
  const seedAuth = createAuthSeeder(config.jwtSecret);
  const OPERATOR_USER_ID = 'usr-batch-pay-op';

  let facilityId: string;
  let customerId: string;
  let operatorToken: string;
  let grn1Id: string;
  let grn2Id: string;
  let grn3Id: string;

  beforeAll(async () => {
    await connectToTestDatabase();
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    facilityId = await seedFacility({ name: 'Batch Rent Facility' });
    customerId = await seedCustomer({ facilityId, name: 'Batch Customer' });

    ({ token: operatorToken } = await seedAuth({
      userId: OPERATOR_USER_ID,
      username: 'batch_operator',
      role: 'OPERATOR',
      facilityIds: [facilityId],
    }));

    grn1Id = await seedGrn({
      facilityId,
      customerId,
      grnNumber: 'BATCH-GRN-01',
      bags: 100,
      bagType: 'S',
      rentAmount: 5000,
      rentType: 'Seasonal',
    });

    grn2Id = await seedGrn({
      facilityId,
      customerId,
      grnNumber: 'BATCH-GRN-02',
      bags: 60,
      bagType: 'S',
      bagPrice: 50,
      rentAmount: 3000,
      rentType: 'Seasonal',
    });

    grn3Id = await seedGrn({
      facilityId,
      customerId,
      grnNumber: 'BATCH-GRN-03',
      bags: 40,
      bagType: 'S',
      rentAmount: 2000,
      rentType: 'Seasonal',
    });
  });

  it('records batch payment across multiple GRNs with unique sequential receipts', async () => {
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/rent/collect-batch`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        customerId,
        allocations: [
          { grnId: grn1Id, amountPaid: 2000 },
          { grnId: grn2Id, amountPaid: 3000 },
          { grnId: grn3Id, amountPaid: 1000 },
        ],
        paymentMode: 'Cash',
        paymentDate: new Date().toISOString(),
        notes: 'Seasonal batch clearance',
      });

    expect(res.status).toBe(201);
    expect(res.body.totalAmountPaid).toBe(6000);
    expect(res.body.settledGrnCount).toBe(1);
    expect(res.body.payments).toHaveLength(3);
    expect(res.body.summaries).toHaveLength(3);

    const receiptNumbers = res.body.payments.map((p: { receiptNumber: string }) => p.receiptNumber);
    const uniqueReceipts = new Set(receiptNumbers);
    expect(uniqueReceipts.size).toBe(3);

    const s1 = await rentService.getRentSummary(facilityId, grn1Id);
    expect(s1.remainingBalance).toBe(3000);
    expect(s1.paymentStatus).toBe('Not Settled');

    const s2 = await rentService.getRentSummary(facilityId, grn2Id);
    expect(s2.remainingBalance).toBe(0);
    expect(s2.paymentStatus).toBe('Settled');

    const s3 = await rentService.getRentSummary(facilityId, grn3Id);
    expect(s3.remainingBalance).toBe(1000);
  });

  it('atomically rolls back all allocations when any single GRN allocation exceeds remaining balance', async () => {
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/rent/collect-batch`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        customerId,
        allocations: [
          { grnId: grn1Id, amountPaid: 2000 },
          { grnId: grn2Id, amountPaid: 99999 }, // exceeds ₹3,000 balance
        ],
        paymentMode: 'Cash',
        paymentDate: new Date().toISOString(),
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/exceeds remaining rent balance/);

    const s1 = await rentService.getRentSummary(facilityId, grn1Id);
    expect(s1.remainingBalance).toBe(5000);
    expect(s1.payments).toHaveLength(0);

    const s2 = await rentService.getRentSummary(facilityId, grn2Id);
    expect(s2.remainingBalance).toBe(3000);
    expect(s2.payments).toHaveLength(0);
  });

  it('rejects batch payment if a GRN belongs to a different customer', async () => {
    const otherCustomerId = await seedCustomer({ facilityId, name: 'Other Customer' });
    const otherGrnId = await seedGrn({
      facilityId,
      customerId: otherCustomerId,
      grnNumber: 'OTHER-GRN-99',
      bags: 50,
      bagType: 'S',
      rentAmount: 2500,
    });

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/rent/collect-batch`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        customerId,
        allocations: [
          { grnId: grn1Id, amountPaid: 1000 },
          { grnId: otherGrnId, amountPaid: 1000 },
        ],
        paymentMode: 'Cash',
        paymentDate: new Date().toISOString(),
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/belongs to customer/);
  });

  it('rejects batch payment with duplicate GRN allocations in the payload', async () => {
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/rent/collect-batch`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        customerId,
        allocations: [
          { grnId: grn1Id, amountPaid: 1000 },
          { grnId: grn1Id, amountPaid: 500 },
        ],
        paymentMode: 'Cash',
        paymentDate: new Date().toISOString(),
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('transitions GRN status to CLOSED when both stock and balance reach zero', async () => {
    // Deliver all 60 bags from GRN-2
    await deliveryService.createDelivery(
      facilityId,
      { grnId: grn2Id, quantity: 60, smallBags: 60, bigBags: 0 },
      OPERATOR_USER_ID,
    );

    const beforePay = await GrnModel.findOne({ id: grn2Id }).lean().exec();
    expect(beforePay?.status).toBe('OPEN');

    // Settle remaining rent in batch
    await request(app)
      .post(`/api/facilities/${facilityId}/rent/collect-batch`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        customerId,
        allocations: [{ grnId: grn2Id, amountPaid: 3000 }],
        paymentMode: 'Cash',
        paymentDate: new Date().toISOString(),
      });

    const afterPay = await GrnModel.findOne({ id: grn2Id }).lean().exec();
    expect(afterPay?.status).toBe('CLOSED');
  });
});
