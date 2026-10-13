import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import { deliveryService } from '../modules/delivery/delivery.service.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

const app = createApp();
const seedAuth = createAuthSeeder(config.jwtSecret);
const facilityId = 'fac-mov-bagcat';

describe('Internal Move bag-category confirmation (outward SSOT)', () => {
  let adminToken: string;
  let customerA: string;
  let commodityId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
    ({ token: adminToken } = await seedAuth({
      userId: 'usr-mov-bagcat',
      username: 'mov.bagcat',
      role: 'ADMIN',
      facilityIds: [facilityId],
    }));
  });

  afterAll(disconnectTestDatabase);

  async function seedPair(opts?: { sourceBags?: number; sourceBagType?: 'S' | 'B' | 'S+B'; smallBags?: number; bigBags?: number }) {
    await resetStockCollections();
    await mongoose.connection.collection('rentpayments').deleteMany({});
    await mongoose.connection.collection('internalmovements').deleteMany({});
    await seedFacility({ id: facilityId, code: 'MOVBC', name: 'BagCat Facility' });
    customerA = await seedCustomer({ id: 'cust-bc-a', facilityId, name: 'Farmer Bagcat' });
    const cmd = await CommodityModel.create({
      id: 'cmd-bagcat',
      name: 'Bagcat Paddy',
      normalizedName: 'bagcat paddy',
      isActive: true,
    });
    commodityId = cmd.id;
    const target = await seedGrn({
      facilityId, customerId: customerA, customerName: 'Farmer Bagcat', commodityId,
      commodityName: 'Bagcat Paddy', chamber: 'CH-01', bags: 100, bagType: 'S',
      rentAmount: 2000, grnNumber: 'GRN-BC-0100',
    });
    const source = await seedGrn({
      facilityId, customerId: customerA, customerName: 'Farmer Bagcat', commodityId,
      commodityName: 'Bagcat Paddy', chamber: 'CH-02', bags: opts?.sourceBags ?? 50,
      bagType: opts?.sourceBagType ?? 'S', smallBags: opts?.smallBags, bigBags: opts?.bigBags,
      rentAmount: 1000, grnNumber: 'GRN-BC-0050',
    });
    return { target, source };
  }

  async function postMerge(body: Record<string, unknown>) {
    return request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);
  }

  it('confirms Small: moves the total as small bags and records the category', async () => {
    const { target, source } = await seedPair();
    const res = await postMerge({
      targetGrnId: target, sourceGrnIds: [source], movementDate: new Date(),
      remarks: 'Confirm small lot merge', sourceBagCategory: 'Small',
    });
    expect(res.status).toBe(200);
    expect(res.body.targetGrn.bags).toBe(150);
    expect(res.body.movement.smallBagsMoved).toBe(50);
    expect(res.body.movement.bigBagsMoved).toBe(0);
    expect(res.body.movement.sourceBagCategory).toBe('Small');
  });

  it('confirms Big: moves the total as big bags', async () => {
    const { target, source } = await seedPair({ sourceBags: 40, sourceBagType: 'B' });
    const res = await postMerge({
      targetGrnId: target, sourceGrnIds: [source], movementDate: new Date(),
      remarks: 'Confirm big lot merge', sourceBagCategory: 'Big',
    });
    expect(res.status).toBe(200);
    expect(res.body.movement.smallBagsMoved).toBe(0);
    expect(res.body.movement.bigBagsMoved).toBe(40);
    expect(res.body.movement.sourceBagCategory).toBe('Big');
  });

  it('confirms Small & Big with an explicit reconciling split', async () => {
    const { target, source } = await seedPair({ sourceBags: 50, sourceBagType: 'S' });
    const res = await postMerge({
      targetGrnId: target, sourceGrnIds: [source], movementDate: new Date(),
      remarks: 'Confirm split merge', sourceBagCategory: 'Small & Big',
      repackedSmallBags: 30, repackedBigBags: 20,
    });
    expect(res.status).toBe(200);
    expect(res.body.movement.smallBagsMoved).toBe(30);
    expect(res.body.movement.bigBagsMoved).toBe(20);
  });

  it('confirms Hybrid with quantity and informational rate, leaving rent unchanged', async () => {
    const { target, source } = await seedPair();
    const plain = await postMerge({
      targetGrnId: target, sourceGrnIds: [source], movementDate: new Date(),
      remarks: 'Baseline merge without category',
    });
    expect(plain.status).toBe(200);

    const { target: target2, source: source2 } = await seedPair();
    const hybrid = await postMerge({
      targetGrnId: target2, sourceGrnIds: [source2], movementDate: new Date(),
      remarks: 'Hybrid confirmed merge', sourceBagCategory: 'Hybrid',
      sourceQuantity: 50, sourceBagPrice: 99.99,
    });
    expect(hybrid.status).toBe(200);
    expect(hybrid.body.movement.smallBagsMoved + hybrid.body.movement.bigBagsMoved).toBe(50);
    expect(hybrid.body.movement.sourceBagCategory).toBe('Hybrid');
    expect(hybrid.body.movement.sourceBagPrice).toBe(99.99);
    // Informational rate alone must not change the rent obligation.
    expect(hybrid.body.movement.financialSnapshot.rentAmount).toBe(
      plain.body.movement.financialSnapshot.rentAmount,
    );
    expect(hybrid.body.targetGrn.rentAmount).toBe(plain.body.targetGrn.rentAmount);
  });

  it('treats Mixed as Hybrid-family without reinterpretation', async () => {
    const { target, source } = await seedPair();
    const res = await postMerge({
      targetGrnId: target, sourceGrnIds: [source], movementDate: new Date(),
      remarks: 'Mixed confirmed merge', sourceBagCategory: 'Mixed',
      sourceQuantity: 50, sourceMonthlyBagPrice: 10,
    });
    expect(res.status).toBe(200);
    expect(res.body.movement.smallBagsMoved + res.body.movement.bigBagsMoved).toBe(50);
    expect(res.body.movement.sourceBagCategory).toBe('Mixed');
  });

  it('rejects Hybrid quantity mismatch and missing rates', async () => {
    const { target, source } = await seedPair();
    const mismatch = await postMerge({
      targetGrnId: target, sourceGrnIds: [source], movementDate: new Date(),
      remarks: 'Hybrid quantity mismatch', sourceBagCategory: 'Hybrid',
      sourceQuantity: 20, sourceBagPrice: 10,
    });
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.error).toContain('must match total moved stock');

    const noRate = await postMerge({
      targetGrnId: target, sourceGrnIds: [source], movementDate: new Date(),
      remarks: 'Hybrid missing rate', sourceBagCategory: 'Hybrid', sourceQuantity: 50,
    });
    expect(noRate.status).toBe(400);
    expect(noRate.body.error).toContain('per-bag rate');
  });

  it('revalidates at execution: post-assessment delivery shrinks the moved total', async () => {
    const { target, source } = await seedPair();
    await deliveryService.createDelivery(facilityId, { grnId: source, smallBags: 20, bigBags: 0 }, 'usr-mov-bagcat');
    const res = await postMerge({
      targetGrnId: target, sourceGrnIds: [source], movementDate: new Date(),
      remarks: 'Merge after partial delivery', sourceBagCategory: 'Small',
    });
    expect(res.status).toBe(200);
    expect(res.body.movement.totalBagsMoved).toBe(30);
    expect(res.body.targetGrn.bags).toBe(130);
  });

  it('revalidates at execution: fully delivered source cannot merge', async () => {
    const { target, source } = await seedPair();
    await deliveryService.createDelivery(facilityId, { grnId: source, smallBags: 50, bigBags: 0 }, 'usr-mov-bagcat');
    const res = await postMerge({
      targetGrnId: target, sourceGrnIds: [source], movementDate: new Date(),
      remarks: 'Merge after full delivery', sourceBagCategory: 'Small',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('zero remaining bags');
    const persistedTarget = await GrnModel.findOne({ id: target }).lean().exec();
    expect(persistedTarget?.bags).toBe(100);
  });
});
