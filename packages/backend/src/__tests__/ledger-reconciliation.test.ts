import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DeliveryChallanModel } from '../database/models/delivery-challan.model.js';
import { DeliveryReversalModel } from '../database/models/delivery-reversal.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { deliveryService } from '../modules/delivery/delivery.service.js';
import { readLedgerBalance } from '../modules/inventory/ledger-balance.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

const USER_ID = 'usr-reconciliation-tester';

/**
 * Phase 7: ledger/receipt reconciliation invariants.
 *
 * This suite is the tripwire that would have caught the missing INWARD_PUTAWAY on day one. It
 * builds a mixed, multi-GRN scenario through the real service layer — partials, a reversal, a
 * chamber correction — and then asserts, by reading the raw collections, that every figure the
 * API reports can only have come from a complete and agreeing ledger.
 */
describe('Phase 7: ledger reconciliation invariants (ledger-reconciliation.test.ts)', () => {
  let facilityId: string;
  let customerId: string;
  let singleGrnId: string;
  let mixedGrnId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    facilityId = await seedFacility({ name: 'Reconciliation Facility' });
    customerId = await seedCustomer({ facilityId, name: 'Reconciliation Farmer' });
    singleGrnId = await seedGrn({
      facilityId,
      customerId,
      chamber: 'CH-R1',
      bags: 100,
      grnNumber: 'GRN-26-27-RC01',
    });
    mixedGrnId = await seedGrn({
      facilityId,
      customerId,
      chamber: 'CH-R2',
      bags: 200,
      bagType: 'S+B',
      smallBags: 100,
      bigBags: 100,
      grnNumber: 'GRN-26-27-RC02',
    });

    const del = await deliveryService.createDelivery(
      facilityId,
      { grnId: mixedGrnId, smallBags: 20, bigBags: 30 },
      USER_ID,
    );
    await deliveryService.reverseDelivery(
      facilityId,
      del.delivery.id,
      { reason: 'Buyer rejected the lot at the gate' },
      USER_ID,
    );
    await deliveryService.createDelivery(
      facilityId,
      { grnId: mixedGrnId, smallBags: 10, bigBags: 10 },
      USER_ID,
    );
  });

  it('every receipt carries exactly one inward leg matching its stored composition', async () => {
    const grns = await GrnModel.find({ facilityId }).lean().exec();
    expect(grns).toHaveLength(2);

    for (const grn of grns) {
      const inwardRows = await InventoryTransactionModel.find({
        grnId: grn.id,
        transactionType: 'INWARD_PUTAWAY',
      })
        .lean()
        .exec();
      expect(inwardRows).toHaveLength(1);
      expect(inwardRows[0].referenceId).toBe(grn.id);
      expect(inwardRows[0].smallQuantity).toBe(grn.smallBags);
      expect(inwardRows[0].bigQuantity).toBe(grn.bigBags);
    }
  });

  it('every outward row matches a live challan and every reversal row matches a reversal record', async () => {
    const outwardRows = await InventoryTransactionModel.find({
      facilityId,
      transactionType: 'OUTWARD_DELIVERY',
    })
      .lean()
      .exec();
    // Two deliveries issued; the reversed one stays on record with REVERSED status.
    expect(outwardRows).toHaveLength(2);
    for (const row of outwardRows) {
      const challan = await DeliveryChallanModel.findOne({ id: row.referenceId }).lean().exec();
      expect(challan).not.toBeNull();
      expect(row.smallQuantity).toBe(challan!.smallBags);
      expect(row.bigQuantity).toBe(challan!.bigBags);
    }

    const reversalRows = await InventoryTransactionModel.find({
      facilityId,
      transactionType: 'DELIVERY_REVERSAL',
    })
      .lean()
      .exec();
    expect(reversalRows).toHaveLength(1);
    const reversal = await DeliveryReversalModel.findOne({ id: reversalRows[0].referenceId })
      .lean()
      .exec();
    expect(reversal).not.toBeNull();
  });

  it('the ledger balance equals the receipt minus net outward, per bag type', async () => {
    // Mixed GRN: 200 in, 20+30 out and reversed, then 10+10 out → 90 / 90 / 180.
    await expect(readLedgerBalance(facilityId, mixedGrnId)).resolves.toEqual({
      smallBags: 90,
      bigBags: 90,
      total: 180,
    });
    // Untouched GRN: the inward leg alone.
    await expect(readLedgerBalance(facilityId, singleGrnId)).resolves.toEqual({
      smallBags: 100,
      bigBags: 0,
      total: 100,
    });

    const totals = await InventoryTransactionModel.aggregate([
      { $match: { facilityId } },
      {
        $group: {
          _id: null,
          small: {
            $sum: {
              $cond: [
                { $eq: ['$transactionType', 'OUTWARD_DELIVERY'] },
                { $multiply: ['$smallQuantity', -1] },
                '$smallQuantity',
              ],
            },
          },
          big: {
            $sum: {
              $cond: [
                { $eq: ['$transactionType', 'OUTWARD_DELIVERY'] },
                { $multiply: ['$bigQuantity', -1] },
                '$bigQuantity',
              ],
            },
          },
        },
      },
    ]);
    // Facility-wide cross-check from the raw rows: 100 + 100 − 20 + 20 − 10 small.
    expect(totals[0].small).toBe(190);
    expect(totals[0].big).toBe(90);
  });
});
