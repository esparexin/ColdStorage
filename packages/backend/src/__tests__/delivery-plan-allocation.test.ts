import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CommodityRateModel } from '../database/models/commodity-rate.model.js';
import { deliveryService } from '../modules/delivery/delivery.service.js';
import { grnService } from '../modules/grn/grn.service.js';
import { readLedgerBalance } from '../modules/inventory/ledger-balance.js';
import { seedCustomer, seedFacility } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

const TEST_USER = 'usr-del-plan-test';

describe('Delivery Plan Bag Allocation & Edge Validations', () => {
  let facilityId: string;
  let customerId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await CommodityRateModel.deleteMany({});
    facilityId = await seedFacility({ name: 'Plan Test Facility' });
    customerId = await seedCustomer({ facilityId, name: 'Plan Test Customer' });
    await CommodityModel.create({
      id: 'cmd-wheat-plan',
      name: 'Wheat Plan',
      normalizedName: 'wheat plan',
      isActive: true,
      defaultBagType: 'S/B',
    });
  });

  it('allocates outward withdrawal to big bags when only big bags remain in confirmed S/B lot', async () => {
    const { grn } = await grnService.createGrn(
      facilityId,
      {
        grnNumber: 'GRN-PLAN-01',
        date: new Date(),
        customerId,
        commodityId: 'cmd-wheat-plan',
        chamber: 'CH-01',
        bags: 100,
        bagType: 'S/B',
        smallBags: 0,
        bigBags: 100,
        rentType: 'Seasonal',
        bagPrice: 15,
      },
      TEST_USER,
    );

    const res = await deliveryService.createDelivery(
      facilityId,
      { grnId: grn.id, quantity: 25 },
      TEST_USER,
    );

    expect(res.delivery.smallBags).toBe(0);
    expect(res.delivery.bigBags).toBe(25);
    expect(res.delivery.rentCharge).toBe(25 * 15);

    const bal = await readLedgerBalance(facilityId, grn.id);
    expect(bal.total).toBe(75);
    expect(bal.smallBags).toBe(0);
    expect(bal.bigBags).toBe(75);
  });

  it('rejects unspecific delivery quantity when both small and big bags exist in verified S/B lot', async () => {
    const { grn } = await grnService.createGrn(
      facilityId,
      {
        grnNumber: 'GRN-PLAN-02',
        date: new Date(),
        customerId,
        commodityId: 'cmd-wheat-plan',
        chamber: 'CH-01',
        bags: 100,
        bagType: 'S/B',
        smallBags: 40,
        bigBags: 60,
        rentType: 'Seasonal',
        bagPrice: 15,
      },
      TEST_USER,
    );

    await expect(
      deliveryService.createDelivery(
        facilityId,
        { grnId: grn.id, quantity: 20 },
        TEST_USER,
      ),
    ).rejects.toThrow('Small and big bag composition required for delivery when both bag types are in stock');
  });

  it('rejects dual-section dispatch payload when target GRN is not a merged consignment', async () => {
    const { grn } = await grnService.createGrn(
      facilityId,
      {
        grnNumber: 'GRN-PLAN-03',
        date: new Date(),
        customerId,
        commodityId: 'cmd-wheat-plan',
        chamber: 'CH-01',
        bags: 50,
        bagType: 'S',
        rentType: 'Seasonal',
        bagPrice: 12,
      },
      TEST_USER,
    );

    await expect(
      deliveryService.createDelivery(
        facilityId,
        {
          grnId: grn.id,
          unclassifiedDispatch: { bagType: 'S/B', quantity: 10 },
        },
        TEST_USER,
      ),
    ).rejects.toThrow("is not a merged consignment and does not support dual-section dispatch");
  });
});
