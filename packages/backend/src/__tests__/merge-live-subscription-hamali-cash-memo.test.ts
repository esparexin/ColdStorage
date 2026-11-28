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
import { seedOrganizationSettings } from './helpers/rent-fixtures.js';
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

  const postMerge = (payload: object) =>
    request(app).post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`).send(payload);

  beforeAll(async () => {
    process.env.ALLOW_HISTORICAL_TESTING_DATES = 'true';
    await connectToTestDatabase();
    ({ token: adminToken } = await seedAuth({
      userId: 'usr-merge-memo-admin', username: 'merge.memo.admin', role: 'ADMIN', facilityIds: [facilityId],
    }));
  });

  afterAll(async () => {
    if (originalEnv !== undefined) process.env.ALLOW_HISTORICAL_TESTING_DATES = originalEnv;
    else delete process.env.ALLOW_HISTORICAL_TESTING_DATES;
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await resetStockCollections();
    await seedOrganizationSettings();
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
      chamber: 'CH-02', bags: 100, rentType: 'Seasonal', rentAmount: 3000, grnNumber: 'GRN-26-27-0301', date: targetInwardDate,
    });
    await GrnModel.updateOne({ id: targetGrnId }, { $set: { hamaliRate: 6, hamaliAmount: 600 } });

    const sourceGrnId = await seedGrn({
      facilityId, customerId, customerName: 'Farmer Srinivas', commodityId: commodity.id, commodityName: 'Guntur Chilli',
      chamber: 'CH-03', bags: 50, rentType: 'Seasonal', rentAmount: 1500, grnNumber: 'GRN-26-27-0302', date: targetInwardDate,
    });

    const targetSummaryBefore = await rentService.getRentSummary(facilityId, targetGrnId);
    expect(targetSummaryBefore.totalDue).toBe(3600);
    expect(targetSummaryBefore.remainingBalance).toBe(3600);

    const res = await postMerge({
      targetGrnId, sourceGrnIds: [sourceGrnId], movementDate: moveDate,
      isRepackSelected: true, remarks: 'Live subscription merge testing hamali cash memo',
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.payment).toBeUndefined();

    const targetDoc = await GrnModel.findOne({ id: targetGrnId }).lean().exec();
    expect(targetDoc?.rentAmount).toBe(3000);
    expect(targetDoc?.bags).toBe(150);
    expect(targetDoc?.hamaliAmount).toBe(900);

    const targetSummaryAfter = await rentService.getRentSummary(facilityId, targetGrnId);
    expect(targetSummaryAfter.totalDue).toBe(3900);
    expect(targetSummaryAfter.totalPaid).toBe(0);
    expect(targetSummaryAfter.remainingBalance).toBe(3900);

    const invoiceDto = await buildMergeShiftingInvoiceDto(facilityId, res.body.movement.id, 'usr-merge-memo-admin');
    expect(invoiceDto.hamaliReceiptNumber).toBeNull();
    expect(invoiceDto.repackHamaliCharge).toBe(300);
    expect(renderMergeShiftingInvoiceTemplate(invoiceDto)).toContain('Status: UNPAID (Pending)');

    const payRes = await request(app).post(`/api/facilities/${facilityId}/rent/collect`)
      .set('Authorization', `Bearer ${adminToken}`).send({
        grnId: targetGrnId, amountPaid: 300, paymentMode: 'Cash', paymentDate: moveDate, notes: 'Paid Hamali charges for merge lot',
      });
    expect(payRes.status).toBe(201);
    expect(payRes.body.payment.receiptNumber).toMatch(/^RRCPT-\d{2}-\d{2}-\d{4}$/);
    expect(payRes.body.payment.amountPaid).toBe(300);

    const targetSummaryPaid = await rentService.getRentSummary(facilityId, targetGrnId);
    expect(targetSummaryPaid.totalPaid).toBe(300);
    expect(targetSummaryPaid.remainingBalance).toBe(3600);
  });

  it('generates hamali cash memo when target GRN was inwarded in January of current year (2026 Jan GRN)', async () => {
    const commodity = await CommodityModel.findOne({ id: 'cmd-memo-chilli' }).lean().exec();
    const targetGrnId = await seedGrn({
      facilityId, customerId, customerName: 'Farmer Srinivas', commodityId: commodity!.id, commodityName: 'Guntur Chilli',
      chamber: 'CH-02', bags: 80, rentType: 'Seasonal', rentAmount: 2400, grnNumber: 'GRN-26-27-0303', date: new Date('2026-01-15'),
    });
    const sourceGrnId = await seedGrn({
      facilityId, customerId, customerName: 'Farmer Srinivas', commodityId: commodity!.id, commodityName: 'Guntur Chilli',
      chamber: 'CH-03', bags: 40, rentType: 'Seasonal', rentAmount: 1200, grnNumber: 'GRN-23-24-0304', date: new Date('2023-04-10'),
    });

    const res = await postMerge({
      targetGrnId, sourceGrnIds: [sourceGrnId], movementDate: new Date('2026-11-28'),
      isRepackSelected: true, sourcePaymentAmount: 240, sourcePaymentMode: 'Cash',
      remarks: 'Merge 2023 source lot into 2026 Jan target lot in November',
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.payment).toBeDefined();
    expect(res.body.payment.receiptNumber).toMatch(/^RRCPT-\d{2}-\d{2}-\d{4}$/);
    expect(res.body.payment.amountPaid).toBe(240);
    expect(res.body.payment.notes).toContain('Consignment Merge Hamali Labor: 40 bags @ ₹6/bag');
  });

  it('generates hamali cash memo for 2026 August inward target GRN merged in November 2026', async () => {
    const commodity = await CommodityModel.findOne({ id: 'cmd-memo-chilli' }).lean().exec();
    const targetGrnId = await seedGrn({
      facilityId, customerId, customerName: 'Farmer Srinivas', commodityId: commodity!.id, commodityName: 'Guntur Chilli',
      chamber: 'CH-02', bags: 60, rentType: 'Seasonal', rentAmount: 1800, grnNumber: 'GRN-26-27-0305', date: new Date('2026-08-10'),
    });
    const sourceGrnId = await seedGrn({
      facilityId, customerId, customerName: 'Farmer Srinivas', commodityId: commodity!.id, commodityName: 'Guntur Chilli',
      chamber: 'CH-03', bags: 30, rentType: 'Seasonal', rentAmount: 900, grnNumber: 'GRN-26-27-0306', date: new Date('2026-08-15'),
    });
    const res = await postMerge({
      targetGrnId, sourceGrnIds: [sourceGrnId], movementDate: new Date('2026-11-28'),
      isRepackSelected: true, sourcePaymentAmount: 180, sourcePaymentMode: 'Cash',
      remarks: 'Merge August lot into August target in November',
    });
    expect(res.status).toBe(200);
    expect(res.body.payment).toBeDefined();
    expect(res.body.payment.amountPaid).toBe(180);
  });

  it('uses targetGrn.hamaliRate fallback when commodity hamaliRate is missing', async () => {
    const zeroComm = await CommodityModel.create({
      id: 'cmd-memo-zero', name: 'Zero Hamali Commodity', normalizedName: 'zero hamali commodity',
      isHamaliApplicable: true, hamaliRate: 0, isActive: true,
    });
    await seedControllerRates(zeroComm.id, { small: 25, big: 30 }, { small: 25, big: 30 });
    const targetGrnId = await seedGrn({
      facilityId, customerId, customerName: 'Farmer Srinivas', commodityId: zeroComm.id, commodityName: 'Zero Hamali',
      chamber: 'CH-02', bags: 50, rentType: 'Seasonal', rentAmount: 1500, grnNumber: 'GRN-26-27-0307', date: new Date('2026-05-10'),
    });
    await GrnModel.updateOne({ id: targetGrnId }, { $set: { hamaliRate: 8, hamaliAmount: 400 } });
    const sourceGrnId = await seedGrn({
      facilityId, customerId, customerName: 'Farmer Srinivas', commodityId: zeroComm.id, commodityName: 'Zero Hamali',
      chamber: 'CH-03', bags: 25, rentType: 'Seasonal', rentAmount: 750, grnNumber: 'GRN-26-27-0308', date: new Date('2026-05-10'),
    });
    const res = await postMerge({
      targetGrnId, sourceGrnIds: [sourceGrnId], movementDate: new Date('2026-06-15'),
      isRepackSelected: true, sourcePaymentAmount: 200, sourcePaymentMode: 'Cash',
      remarks: 'Merge using target hamali rate fallback',
    });
    expect(res.status).toBe(200);
    expect(res.body.payment).toBeDefined();
    expect(res.body.payment.amountPaid).toBe(200);
  });

  it('charges zero repacking hamali and generates no cash memo when merge under live subscription is performed without repacking', async () => {
    const commodity = await CommodityModel.findOne({ id: 'cmd-memo-chilli' }).lean().exec();
    const targetGrnId = await seedGrn({
      facilityId, customerId, customerName: 'Farmer Srinivas', commodityId: commodity!.id, commodityName: 'Guntur Chilli',
      chamber: 'CH-02', bags: 100, rentType: 'Seasonal', rentAmount: 3000, grnNumber: 'GRN-26-27-0309', date: new Date('2026-04-10'),
    });
    await GrnModel.updateOne({ id: targetGrnId }, { $set: { hamaliRate: 6, hamaliAmount: 600 } });
    const sourceGrnId = await seedGrn({
      facilityId, customerId, customerName: 'Farmer Srinivas', commodityId: commodity!.id, commodityName: 'Guntur Chilli',
      chamber: 'CH-03', bags: 50, rentType: 'Seasonal', rentAmount: 1500, grnNumber: 'GRN-26-27-0310', date: new Date('2026-04-10'),
    });
    const res = await postMerge({
      targetGrnId, sourceGrnIds: [sourceGrnId], movementDate: new Date('2026-06-15'),
      remarks: 'Direct merge under live subscription without repacking',
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.payment).toBeUndefined();
    expect(res.body.movement.hamaliCharge ?? 0).toBe(0);
    expect('hamaliCharge' in res.body.movement).toBe(false);

    const targetDoc = await GrnModel.findOne({ id: targetGrnId }).lean().exec();
    expect(targetDoc?.hamaliAmount).toBe(600);
    expect(targetDoc?.rentAmount).toBe(3000);
    expect(targetDoc?.bags).toBe(150);
  });
});
