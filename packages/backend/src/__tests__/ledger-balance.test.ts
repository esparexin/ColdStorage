import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CommodityModel } from '../database/models/commodity.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { deliveryService } from '../modules/delivery/delivery.service.js';
import { rentService } from '../modules/rent/rent.service.js';
import { grnService } from '../modules/grn/grn.service.js';
import {
  readLedgerBalance,
  readLedgerGrouped,
  readLedgerInward,
  readLedgerNetDelivered,
} from '../modules/inventory/ledger-balance.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

const USER_ID = 'usr-ledger-tester';

/**
 * Phase 2: the ledger is self-sufficient. Every inward receipt carries its own INWARD_PUTAWAY
 * row, so a balance summed from the ledger alone equals the receipt minus outward movement —
 * with the small/big split intact at every step.
 */
describe('Phase 2: ledger authority (ledger-balance.test.ts)', () => {
  let facilityId: string;
  let customerId: string;
  let commodityId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    facilityId = await seedFacility({ name: 'Ledger Authority Facility' });
    customerId = await seedCustomer({ facilityId, name: 'Ledger Farmer' });
    const commodity = await CommodityModel.create({
      id: `cmd-ledger-${Date.now()}`,
      name: 'Ledger Potato',
      normalizedName: `ledger potato ${Date.now()}`,
      isActive: true,
    });
    commodityId = commodity.id;
  });

  it('createGrn writes exactly one INWARD_PUTAWAY row carrying the composition', async () => {
    const inwardDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const { grn } = await grnService.createGrn(
      facilityId,
      {
        grnNumber: '0501',
        customerId,
        commodityId,
        chamber: 'CH-L1',
        bags: 200,
        bagType: 'S+B',
        smallBags: 100,
        bigBags: 100,
        smallBagWeight: 50,
        bigBagWeight: 80,
        rentType: 'Monthly',
        rentMonths: 2,
        date: inwardDate,
      },
      USER_ID,
    );

    const rows = await InventoryTransactionModel.find({ grnId: grn.id }).lean().exec();
    expect(rows).toHaveLength(1);

    const row = rows[0];
    expect(row.transactionType).toBe('INWARD_PUTAWAY');
    expect(row.referenceType).toBe('PUT_AWAY');
    expect(row.referenceId).toBe(grn.id);
    expect(row.smallQuantity).toBe(100);
    expect(row.bigQuantity).toBe(100);
    // The movement happened at inward: the ledger timeline and the monthly inward report must
    // agree with the receipt date, not with when the row was persisted.
    expect(row.createdAt.getTime()).toBe(inwardDate.getTime());
  });

  it('a mixed receipt balances per bag type through delivery and full reversal', async () => {
    const grnId = await seedGrn({
      facilityId,
      customerId,
      chamber: 'CH-L1',
      bags: 200,
      bagType: 'S+B',
      smallBags: 100,
      bigBags: 100,
      grnNumber: 'GRN-26-27-LB01',
    });

    await expect(readLedgerBalance(facilityId, grnId)).resolves.toEqual({
      smallBags: 100,
      bigBags: 100,
      total: 200,
    });
    await expect(readLedgerInward(facilityId, grnId)).resolves.toEqual({
      smallBags: 100,
      bigBags: 100,
      total: 200,
    });

    const del = await deliveryService.createDelivery(
      facilityId,
      { grnId, smallBags: 20, bigBags: 30 },
      USER_ID,
    );

    await expect(readLedgerBalance(facilityId, grnId)).resolves.toEqual({
      smallBags: 80,
      bigBags: 70,
      total: 150,
    });
    await expect(readLedgerNetDelivered(facilityId, grnId)).resolves.toEqual({
      smallBags: 20,
      bigBags: 30,
      total: 50,
    });

    await deliveryService.reverseDelivery(
      facilityId,
      del.delivery.id,
      { reason: 'Whole lot returned by the buyer' },
      USER_ID,
    );

    await expect(readLedgerBalance(facilityId, grnId)).resolves.toEqual({
      smallBags: 100,
      bigBags: 100,
      total: 200,
    });
    await expect(readLedgerNetDelivered(facilityId, grnId)).resolves.toEqual({
      smallBags: 0,
      bigBags: 0,
      total: 0,
    });
  });

  it('the per-type guard rejects a withdrawal the combined total would allow', async () => {
    const grnId = await seedGrn({
      facilityId,
      customerId,
      chamber: 'CH-L1',
      bags: 200,
      bagType: 'S+B',
      smallBags: 100,
      bigBags: 100,
      grnNumber: 'GRN-26-27-LB02',
    });

    // 150 big bags against 100 big available, even though 200 total bags are in store.
    await expect(
      deliveryService.createDelivery(facilityId, { grnId, smallBags: 10, bigBags: 150 }, USER_ID),
    ).rejects.toThrow(/10 small and 150 big bags exceeds the available balance of 100 small and 100 big bags/);

    expect(await InventoryTransactionModel.countDocuments({ transactionType: 'OUTWARD_DELIVERY' })).toBe(0);
  });

  it('rolls stock up by chamber and commodity across GRNs in one facility', async () => {
    await seedGrn({
      facilityId,
      customerId,
      chamber: 'CH-A',
      bags: 100,
      grnNumber: 'GRN-26-27-LB03',
    });
    await seedGrn({
      facilityId,
      customerId,
      chamber: 'CH-B',
      bags: 200,
      bagType: 'S+B',
      smallBags: 50,
      bigBags: 150,
      grnNumber: 'GRN-26-27-LB04',
    });

    const byChamber = await readLedgerGrouped(facilityId, 'chamber');
    expect(new Map(byChamber.map((r) => [r.key, r.total]))).toEqual(
      new Map([
        ['CH-A', 100],
        ['CH-B', 200],
      ]),
    );
    expect(byChamber.find((r) => r.key === 'CH-B')).toEqual({
      key: 'CH-B',
      smallBags: 50,
      bigBags: 150,
      total: 200,
    });
  });

  it('outward movement never mutates the rent obligation', async () => {
    const grnId = await seedGrn({
      facilityId,
      customerId,
      chamber: 'CH-L1',
      bags: 200,
      bagType: 'S+B',
      smallBags: 100,
      bigBags: 100,
      rentAmount: 26000,
      grnNumber: 'GRN-26-27-LB05',
    });

    // The rent gate requires a first payment before any outward movement; settling in full keeps
    // the obligation itself the only figure under test.
    await rentService.recordPayment(
      facilityId,
      { grnId, amountPaid: 26000, paymentMode: 'Cash', paymentDate: new Date() },
      USER_ID,
    );

    const del = await deliveryService.createDelivery(
      facilityId,
      { grnId, smallBags: 20, bigBags: 30 },
      USER_ID,
    );
    await deliveryService.reverseDelivery(
      facilityId,
      del.delivery.id,
      { reason: 'Buyer rejected the lot at the gate' },
      USER_ID,
    );

    const grn = await GrnModel.findOne({ id: grnId }).lean().exec();
    expect(grn?.rentAmount).toBe(26000);
  });
});
