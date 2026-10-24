import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { seedControllerRates } from './helpers/lifecycle-testkit.js';
import { GrnModel } from '../database/models/grn.model.js';
import { RentPaymentModel } from '../database/models/rent-payment.model.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import { connectToTestDatabase, disconnectTestDatabase, resetStockCollections } from './helpers/stock-reset.js';

const app = createApp();
const seedAuth = createAuthSeeder(config.jwtSecret);
const facilityId = 'fac-cross-merge-recon';

describe('Cross-Season Merge — Seasonal Rent Reconciliation (GRN 0032 to 0033)', () => {
  let adminToken: string;
  let customerA: string;
  let commodityId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
    ({ token: adminToken } = await seedAuth({
      userId: 'usr-cross-admin',
      username: 'cross.admin',
      role: 'ADMIN',
      facilityIds: [facilityId],
    }));
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await mongoose.connection.collection('rentpayments').deleteMany({});
    await mongoose.connection.collection('internalmovements').deleteMany({});
    await seedFacility({ id: facilityId, code: 'CRF', name: 'Cross Recon Facility' });
    customerA = await seedCustomer({ id: 'cust-cross-a', facilityId, name: 'Penchaliah' });
    const cmd = await CommodityModel.create({
      id: 'cmd-paddy-cross',
      name: 'Paddy',
      normalizedName: 'paddy',
      isActive: true,
      isHamaliApplicable: true,
      hamaliRate: 20,
    });
    commodityId = cmd.id;
    await seedControllerRates(commodityId, { small: 200, big: 200 }, { small: 60, big: 60 });
  });

  it('1. Source 0032 (inward 2024) into Target 0033 (inward 2026) excludes Season 2026 from source and prevents double billing', async () => {
    // Target GRN 0033: 1 bag, inward 10 April 2026 (Season 2026), initial rent ₹200
    const targetGrnId = await seedGrn({
      facilityId, customerId: customerA, customerName: 'Penchaliah', commodityId, commodityName: 'Paddy',
      chamber: 'CH-01', bags: 1, bagType: 'S', rentType: 'Seasonal', rentAmount: 200, grnNumber: '0033',
      date: new Date('2026-04-10'),
      smallBagPrice: 200, bigBagPrice: 200, bagPrice: 200,
    });

    // Source GRN 0032: 1 bag, inward 12 June 2024 (Season 2024), initial unbilled rentAmount: 0
    const sourceGrnId = await seedGrn({
      facilityId, customerId: customerA, customerName: 'Penchaliah', commodityId, commodityName: 'Paddy',
      chamber: 'CH-01', bags: 1, bagType: 'S', rentType: 'Seasonal', rentAmount: 0, grnNumber: '0032',
      date: new Date('2024-06-12'),
      smallBagPrice: 200, bigBagPrice: 200, bagPrice: 200,
    });

    // Merge on 16 October 2026:
    // Historical periods for source:
    // - Season 2024: ₹200
    // - Jan-Feb 2025: ₹120 (2 * 60)
    // - Season 2025: ₹200
    // - Jan-Feb 2026: ₹120 (2 * 60)
    // - Season 2026: EXCLUDED (surviving target collects Season 2026)
    // Total source rent = ₹640, Inward Hamali = ₹20 -> Total obligation = ₹660
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId,
        sourceGrnIds: [sourceGrnId],
        movementDate: new Date('2026-10-16'),
        remarks: 'Stock consolidation from 2024 lot',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Under independent billing, target GRN retains strictly its own obligation (200)
    expect(res.body.targetGrn.rentAmount).toBe(200);
    expect(res.body.targetGrn.bags).toBe(2);

    const closedSource = await GrnModel.findOne({ id: sourceGrnId }).lean().exec();
    expect(closedSource?.status).toBe('CLOSED');
    expect(closedSource?.remarks).toContain('Rent Obligation ₹640, Paid ₹0, Pending ₹660');

    // Repeated merge attempts on closed source GRN are rejected
    const retryRes = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId,
        sourceGrnIds: [sourceGrnId],
        movementDate: new Date('2026-10-16'),
        remarks: 'Duplicate merge retry',
      });
    expect(retryRes.status).toBe(400);
    expect(retryRes.body.error).toContain('already CLOSED');
  });

  it('2. Already-paid source rent is preserved and not carried forward as unpaid debt', async () => {
    const targetGrnId = await seedGrn({
      facilityId, customerId: customerA, customerName: 'Penchaliah', commodityId, commodityName: 'Paddy',
      chamber: 'CH-01', bags: 1, bagType: 'S', rentType: 'Seasonal', rentAmount: 200, grnNumber: '0035',
      date: new Date('2026-04-10'),
      smallBagPrice: 200, bigBagPrice: 200, bagPrice: 200,
    });

    const sourceGrnId = await seedGrn({
      facilityId, customerId: customerA, customerName: 'Penchaliah', commodityId, commodityName: 'Paddy',
      chamber: 'CH-01', bags: 1, bagType: 'S', rentType: 'Seasonal', rentAmount: 0, grnNumber: '0034',
      date: new Date('2024-06-12'),
      smallBagPrice: 200, bigBagPrice: 200, bagPrice: 200,
    });

    await RentPaymentModel.create({
      id: 'rp-cross-src-paid', facilityId, grnId: sourceGrnId, grnNumber: '0034',
      receiptNumber: 'RCPT-CROSS-SETTLED-01', amountPaid: 660, paymentMode: 'Cash',
      paymentDate: new Date('2026-03-01'), createdBy: 'usr-cross-admin',
    });

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId,
        sourceGrnIds: [sourceGrnId],
        movementDate: new Date('2026-10-16'),
        remarks: 'Merge fully settled lot',
      });

    expect(res.status).toBe(200);
    // Carried rent is ₹0; target continues its own ₹200 rentAmount
    expect(res.body.targetGrn.rentAmount).toBe(200);

    const closedSource = await GrnModel.findOne({ id: sourceGrnId }).lean().exec();
    expect(closedSource?.status).toBe('CLOSED');
    expect(closedSource?.remarks).toContain('Paid ₹660, Pending ₹0 (Status: Settled)');
  });

  it('3. Cross-season merge with differential bag compositions (Small + Big) computes correct elapsed rates', async () => {
    await seedControllerRates(commodityId, { small: 150, big: 210 }, { small: 15, big: 21 });

    const targetGrnId = await seedGrn({
      facilityId, customerId: customerA, customerName: 'Penchaliah', commodityId, commodityName: 'Paddy',
      chamber: 'CH-01', bags: 10, bagType: 'S+B', smallBags: 5, bigBags: 5, rentType: 'Seasonal', rentAmount: 1800, grnNumber: '0037',
      date: new Date('2026-04-10'),
      smallBagPrice: 150, bigBagPrice: 210,
    });

    // Source GRN: 2 bags (1 Small + 1 Big), inward 2024-06-12, rentAmount 0
    // Per-period rent for 1 Small + 1 Big:
    // - Season: 150 + 210 = 360
    // - Monthly extension: 15 + 21 = 36
    // Historical elapsed:
    // - Season 2024: 360
    // - Jan-Feb 2025: 72 (2 * 36)
    // - Season 2025: 360
    // - Jan-Feb 2026: 72 (2 * 36)
    // Total historical rent = 864, Hamali for 2 bags @ 20 = 40 -> Total historical obligation = 904
    // Season 2026 excluded from source
    const sourceGrnId = await seedGrn({
      facilityId, customerId: customerA, customerName: 'Penchaliah', commodityId, commodityName: 'Paddy',
      chamber: 'CH-01', bags: 2, bagType: 'S+B', smallBags: 1, bigBags: 1, rentType: 'Seasonal', rentAmount: 0, grnNumber: '0036',
      date: new Date('2024-06-12'),
      smallBagPrice: 150, bigBagPrice: 210,
    });

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId,
        sourceGrnIds: [sourceGrnId],
        movementDate: new Date('2026-10-16'),
        remarks: 'Merge S+B composition lot',
        repackedSmallBags: 1,
        repackedBigBags: 1,
      });

    expect(res.status).toBe(200);
    // Under independent billing, target GRN retains strictly its own obligation (1800)
    expect(res.body.targetGrn.rentAmount).toBe(1800);
    expect(res.body.targetGrn.bags).toBe(12);
    expect(res.body.targetGrn.smallBags).toBe(6);
    expect(res.body.targetGrn.bigBags).toBe(6);
  });
});
