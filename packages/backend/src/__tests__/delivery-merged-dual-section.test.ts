import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CommodityRateModel } from '../database/models/commodity-rate.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { deliveryService } from '../modules/delivery/delivery.service.js';
import { readLedgerBalance } from '../modules/inventory/ledger-balance.js';
import { resolveMergedStockPools } from '../modules/delivery/handlers/dual-section-validation.helper.js';
import { seedCustomer, seedFacility } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

const USER_ID = 'usr-dual-section';

describe('Delivery Merged Dual-Section Outward Dispatches', () => {
  let facilityId: string;
  let customerId: string;
  const commodityId = 'cmd-mirchi';

  beforeAll(async () => {
    await connectToTestDatabase();
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await CommodityRateModel.deleteMany({});
    facilityId = await seedFacility({ name: 'Cold Storage Main' });
    customerId = await seedCustomer({ facilityId, name: 'Balaji' });

    await CommodityModel.create({
      id: commodityId,
      name: 'Mirchi',
      normalizedName: 'mirchi',
      isActive: true,
      defaultBagType: 'S/B',
    });

    await CommodityRateModel.create([
      {
        id: 'rate-seasonal-mirchi',
        commodityId,
        rentType: 'Seasonal',
        smallRate: 110,
        bigRate: 110,
        isActive: true,
      },
      {
        id: 'rate-monthly-mirchi',
        commodityId,
        rentType: 'Monthly',
        smallRate: 20,
        bigRate: 20,
        isActive: true,
      },
    ]);
  });

  it('accurately resolves stock pools and handles dual-section outward deliveries for GRN 0013', async () => {
    const grnId = 'grn-0013';
    const inwardDate = new Date('2026-10-21');
    const mergeRemarks =
      '[MERGE RECEIVED on 2026-10-23: +60 bags (Repacked: 30 S + 30 B = 60 bags). Repacking Hamali: ₹1500 (60 bags @ ₹25/bag) from GRN 0010 (Receipt #RCPT-24-25-0010, Date: 2024-06-10, Customer: Kalyan, Bags: 10, Rent: ₹26100, Paid: ₹0, Balance: ₹26350, Status: Not Settled); GRN 0012 (Receipt #RCPT-25-26-0012, Date: 2025-07-16, Customer: Kalyan, Bags: 12, Rent: ₹13050, Paid: ₹0, Balance: ₹13350, Status: Not Settled). Carried pending rent: ₹39700. Reason: Rebagging as per customer request 2024]';

    // Seed GRN 0013 with 14 genesis bags and +60 repacked bags (Total 74)
    await GrnModel.create({
      id: grnId, facilityId, grnNumber: '0013', inwardReceiptNumber: 'RCPT-26-27-0013',
      date: inwardDate, customerId, customerName: 'Balaji', commodityId, commodityName: 'Mirchi',
      chamber: 'A-01,09', bags: 74, bagType: 'S/B', smallBags: 44, bigBags: 30,
      isCompositionVerified: false, rentType: 'Seasonal', rentAmount: 0,
      smallBagPrice: 110, bigBagPrice: 110, status: 'OPEN', remarks: mergeRemarks,
      isBondForLoan: false, loanStatus: 'NOT_TAKEN', createdBy: USER_ID,
    });

    // Inward Put-away 1: Genesis 14 bags
    await InventoryTransactionModel.create({
      id: 'tx-genesis-14', facilityId, grnId, grnNumber: '0013', chamber: 'A-01,09',
      commodityId, bagType: 'S/B', transactionType: 'INWARD_PUTAWAY',
      smallQuantity: 14, bigQuantity: 0, referenceType: 'PUT_AWAY', referenceId: grnId,
      createdBy: USER_ID, createdAt: inwardDate,
    });

    // Inward Put-away 2: Merge 60 repacked bags (30 Small, 30 Big)
    await InventoryTransactionModel.create({
      id: 'tx-repack-60', facilityId, grnId, grnNumber: '0013', chamber: 'A-01,09',
      commodityId, bagType: 'S/B', transactionType: 'INWARD_PUTAWAY',
      smallQuantity: 30, bigQuantity: 30, referenceType: 'PUT_AWAY', referenceId: 'move-merge-0013',
      createdBy: USER_ID, createdAt: new Date('2026-10-23'),
    });

    // Verify initial ledger balance is 74
    const initialLedger = await readLedgerBalance(facilityId, grnId);
    expect(initialLedger.total).toBe(74);

    // Verify initial pool resolution
    const grn = await GrnModel.findOne({ id: grnId }).lean().exec();
    const pools = await resolveMergedStockPools(facilityId, grn!);
    expect(pools).not.toBeNull();
    expect(pools?.initialUnclassified).toBe(14);
    expect(pools?.availableUnclassified).toBe(14);
    expect(pools?.availableConfirmedSmall).toBe(30);
    expect(pools?.availableConfirmedBig).toBe(30);
    expect(pools?.availableConfirmedTotal).toBe(60);

    // 1. Partial Outward Delivery:
    // Dispatch Section A: 10 Small, 4 Big (14 unclassified bags)
    // Dispatch Section B: 15 Small, 15 Big (30 confirmed bags)
    // Total delivery: 25 Small + 19 Big = 44 bags
    const delDate = new Date('2026-10-24');
    const { delivery: d1 } = await deliveryService.createDelivery(
      facilityId,
      {
        grnId, date: delDate, smallBags: 25, bigBags: 19,
        unclassifiedDispatch: { bagType: 'S/B', smallBags: 10, bigBags: 4, seasonalBagPrice: 110 },
        confirmedDispatch: { bagType: 'S/B', smallBags: 15, bigBags: 15, seasonalBagPrice: 110 },
        rentCharge: 4840, gpNumber: 'GP-0004', vehicleNumber: 'UP32AA1111', driverName: 'Ramesh Singh',
      },
      USER_ID,
    );

    expect(d1.totalBags).toBe(44);
    expect(d1.unclassifiedDispatch?.smallBags).toBe(10);
    expect(d1.unclassifiedDispatch?.bigBags).toBe(4);
    expect(d1.confirmedDispatch?.smallBags).toBe(15);
    expect(d1.confirmedDispatch?.bigBags).toBe(15);

    // Verify remaining pools after Delivery 1
    const poolsAfterD1 = await resolveMergedStockPools(facilityId, grn!);
    expect(poolsAfterD1?.availableUnclassified).toBe(0);
    expect(poolsAfterD1?.availableConfirmedSmall).toBe(15);
    expect(poolsAfterD1?.availableConfirmedBig).toBe(15);
    expect(poolsAfterD1?.availableConfirmedTotal).toBe(30);

    const ledgerAfterD1 = await readLedgerBalance(facilityId, grnId);
    expect(ledgerAfterD1.total).toBe(30);

    // 2. Validation check: Attempting to withdraw from Section A when 0 remaining fails
    await expect(
      deliveryService.createDelivery(
        facilityId,
        {
          grnId, date: delDate,
          unclassifiedDispatch: { bagType: 'S/B', smallBags: 1, bigBags: 0, seasonalBagPrice: 110 },
          rentCharge: 110, gpNumber: 'GP-0005',
        },
        USER_ID,
      ),
    ).rejects.toThrow('exceeds remaining unclassified stock');

    // 3. Validation check: Attempting to withdraw > 15 confirmed small bags fails
    await expect(
      deliveryService.createDelivery(
        facilityId,
        {
          grnId, date: delDate,
          confirmedDispatch: { bagType: 'S/B', smallBags: 20, bigBags: 0, seasonalBagPrice: 110 },
          rentCharge: 2200, gpNumber: 'GP-0006',
        },
        USER_ID,
      ),
    ).rejects.toThrow('exceeds remaining confirmed stock');

    // 4. Final Delivery: Dispatch remaining Section B (15 Small, 15 Big)
    const { delivery: d2 } = await deliveryService.createDelivery(
      facilityId,
      {
        grnId, date: delDate, smallBags: 15, bigBags: 15,
        confirmedDispatch: { bagType: 'S/B', smallBags: 15, bigBags: 15, seasonalBagPrice: 110 },
        rentCharge: 3300, gpNumber: 'GP-0007', vehicleNumber: 'UP32AA2222', driverName: 'Suresh Kumar',
      },
      USER_ID,
    );

    expect(d2.totalBags).toBe(30);

    // Verify final pools and ledger balances reach 0
    const poolsFinal = await resolveMergedStockPools(facilityId, grn!);
    expect(poolsFinal?.availableUnclassified).toBe(0);
    expect(poolsFinal?.availableConfirmedSmall).toBe(0);
    expect(poolsFinal?.availableConfirmedBig).toBe(0);
    expect(poolsFinal?.availableConfirmedTotal).toBe(0);

    const ledgerFinal = await readLedgerBalance(facilityId, grnId);
    expect(ledgerFinal.total).toBe(0);

  });
});
