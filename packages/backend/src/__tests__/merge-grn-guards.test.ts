import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CommodityRateModel } from '../database/models/commodity-rate.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { AuditLogModel } from '../database/models/audit-log.model.js';
import { RentPaymentModel } from '../database/models/rent-payment.model.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { useHistoricalTestingDates } from './helpers/historical-dates-env.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

const app = createApp();
const seedAuth = createAuthSeeder(config.jwtSecret);
const facilityId = 'fac-merge-guard';

describe('Merge GRN input guards', () => {
  let adminToken: string;
  let customerA: string;
  let commodityId: string;
  let targetId: string;
  let sourceId: string;

  useHistoricalTestingDates();

  beforeAll(async () => {
    await connectToTestDatabase();
    ({ token: adminToken } = await seedAuth({
      userId: 'usr-merge-guard',
      username: 'merge.guard',
      role: 'ADMIN',
      facilityIds: [facilityId],
    }));
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await CommodityRateModel.deleteMany({});
    await CommodityRateModel.create([{ id: 'crt-cmd-mgd-tamarind-s', commodityId: 'cmd-mgd-tamarind', rentType: 'Seasonal', smallRate: 10, bigRate: 15, isActive: true }, { id: 'crt-cmd-mgd-tamarind-m', commodityId: 'cmd-mgd-tamarind', rentType: 'Monthly', smallRate: 10, bigRate: 15, isActive: true }]);
    await mongoose.connection.collection('rentpayments').deleteMany({});
    await mongoose.connection.collection('internalmovements').deleteMany({});
    await seedFacility({ id: facilityId, code: 'MGD', name: 'Merge Guard Facility' });
    customerA = await seedCustomer({ id: 'cust-mgd', facilityId, name: 'Guard Farmer' });
    const cmd = await CommodityModel.create({
      id: 'cmd-mgd-tamarind',
      name: 'Tamarind',
      normalizedName: 'tamarind',
      isActive: true,
    });
    commodityId = cmd.id;
    targetId = await seedGrn({
      facilityId,
      customerId: customerA,
      customerName: 'Guard Farmer',
      commodityId,
      commodityName: 'Tamarind',
      chamber: 'CH-01',
      bags: 100,
      rentAmount: 2000,
      grnNumber: 'GRN-MGD-TARGET',
    });
    sourceId = await seedGrn({
      facilityId,
      customerId: customerA,
      customerName: 'Guard Farmer',
      commodityId,
      commodityName: 'Tamarind',
      chamber: 'CH-01',
      bags: 50,
      rentAmount: 1000,
      grnNumber: 'GRN-MGD-SOURCE',
    });
  });

  it('rejects duplicate source GRN IDs without mutating stock', async () => {
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId: targetId,
        sourceGrnIds: [sourceId, sourceId],
        movementDate: new Date(),
        remarks: 'Duplicate source attempt',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Duplicate source GRN IDs');
    expect((await GrnModel.findOne({ id: targetId }).lean().exec())?.bags).toBe(100);
    expect((await GrnModel.findOne({ id: sourceId }).lean().exec())?.status).toBe('OPEN');
  });

  it('supports multi-source merges carrying an inline settlement payment (Pay Now)', async () => {
    const extraId = await seedGrn({
      facilityId, customerId: customerA, customerName: 'Guard Farmer', commodityId,
      commodityName: 'Tamarind', chamber: 'CH-01', bags: 20, rentAmount: 500, grnNumber: 'GRN-MGD-EXTRA',
    });

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId: targetId, sourceGrnIds: [sourceId, extraId],
        movementDate: new Date(), remarks: 'Multi-source settlement attempt',
        sourcePaymentAmount: 500, sourcePaymentMode: 'Cash',
      });

    expect(res.status).toBe(200);
    expect((await GrnModel.findOne({ id: targetId }).lean().exec())?.bags).toBe(170);
    expect(await RentPaymentModel.countDocuments({ facilityId }).exec()).toBe(1);
    const pay = await RentPaymentModel.findOne({ facilityId }).lean().exec();
    expect(pay?.amountPaid).toBe(500);
    expect([sourceId, extraId]).toContain(pay?.grnId);
  });

  it('rejects multi-source merge when payment exceeds total pending rent across sources', async () => {
    const extraId = await seedGrn({
      facilityId, customerId: customerA, customerName: 'Guard Farmer', commodityId,
      commodityName: 'Tamarind', chamber: 'CH-01', bags: 20, rentAmount: 500, grnNumber: 'GRN-MGD-EXTRA-2',
    });

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId: targetId, sourceGrnIds: [sourceId, extraId],
        movementDate: new Date(), remarks: 'Multi-source overpayment attempt',
        sourcePaymentAmount: 2500, sourcePaymentMode: 'Cash',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('exceeds total remaining rent balance across source GRNs');
  });

  it('preserves the reference weight in the merge audit trail', async () => {
    await mongoose.connection.collection('auditlogs').deleteMany({});

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId: targetId,
        sourceGrnIds: [sourceId],
        movementDate: new Date(),
        remarks: 'Merge with weighbridge reference',
        referenceWeight: 5000,
      });

    expect(res.status).toBe(200);
    expect(res.body.targetGrn.bags).toBe(150);
    expect(res.body.movement.referenceWeight).toBe(5000);
    const auditEntry = await AuditLogModel.findOne({
      eventType: 'INTERNAL_MOVEMENT_MERGE',
      resourceId: targetId,
    })
      .lean()
      .exec();
    expect(auditEntry?.details?.['referenceWeight']).toBe(5000);
  });

  it('rejects merging when source GRN belongs to a future season relative to target', async () => {
    await GrnModel.updateOne({ id: targetId }, { $set: { date: new Date('2024-04-15') } });
    const futureSourceId = await seedGrn({
      facilityId,
      customerId: customerA,
      customerName: 'Guard Farmer',
      commodityId,
      commodityName: 'Tamarind',
      chamber: 'CH-01',
      bags: 40,
      rentAmount: 800,
      grnNumber: 'GRN-MGD-FUTURE',
      date: new Date('2025-04-15'),
    });

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId: targetId,
        sourceGrnIds: [futureSourceId],
        movementDate: new Date('2025-05-01'),
        remarks: 'Attempt future season merge',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Season incompatibility');
  });

  it('resolves canonical bag type: transitions S target to S+B when merging B source', async () => {
    const bigSourceId = await seedGrn({
      facilityId,
      customerId: customerA,
      customerName: 'Guard Farmer',
      commodityId,
      commodityName: 'Tamarind',
      chamber: 'CH-01',
      bags: 40,
      bagType: 'B',
      rentAmount: 800,
      grnNumber: 'GRN-MGD-BIG',
    });

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId: targetId,
        sourceGrnIds: [bigSourceId],
        movementDate: new Date(),
        remarks: 'Merge big bags into small lot',
      });

    expect(res.status).toBe(200);
    expect(res.body.targetGrn.bagType).toBe('S+B');
    expect(res.body.targetGrn.smallBags).toBe(100);
    expect(res.body.targetGrn.bigBags).toBe(40);
  });

  it('merges Hybrid uniform price lots without forcing artificial small/big split', async () => {
    const hybridSourceId = await seedGrn({
      facilityId, customerId: customerA, customerName: 'Guard Farmer', commodityId,
      commodityName: 'Tamarind', chamber: 'CH-01', bags: 60, bagPrice: 50,
      rentAmount: 3000, grnNumber: 'GRN-MGD-HYBRID',
    });

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId: targetId,
        sourceGrnIds: [hybridSourceId],
        movementDate: new Date(),
        remarks: 'Merge hybrid uniform price lot',
      });

    expect(res.status).toBe(200);
    expect(res.body.targetGrn.bags).toBe(160);
  });
});

