import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getGrnMovementHistory } from '../modules/common/grn-movement-history.js';
import { deliveryService } from '../modules/delivery/delivery.service.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

const userId = 'usr-operator-1';

describe('GRN Movement History SSOT tests', () => {
  let facilityId: string;
  let customerId: string;
  let grnId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    facilityId = await seedFacility({ name: 'Movement Test Facility' });
    customerId = await seedCustomer({ facilityId, name: 'Sardar Patel Agro' });
    grnId = await seedGrn({
      facilityId,
      customerId,
      chamber: 'CH-03',
      bags: 100,
      smallBags: 100, bigBags: 0,
      commodityName: 'Potatoes',
      grnNumber: 'GRN-25-26-0099',
      marks: 'GRADE-A',
      gpNumber: 'GP-777',
      vehicleNumber: 'PB08AZ1234',
    });
  });

  it('reconstructs initial INWARD entry before any outward deliveries', async () => {
    const history = await getGrnMovementHistory(facilityId, grnId);
    expect(history).not.toBeNull();
    expect(history!.totalInwardBags).toBe(100);
    expect(history!.netDeliveredBags).toBe(0);
    expect(history!.currentClosingBags).toBe(100);
    expect(history!.status).toBe('OPEN');
    expect(history!.entries).toHaveLength(1);

    const inward = history!.entries[0];
    expect(inward.type).toBe('INWARD');
    expect(inward.openingBags).toBe(0);
    expect(inward.deliveredBags).toBe(0);
    expect(inward.closingBags).toBe(100);
    expect(inward.marks).toBe('GRADE-A');
    expect(inward.gpNumber).toBe('GP-777');
    expect(inward.vehicleNumber).toBe('PB08AZ1234');
  });

  it('reconstructs exact chronological timeline for partial and final outward movements', async () => {
    const now = Date.now();
    const t1 = new Date(now - 2 * 24 * 60 * 60 * 1000);
    const t2 = new Date(now - 1 * 24 * 60 * 60 * 1000);

    // Partial delivery: 40 bags
    const del1 = await deliveryService.createDelivery(
      facilityId,
      {
        grnId,
        date: t1,
        smallBags: 40, bigBags: 0,
        vehicleNumber: 'DL01AB9999',
        driverName: 'Manpreet Singh',
        remarks: 'First partial withdrawal',
      },
      userId,
    );

    // Final delivery: 60 bags
    const del2 = await deliveryService.createDelivery(
      facilityId,
      {
        grnId,
        date: t2,
        smallBags: 60, bigBags: 0,
        vehicleNumber: 'DL01AB8888',
        driverName: 'Gurdeep Singh',
        remarks: 'Final settlement withdrawal',
      },
      userId,
    );

    const history = await getGrnMovementHistory(facilityId, grnId);
    expect(history).not.toBeNull();
    expect(history!.totalInwardBags).toBe(100);
    expect(history!.netDeliveredBags).toBe(100);
    expect(history!.currentClosingBags).toBe(0);
    expect(history!.status).toBe('CLOSED');
    expect(history!.entries).toHaveLength(3);

    // Entry 1: INWARD
    const e1 = history!.entries[0];
    expect(e1.type).toBe('INWARD');
    expect(e1.openingBags).toBe(0);
    expect(e1.deliveredBags).toBe(0);
    expect(e1.closingBags).toBe(100);

    // Entry 2: PARTIAL_OUTWARD
    const e2 = history!.entries[1];
    expect(e2.type).toBe('PARTIAL_OUTWARD');
    expect(e2.openingBags).toBe(100);
    expect(e2.deliveredBags).toBe(40);
    expect(e2.closingBags).toBe(60);
    expect(e2.challanNumber).toBe(del1.delivery.challanNumber);
    expect(e2.deliveryId).toBe(del1.delivery.id);
    expect(e2.remarks).toBe('First partial withdrawal');

    // Entry 3: FINAL_OUTWARD
    const e3 = history!.entries[2];
    expect(e3.type).toBe('FINAL_OUTWARD');
    expect(e3.openingBags).toBe(60);
    expect(e3.deliveredBags).toBe(60);
    expect(e3.closingBags).toBe(0);
    expect(e3.challanNumber).toBe(del2.delivery.challanNumber);
    expect(e3.deliveryId).toBe(del2.delivery.id);
    expect(e3.remarks).toBe('Final settlement withdrawal');
  });

  it('correctly audits delivery reversal with timeline balance restoration', async () => {
    const del = await deliveryService.createDelivery(
      facilityId,
      { grnId, smallBags: 100, bigBags: 0, remarks: 'Full delivery' },
      userId,
    );
    expect(del.summary.grnStatus).toBe('CLOSED');

    await deliveryService.reverseDelivery(
      facilityId,
      del.delivery.id,
      { reason: 'Customer vehicle broke down outside gate' },
      userId,
    );

    const history = await getGrnMovementHistory(facilityId, grnId);
    expect(history).not.toBeNull();
    expect(history!.status).toBe('OPEN');
    expect(history!.netDeliveredBags).toBe(0);
    expect(history!.currentClosingBags).toBe(100);
    expect(history!.entries).toHaveLength(3);

    const [inward, outward, reversal] = history!.entries;
    expect(inward.type).toBe('INWARD');
    expect(inward.closingBags).toBe(100);

    // A reversed challan emptied the balance but was not a settlement, so it must not be
    // labelled the final outward movement.
    expect(outward.type).toBe('PARTIAL_OUTWARD');
    expect(outward.openingBags).toBe(100);
    expect(outward.deliveredBags).toBe(100);
    expect(outward.closingBags).toBe(0);

    expect(reversal.type).toBe('DELIVERY_REVERSAL');
    expect(reversal.openingBags).toBe(0);
    expect(reversal.deliveredBags).toBe(100);
    expect(reversal.closingBags).toBe(100);
    expect(reversal.remarks).toBe('Customer vehicle broke down outside gate');
  });
});
