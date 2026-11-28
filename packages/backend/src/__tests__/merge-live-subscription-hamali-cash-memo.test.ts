import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { seedControllerRates } from './helpers/lifecycle-testkit.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import { connectToTestDatabase, disconnectTestDatabase, resetStockCollections } from './helpers/stock-reset.js';
import { rentService } from '../modules/rent/rent.service.js';
import { buildMergeShiftingInvoiceDto } from '../modules/documents/merge-shifting-invoice.builder.js';
import { renderMergeShiftingInvoiceTemplate } from '../modules/documents/templates/merge-shifting-invoice.template.js';

const app = createApp();
const seedAuth = createAuthSeeder(config.jwtSecret);
const facilityId = 'fac-merge-memo';

describe('Consignment Merge Under Live Subscription - Hamali Cash Memo Only', () => {
  let adminToken: string;
  let customerId: string;
  const originalEnv = process.env.ALLOW_HISTORICAL_TESTING_DATES;

  beforeAll(async () => {
    process.env.ALLOW_HISTORICAL_TESTING_DATES = 'true';
    await connectToTestDatabase();
    ({ token: adminToken } = await seedAuth({
      userId: 'usr-merge-memo-admin',
      username: 'merge.memo.admin',
      role: 'ADMIN',
      facilityIds: [facilityId],
    }));
  });

  afterAll(async () => {
    if (originalEnv !== undefined) {
      process.env.ALLOW_HISTORICAL_TESTING_DATES = originalEnv;
    } else {
      delete process.env.ALLOW_HISTORICAL_TESTING_DATES;
    }
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await resetStockCollections();
    await mongoose.connection.collection('rentpayments').deleteMany({});
    await mongoose.connection.collection('internalmovements').deleteMany({});
    await seedFacility({ id: facilityId, code: 'MMEM', name: 'Merge Memo Facility' });
    customerId = await seedCustomer({ id: 'cust-mmem-1', facilityId, name: 'Farmer Srinivas' });
    const commodity = await CommodityModel.create({
      id: 'cmd-memo-chilli', name: 'Guntur Chilli', normalizedName: 'guntur chilli',
      isHamaliApplicable: true, hamaliRate: 6, isActive: true,
    });
    await seedControllerRates(commodity.id, { small: 25, big: 30 }, { small: 25, big: 30 });
  });

  it('generates a Cash Memo for Hamali charges only without creating or altering rent charges', async () => {
    const commodity = (await CommodityModel.findOne({ id: 'cmd-memo-chilli' }).lean().exec())!;

    const targetInwardDate = new Date('2026-04-10');
    const moveDate = new Date('2026-06-15');

    const targetGrnId = await seedGrn({
      facilityId, customerId, customerName: 'Farmer Srinivas', commodityId: commodity.id, commodityName: 'Guntur Chilli',
      chamber: 'CH-02', bags: 100, rentType: 'Seasonal', rentAmount: 3000, grnNumber: 'GRN-26-27-0301',
      date: targetInwardDate,
    });
    // Target has 100 bags @ ₹6 = ₹600 initial intake hamali. Base rent = 3000. Total due = 3600.
    await GrnModel.updateOne({ id: targetGrnId }, { $set: { hamaliRate: 6, hamaliAmount: 600 } });

    const sourceGrnId = await seedGrn({
      facilityId, customerId, customerName: 'Farmer Srinivas', commodityId: commodity.id, commodityName: 'Guntur Chilli',
      chamber: 'CH-03', bags: 50, rentType: 'Seasonal', rentAmount: 1500, grnNumber: 'GRN-26-27-0302',
      date: targetInwardDate,
    });

    const targetSummaryBefore = await rentService.getRentSummary(facilityId, targetGrnId);
    expect(targetSummaryBefore.totalDue).toBe(3600); // 3000 rent + 600 inward intake hamali
    expect(targetSummaryBefore.remainingBalance).toBe(3600);

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId,
        sourceGrnIds: [sourceGrnId],
        movementDate: moveDate,
        remarks: 'Live subscription merge testing hamali cash memo',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // 1. A Cash Memo was generated for Hamali charges only
    const payment = res.body.payment;
    expect(payment).toBeDefined();
    expect(payment.receiptNumber).toMatch(/^RRCPT-\d{2}-\d{2}-\d{4}$/);
    expect(payment.amountPaid).toBe(300); // 50 moved bags * ₹6 hamaliRate = ₹300
    expect(payment.notes).toContain('Consignment Merge Hamali Labor: 50 bags @ ₹6/bag');

    // 2. Target GRN rent obligation is NOT inflated with extra rent
    const targetDoc = await GrnModel.findOne({ id: targetGrnId }).lean().exec();
    expect(targetDoc?.rentAmount).toBe(3000); // rent unchanged
    expect(targetDoc?.bags).toBe(150);

    // 3. Storage rent summary: totalDue, totalPaid, and remainingBalance are NOT corrupted by hamali payment
    const targetSummaryAfter = await rentService.getRentSummary(facilityId, targetGrnId);
    expect(targetSummaryAfter.totalDue).toBe(3600); // exactly 3000 rent + 600 inward hamali (no duplicate)
    expect(targetSummaryAfter.remainingBalance).toBe(3600); // hamali labor did not deduct from storage rent

    // 4. Authoritative Cash Memo HTML rendering
    const receiptHtml = await rentService.renderReceipt(facilityId, payment.receiptNumber, 'usr-merge-memo-admin');
    expect(receiptHtml).toContain('CASH MEMO / HAMALI PAYMENT RECEIPT');
    expect(receiptHtml).toContain('Total Hamali Obligation');
    expect(receiptHtml).toContain('Active Subscription Preserved (Rent: ₹0.00)');
    expect(receiptHtml).toContain('Remaining Balance');
    expect(receiptHtml).toContain('Consignment Merge Hamali Labor: 50 bags @ ₹6/bag');

    // 5. Consignment Merge Invoice links Cash Memo
    const movementId = res.body.movement.id;
    const invoiceDto = await buildMergeShiftingInvoiceDto(facilityId, movementId, 'usr-merge-memo-admin');
    expect(invoiceDto.hamaliReceiptNumber).toBe(payment.receiptNumber);
    expect(invoiceDto.repackHamaliCharge).toBe(300);

    const invoiceHtml = renderMergeShiftingInvoiceTemplate(invoiceDto);
    expect(invoiceHtml).toContain(payment.receiptNumber);
    expect(invoiceHtml).toContain('Cash Memo: #');
  });

  it('generates hamali cash memo when target GRN was inwarded in January of current year (2026 Jan GRN)', async () => {
    const commodity = await CommodityModel.findOne({ id: 'cmd-memo-chilli' }).lean().exec();

    // 2026 January Inward Target GRN
    const targetGrnId = await seedGrn({
      facilityId, customerId, customerName: 'Farmer Srinivas', commodityId: commodity!.id, commodityName: 'Guntur Chilli',
      chamber: 'CH-02', bags: 80, rentType: 'Seasonal', rentAmount: 2400, grnNumber: 'GRN-26-27-0303',
      date: new Date('2026-01-15'),
    });

    // 2023 Source GRN
    const sourceGrnId = await seedGrn({
      facilityId, customerId, customerName: 'Farmer Srinivas', commodityId: commodity!.id, commodityName: 'Guntur Chilli',
      chamber: 'CH-03', bags: 40, rentType: 'Seasonal', rentAmount: 1200, grnNumber: 'GRN-23-24-0304',
      date: new Date('2023-04-10'),
    });

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId,
        sourceGrnIds: [sourceGrnId],
        movementDate: new Date('2026-01-20'),
        remarks: 'Merge 2023 source lot into 2026 Jan target lot',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Hamali Cash Memo must NOT be missing!
    const payment = res.body.payment;
    expect(payment).toBeDefined();
    expect(payment.receiptNumber).toMatch(/^RRCPT-\d{2}-\d{2}-\d{4}$/);
    expect(payment.amountPaid).toBe(240); // 40 bags * ₹6 = ₹240
    expect(payment.notes).toContain('Consignment Merge Hamali Labor: 40 bags @ ₹6/bag');
  });
});
