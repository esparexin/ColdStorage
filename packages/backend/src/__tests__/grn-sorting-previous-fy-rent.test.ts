import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { InternalMovementModel } from '../database/models/internal-movement.model.js';
import { rentService } from '../modules/rent/rent.service.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

const app = createApp();
const seedAuth = createAuthSeeder(config.jwtSecret);
const facilityId = 'fac-sort-prev-fy';

describe('GRN Sorting & Repacking — Previous FY Rent Treatment', () => {
  let adminToken: string;
  let customerId: string;
  let commodityId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
    ({ token: adminToken } = await seedAuth({
      userId: 'usr-prev-fy-admin',
      username: 'prev.fy.admin',
      role: 'ADMIN',
      facilityIds: [facilityId],
    }));
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await mongoose.connection.collection('rentpayments').deleteMany({});
    await mongoose.connection.collection('internalmovements').deleteMany({});
    await seedFacility({ id: facilityId, code: 'PFY', name: 'Previous FY Facility' });
    customerId = await seedCustomer({ id: 'cust-pfy-1', facilityId, name: 'Farmer Gopal' });
    const cmd = await CommodityModel.create({
      id: 'cmd-potato-pfy',
      name: 'Potato',
      normalizedName: 'potato',
      isActive: true,
      isHamaliApplicable: true,
      hamaliRate: 4,
    });
    commodityId = cmd.id;
  });

  it('preserves historical rent as pending when GRN belongs to previous financial year and records truthful snapshot on repack', async () => {
    // GRN from previous financial year (2025-05-15 in FY 25-26) with unpaid rent
    const prevYearDate = new Date('2025-05-15T10:00:00.000Z');
    const grnId = await seedGrn({
      facilityId, customerId, customerName: 'Farmer Gopal', commodityId,
      commodityName: 'Potato', chamber: 'CH-01', bags: 100, bagType: 'S/B',
      rentType: 'Seasonal', rentAmount: 4500, grnNumber: 'GRN-25-26-0045',
      date: prevYearDate, inwardReceiptNumber: 'RCPT-25-26-0045',
    });

    // 1. Sorting Step: confirm lot details
    const sortRes = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/sort`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        grnId,
        confirmedBagType: 'S/B',
        confirmedBags: 100,
        totalBagsWeight: 5000,
        paymentMode: 'Cash',
      });

    expect(sortRes.status).toBe(200);
    expect(sortRes.body.success).toBe(true);
    expect(sortRes.body.isSortingComplete).toBe(true);
    // Billed amount must be 0: previous FY rent is NOT auto-paid or settled into current FY!
    expect(sortRes.body.billedAmount).toBe(0);
    expect(sortRes.body.receiptNumber).toBeUndefined();

    // Verify historical rent remains untouched and unpaid
    const rentSummary = await rentService.getRentSummary(facilityId, grnId);
    expect(rentSummary.rentAmount).toBe(4500);
    expect(rentSummary.totalPaid).toBe(0);
    expect(rentSummary.remainingBalance).toBe(4900); // 4500 base + 400 inward hamali (100 * 4)
    expect(rentSummary.paymentStatus).toBe('Not Settled');

    // 2. Repacking Step: repack into 90 bags (50 small + 40 big)
    const repackRes = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/repack`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        grnId,
        resultingBagType: 'S/B',
        repackedSmallBags: 50,
        repackedBigBags: 40,
        repackVarianceReason: 'Culling damaged produce during rebagging',
        referenceWeight: 4500,
        remarks: 'Repacked previous-season stock',
      });

    expect(repackRes.status).toBe(200);
    expect(repackRes.body.success).toBe(true);
    expect(repackRes.body.repackVariance).toBe(-10);
    // New Hamali charges calculated for current FY repacking activity: 90 repacked bags * 4 = 360
    expect(repackRes.body.hamaliCharge).toBe(360);

    // Verify movement financialSnapshot captures truthful pending balance and does not fabricate 'SETTLED'
    const movement = await InternalMovementModel.findOne({ targetGrnId: grnId, movementType: 'REPACK' }).lean().exec();
    expect(movement?.financialSnapshot.remainingBalance).toBe(4900);
    expect(movement?.financialSnapshot.totalPaid).toBe(0);
    expect(movement?.financialSnapshot.paymentStatus).toBe('Not Settled');
    expect(movement?.financialSnapshot.hamaliAmount).toBe(360);
  });
});
