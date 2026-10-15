import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CommodityModel } from '../database/models/commodity.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { RentPaymentModel } from '../database/models/rent-payment.model.js';
import { deliveryService } from '../modules/delivery/delivery.service.js';
import { grnService } from '../modules/grn/grn.service.js';
import { rentService } from '../modules/rent/rent.service.js';
import { seedCustomer, seedFacility } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

const USER_ID = 'usr-del-overpayment-tester';

describe('Outward Delivery Inline Payment Overpayment Guard', () => {
  let facilityId: string;
  let customerId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    facilityId = await seedFacility({ name: 'Delivery Overpayment Facility' });
    customerId = await seedCustomer({ facilityId, name: 'Farmer Delivery Test' });
    await CommodityModel.create({
      id: 'cmd-wheat-del',
      name: 'Wheat',
      normalizedName: 'wheat',
      isActive: true,
      defaultBagType: 'S',
    });
  });

  it('rejects outward delivery when inline paymentAmount exceeds remaining rent liability', async () => {
    // Inward: 100 bags (Seasonal, ₹10/bag = ₹1000 season total)
    const { grn } = await grnService.createGrn(
      facilityId,
      {
        grnNumber: 'GRN-DEL-OVER-01',
        date: new Date(),
        customerId,
        commodityId: 'cmd-wheat-del',
        chamber: 'CH-A',
        bags: 100,
        bagType: 'S',
        rentType: 'Seasonal',
      },
      USER_ID,
    );

    // Deliver 50 bags: rent charge is 50 * 10 = ₹500.
    // Attempting inline payment of ₹600 must be rejected.
    await expect(
      deliveryService.createDelivery(
        facilityId,
        {
          grnId: grn.id,
          smallBags: 50,
          bigBags: 0,
          bagCategory: 'Small',
          paymentAmount: 600,
          paymentMode: 'Cash',
        },
        USER_ID,
      ),
    ).rejects.toThrow(/exceeds remaining rent balance of ₹500/);

    // Verify atomicity: no payment was created and no challan was issued
    const payments = await RentPaymentModel.find({ facilityId, grnId: grn.id }).lean();
    expect(payments).toHaveLength(0);

    const summary = await deliveryService.getDeliverySummary(facilityId, grn.id);
    expect(summary.netDeliveredBags).toBe(0);
    expect(summary.remainingDeliveryBalance).toBe(100);
  });

  it('accepts exact or partial inline payment during outward delivery and updates ledger', async () => {
    // Inward: 60 bags (Seasonal, ₹10/bag = ₹600 season total)
    const { grn } = await grnService.createGrn(
      facilityId,
      {
        grnNumber: 'GRN-DEL-OVER-02',
        date: new Date(),
        customerId,
        commodityId: 'cmd-wheat-del',
        chamber: 'CH-A',
        bags: 60,
        bagType: 'S',
        rentType: 'Seasonal',
      },
      USER_ID,
    );

    // 1. Partial delivery with valid inline payment: 40 bags (₹400 rent charge), pay ₹300 inline
    const d1 = await deliveryService.createDelivery(
      facilityId,
      {
        grnId: grn.id,
        smallBags: 40,
        bigBags: 0,
        bagCategory: 'Small',
        paymentAmount: 300,
        paymentMode: 'Cash',
        paymentReference: 'Ref-Partial',
      },
      USER_ID,
    );
    expect(d1.delivery.rentCharge).toBe(400);

    const rentSummary1 = await rentService.getRentSummary(facilityId, grn.id);
    expect(rentSummary1.totalDue).toBe(400);
    expect(rentSummary1.totalPaid).toBe(300);
    expect(rentSummary1.remainingBalance).toBe(100);
    expect(rentSummary1.paymentStatus).toBe('Not Settled');

    // 2. Final delivery with exact remaining balance inline:
    // Remaining 20 bags = ₹200 charge. Previous remaining balance was ₹100.
    // Total remaining liability now = ₹100 + ₹200 = ₹300.
    // Pay exact ₹300 inline:
    const d2 = await deliveryService.createDelivery(
      facilityId,
      {
        grnId: grn.id,
        smallBags: 20,
        bigBags: 0,
        bagCategory: 'Small',
        paymentAmount: 300,
        paymentMode: 'UPI',
        paymentReference: 'Ref-Final',
      },
      USER_ID,
    );
    expect(d2.delivery.rentCharge).toBe(200);

    const rentSummary2 = await rentService.getRentSummary(facilityId, grn.id);
    expect(rentSummary2.totalDue).toBe(600);
    expect(rentSummary2.totalPaid).toBe(600);
    expect(rentSummary2.remainingBalance).toBe(0);
    expect(rentSummary2.paymentStatus).toBe('Settled');

    // Both stock and rent balance are zero: GRN is CLOSED
    const closedGrn = await GrnModel.findOne({ id: grn.id }).lean();
    expect(closedGrn?.status).toBe('CLOSED');
  });
});
