import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { InternalMovementModel } from '../database/models/internal-movement.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { grnService } from '../modules/grn/grn.service.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

const app = createApp();
const seedAuth = createAuthSeeder(config.jwtSecret);
const facilityId = 'fac-sorting-repack';

describe('GRN Sorting and Repacking Workflow (Phase 1)', () => {
  let adminToken: string;
  let customerId: string;
  let commodityId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
    ({ token: adminToken } = await seedAuth({
      userId: 'usr-sort-admin',
      username: 'sort.admin',
      role: 'ADMIN',
      facilityIds: [facilityId],
    }));
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await mongoose.connection.collection('rentpayments').deleteMany({});
    await mongoose.connection.collection('internalmovements').deleteMany({});
    await seedFacility({ id: facilityId, code: 'SRT', name: 'Sorting Facility' });
    customerId = await seedCustomer({ id: 'cust-srt-1', facilityId, name: 'Farmer Gopal' });
    const cmd = await CommodityModel.create({
      id: 'cmd-potato', name: 'Potato', normalizedName: 'potato', isActive: true, isHamaliApplicable: true, hamaliRate: 4,
    });
    commodityId = cmd.id;
  });

  it('rejects repacking if GRN has not completed sorting confirmation', async () => {
    const grnId = await seedGrn({
      facilityId,
      customerId,
      customerName: 'Farmer Gopal',
      commodityId,
      commodityName: 'Potato',
      chamber: 'CH-01',
      bags: 100,
      bagType: 'S/B',
      rentType: 'Seasonal',
      rentAmount: 5000,
      grnNumber: 'GRN-26-27-0101',
    });

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/repack`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        grnId,
        resultingBagType: 'S/B',
        repackedSmallBags: 60,
        repackedBigBags: 40,
        remarks: 'Attempt repacking before sorting',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('PRECONDITION_FAILED');
  });

  it('sorting fails if confirmed details do not match existing GRN', async () => {
    const grnId = await seedGrn({
      facilityId,
      customerId,
      customerName: 'Farmer Gopal',
      commodityId,
      commodityName: 'Potato',
      chamber: 'CH-01',
      bags: 100,
      bagType: 'S/B',
      rentType: 'Seasonal',
      rentAmount: 5000,
      grnNumber: 'GRN-26-27-0102',
    });

    // Mismatched bags count
    const resCount = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/sort`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        grnId,
        confirmedBagType: 'S/B',
        confirmedBags: 80, // Actual is 100
      });

    expect(resCount.status).toBe(400);
    expect(resCount.body.error).toContain('CONFIRMATION_MISMATCH');

    // Mismatched bag type
    const resType = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/sort`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        grnId,
        confirmedBagType: 'S', // Actual is S/B
        confirmedBags: 100,
      });

    expect(resType.status).toBe(400);
    expect(resType.body.error).toContain('CONFIRMATION_MISMATCH');
  });

  it('sorting generates rent bill, verifies lot, and preserves bag composition', async () => {
    const grnId = await seedGrn({
      facilityId,
      customerId,
      customerName: 'Farmer Gopal',
      commodityId,
      commodityName: 'Potato',
      chamber: 'CH-01',
      bags: 100,
      bagType: 'S/B',
      rentType: 'Seasonal',
      rentAmount: 5000,
      grnNumber: 'GRN-26-27-0103',
    });

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/sort`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        grnId,
        confirmedBagType: 'S/B',
        confirmedBags: 100,
        totalBagsWeight: 5000,
        paymentMode: 'Cash',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.isSortingComplete).toBe(true);
    expect(res.body.billedAmount).toBe(5400);
    expect(res.body.receiptNumber).toMatch(/^RRCPT-\d{2}-\d{2}-\d{4}$/);

    const updated = await GrnModel.findOne({ id: grnId }).lean().exec();
    expect(updated?.isSorted).toBe(true);
    expect(updated?.totalBagsWeight).toBe(5000);
    // Composition and bags remain untouched
    expect(updated?.bags).toBe(100);
    expect(updated?.bagType).toBe('S/B');
  });

  it('completes full workflow: sorting confirms and bills, then repacking converts bags and applies hamali', async () => {
    const grnId = await seedGrn({
      facilityId,
      customerId,
      customerName: 'Farmer Gopal',
      commodityId,
      commodityName: 'Potato',
      chamber: 'CH-01',
      bags: 100,
      bagType: 'S/B',
      rentType: 'Seasonal',
      rentAmount: 3000,
      grnNumber: 'GRN-26-27-0104',
    });

    // Step 1: Sorting
    const sortRes = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/sort`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        grnId,
        confirmedBagType: 'S/B',
        confirmedBags: 100,
        totalBagsWeight: 5200,
      });

    expect(sortRes.status).toBe(200);
    expect(sortRes.body.success).toBe(true);
    expect(sortRes.body.billedAmount).toBe(3400);

    // Step 2: Repacking into S/B with variance (60 small + 35 big = 95 bags, -5 variance)
    const repackRes = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/repack`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        grnId,
        resultingBagType: 'S/B',
        repackedSmallBags: 60,
        repackedBigBags: 35,
        repackVarianceReason: 'Damaged or culled produce removed during sorting/rebagging',
        referenceWeight: 4950,
        remarks: 'Sorted and repacked for cold room storage',
      });

    expect(repackRes.status).toBe(200);
    expect(repackRes.body.success).toBe(true);
    expect(repackRes.body.repackVariance).toBe(-5);
    // Hamali: 95 repacked bags * 4 = 380
    expect(repackRes.body.hamaliCharge).toBe(380);

    // Verify GRN document state
    const grn = await GrnModel.findOne({ id: grnId }).lean().exec();
    expect(grn?.bagType).toBe('S/B');
    expect(grn?.bags).toBe(95);
    expect(grn?.smallBags).toBe(60);
    expect(grn?.bigBags).toBe(35);
    expect(grn?.totalBagsWeight).toBe(4950);

    // Verify Internal Movement history record
    const movement = await InternalMovementModel.findOne({ targetGrnId: grnId, movementType: 'REPACK' }).lean().exec();
    expect(movement).toBeDefined();
    expect(movement?.movementType).toBe('REPACK');
    expect(movement?.repackVariance).toBe(-5);
    expect(movement?.hamaliCharge).toBe(380);
    expect(movement?.repackSourceBags).toBe(100);

    // Verify inventory transactions (outward old, inward new)
    const txs = await InventoryTransactionModel.find({ grnId }).lean().exec();
    const outTx = txs.find((t) => t.transactionType === 'OUTWARD_DELIVERY');
    const inTx = txs.find((t) => t.transactionType === 'INWARD_PUTAWAY' && t.referenceId === movement?.id);
    expect(outTx).toBeDefined();
    expect(inTx).toBeDefined();
    expect((outTx?.smallQuantity ?? 0) + (outTx?.bigQuantity ?? 0)).toBe(100);
    expect((inTx?.smallQuantity ?? 0) + (inTx?.bigQuantity ?? 0)).toBe(95);
    expect(inTx?.bagType).toBe('S/B');

    // Verify entity closing bags and net delivered are truthful and not polluted
    const entity = await grnService.getGrnById(grnId);
    expect(entity?.bags).toBe(95);
    expect(entity?.closingBags).toBe(95);
    expect(entity?.netDeliveredBags).toBe(0);
  });
});
