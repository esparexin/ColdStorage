import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CommodityRateModel } from '../database/models/commodity-rate.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { grnService } from '../modules/grn/grn.service.js';
import { deliveryService } from '../modules/delivery/delivery.service.js';
import { internalMovementService } from '../modules/internal-movement/internal-movement.service.js';
import { seedCustomer, seedFacility } from './helpers/master-data-fixtures.js';
import { connectToTestDatabase, disconnectTestDatabase, resetStockCollections } from './helpers/stock-reset.js';

const USER_ID = 'usr-bag-lifecycle';
const FACILITY_ID = 'fac-bag-lifecycle';

describe('Bag lifecycle: total-only inward, verified outward, guarded movement/transfer', () => {
  let customerA: string;
  let customerB: string;
  let commodityId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await CommodityRateModel.deleteMany({});
    await seedFacility({ id: FACILITY_ID, code: 'BGLC', name: 'Bag Lifecycle Facility' });
    customerA = await seedCustomer({ id: 'cust-bglc-a', facilityId: FACILITY_ID, name: 'Lifecycle Farmer' });
    customerB = await seedCustomer({ id: 'cust-bglc-b', facilityId: FACILITY_ID, name: 'Lifecycle Trader' });
    const cmd = await CommodityModel.create({
      id: 'cmd-bglc-potato',
      name: 'Potato Lifecycle',
      normalizedName: 'potato lifecycle',
      isActive: true,
    });
    commodityId = cmd.id;
    await CommodityRateModel.create({
      id: 'crt-bglc-seasonal',
      commodityId,
      rentType: 'Seasonal',
      smallRate: 12,
      bigRate: 18,
      isActive: true,
    });
  });

  it('inward total-only S/B with differential rates is pending (rent 0, unverified)', async () => {
    const { grn } = await grnService.createGrn(
      FACILITY_ID,
      {
        grnNumber: '1001', date: new Date(), customerId: customerA, commodityId,
        chamber: 'CH-01', bags: 100, bagType: 'S/B', rentType: 'Seasonal',
        smallBagPrice: 12, bigBagPrice: 18,
      } as never,
      USER_ID,
    );
    expect(grn.rentAmount).toBe(0);
    expect(grn.isCompositionVerified).toBe(false);
    expect(grn.smallBags + grn.bigBags).toBe(100);
    const stored = await GrnModel.findOne({ id: grn.id }).lean().exec();
    expect((stored as Record<string, unknown>).isCompositionVerified).toBe(false);
  });

  it('inward explicit S/B split defers rent (0) and marks verified', async () => {
    const { grn } = await grnService.createGrn(
      FACILITY_ID,
      {
        grnNumber: '1002', date: new Date(), customerId: customerA, commodityId,
        chamber: 'CH-01', bags: 100, bagType: 'S/B', smallBags: 60, bigBags: 40,
        rentType: 'Seasonal', smallBagPrice: 12, bigBagPrice: 18,
      } as never,
      USER_ID,
    );
    expect(grn.rentAmount).toBe(0);
    expect(grn.isCompositionVerified).toBe(true);
  });

  it('outward S/B with differential rates requires confirmed composition', async () => {
    const { grn } = await grnService.createGrn(
      FACILITY_ID,
      {
        grnNumber: '1003', date: new Date(), customerId: customerA, commodityId,
        chamber: 'CH-01', bags: 100, bagType: 'S/B', smallBags: 60, bigBags: 40,
        rentType: 'Seasonal', smallBagPrice: 12, bigBagPrice: 18,
      } as never,
      USER_ID,
    );
    await expect(
      deliveryService.createDelivery(FACILITY_ID, { grnId: grn.id, quantity: 50 } as never, USER_ID),
    ).rejects.toThrow('Small and big bag composition required');
    const del = await deliveryService.createDelivery(
      FACILITY_ID,
      { grnId: grn.id, smallBags: 30, bigBags: 20 } as never,
      USER_ID,
    );
    expect(del.delivery.totalBags).toBe(50);
  });

  it('merge of unverified uniform lots requires explicit repacked confirmation', async () => {
    await CommodityRateModel.updateOne(
      { commodityId, rentType: 'Seasonal' },
      { $set: { smallRate: 15, bigRate: 15 } },
    );
    const base: Record<string, unknown> = {
      date: new Date(), customerId: customerA, commodityId, chamber: 'CH-01',
      bagType: 'S/B', rentType: 'Seasonal', smallBagPrice: 15, bigBagPrice: 15,
    };
    const target = await grnService.createGrn(FACILITY_ID, { ...base, grnNumber: '2001', bags: 100 } as never, USER_ID);
    const source = await grnService.createGrn(FACILITY_ID, { ...base, grnNumber: '2002', bags: 50 } as never, USER_ID);
    expect(target.grn.isCompositionVerified).toBe(false);
    await expect(
      internalMovementService.mergeGrn(
        FACILITY_ID,
        { targetGrnId: target.grn.id, sourceGrnIds: [source.grn.id], movementDate: new Date(), remarks: 'Merge unverified without confirmation' } as never,
        USER_ID,
      ),
    ).rejects.toThrow('Confirmed small and big bag counts are required');
    const merged = await internalMovementService.mergeGrn(
      FACILITY_ID,
      {
        targetGrnId: target.grn.id, sourceGrnIds: [source.grn.id], movementDate: new Date(),
        remarks: 'Merge unverified with confirmation', repackedSmallBags: 30, repackedBigBags: 20,
      } as never,
      USER_ID,
    );
    expect(merged.targetGrn.bags).toBe(150);
    expect(merged.targetGrn.isCompositionVerified).toBe(true);
  });

  it('transfer of unverified GRN requires explicit composition confirmation', async () => {
    const { grn } = await grnService.createGrn(
      FACILITY_ID,
      {
        grnNumber: '3001', date: new Date(), customerId: customerA, commodityId,
        chamber: 'CH-01', bags: 100, bagType: 'S/B', rentType: 'Seasonal',
        smallBagPrice: 12, bigBagPrice: 18,
      } as never,
      USER_ID,
    );
    await expect(
      internalMovementService.transferOwnership(
        FACILITY_ID,
        { grnId: grn.id, newCustomerId: customerB, movementDate: new Date(), remarks: 'Transfer without confirmation' } as never,
        USER_ID,
      ),
    ).rejects.toThrow('Confirmed bag composition is required');
    await expect(
      internalMovementService.transferOwnership(
        FACILITY_ID,
        {
          grnId: grn.id, newCustomerId: customerB, movementDate: new Date(),
          remarks: 'Transfer with mismatched confirmation', confirmedSmallBags: 50, confirmedBigBags: 40,
        } as never,
        USER_ID,
      ),
    ).rejects.toThrow('must reconcile with available stock');
    const transferred = await internalMovementService.transferOwnership(
      FACILITY_ID,
      {
        grnId: grn.id, newCustomerId: customerB, movementDate: new Date(),
        remarks: 'Transfer with valid confirmation', confirmedSmallBags: 60, confirmedBigBags: 40,
        paymentDecision: 'SETTLE_NOW', settlementDetails: { amountPaid: 1200, paymentMode: 'Cash' },
      } as never,
      USER_ID,
    );
    expect(transferred.grn.customerId).toBe(customerB);
  });
});
