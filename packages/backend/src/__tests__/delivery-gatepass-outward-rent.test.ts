import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CommodityRateModel } from '../database/models/commodity-rate.model.js';
import { RentPaymentModel } from '../database/models/rent-payment.model.js';
import { deliveryService } from '../modules/delivery/delivery.service.js';
import { grnService } from '../modules/grn/grn.service.js';
import { rentService } from '../modules/rent/rent.service.js';
import { seedCustomer, seedFacility } from './helpers/master-data-fixtures.js';
import { connectToTestDatabase, disconnectTestDatabase, resetStockCollections } from './helpers/stock-reset.js';
import { useHistoricalTestingDates } from './helpers/historical-dates-env.js';

const USER_ID = 'usr-gp-rent-tester';

describe('Independent Outward Rent Per Gate Pass (delivery-gatepass-outward-rent.test.ts)', () => {
  useHistoricalTestingDates();

  let facilityId: string;
  let customerId: string;
  let historicalCustomerId: string;

  beforeAll(async () => { await connectToTestDatabase(); });
  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await CommodityRateModel.deleteMany({});
    facilityId = await seedFacility({ name: 'Sri Sai Bala Cold Storage' });
    customerId = await seedCustomer({ facilityId, name: 'Kalyan' });
    historicalCustomerId = await seedCustomer({ facilityId, name: 'B SEENAIAH SDP' });

    await CommodityModel.create({ id: 'cmd-mirchi', name: 'Mirchi', normalizedName: 'mirchi', isActive: true, defaultBagType: 'S/B' });
    await CommodityRateModel.create([
      { id: 'crt-mirchi-s', commodityId: 'cmd-mirchi', rentType: 'Seasonal', smallRate: 125, bigRate: 205, isActive: true },
    ]);
  });

  it('calculates, itemizes, and settles outward rent independently per Gate Pass without merging historical dues', async () => {
    // 1. Historical Source GRN #0011 (Season 2025 · 96 bags · Pending: ₹23,040)
    const { grn: grn0011 } = await grnService.createGrn(
      facilityId,
      { grnNumber: '0011', date: new Date('2025-04-10T10:00:00.000Z'), customerId: historicalCustomerId, commodityId: 'cmd-mirchi', chamber: 'CH-1', bags: 96, bagType: 'B', rentType: 'Seasonal', rentAmount: 23040 },
      USER_ID,
    );
    const initial0011Summary = await rentService.getRentSummary(facilityId, grn0011.id);
    expect(initial0011Summary.totalDue).toBe(23040);
    expect(initial0011Summary.remainingBalance).toBe(23040);

    // 2. Inward GRN #0007 (Kalyan · Mirchi · 140 bags · rentAmount = 0 assessed at outward)
    const { grn: grn0007 } = await grnService.createGrn(
      facilityId,
      { grnNumber: '0007', date: new Date('2026-03-15T10:00:00.000Z'), customerId, commodityId: 'cmd-mirchi', chamber: 'CH-2', bags: 140, bagType: 'S/B', rentType: 'Seasonal', smallBagPrice: 125, bigBagPrice: 205, rentAmount: 0 },
      USER_ID,
    );

    // 3. First Outward Delivery: CHL-26-27-0004 on 03 Nov 2026 (70 bags: 30S @ 125 + 40B @ 205 = ₹11,950)
    const d1Result = await deliveryService.createDelivery(
      facilityId,
      { grnId: grn0007.id, date: new Date('2026-11-03T11:00:00.000Z'), smallBags: 30, bigBags: 40, gpNumber: 'GP-0004', vehicleNumber: 'AP 26 TA 1234', driverName: 'Ramu' },
      USER_ID,
    );
    const d1 = d1Result.delivery;
    expect(d1.rentCharge).toBe(11950);

    // 4. Second Outward Delivery: CHL-26-27-0005 on 04 Nov 2026 (20 bags: 10S @ 125 + 10B @ 205 = ₹3,300)
    const d2Result = await deliveryService.createDelivery(
      facilityId,
      { grnId: grn0007.id, date: new Date('2026-11-04T11:00:00.000Z'), smallBags: 10, bigBags: 10, gpNumber: 'GP-0005', vehicleNumber: 'AP 26 TA 5678', driverName: 'Suresh' },
      USER_ID,
    );
    const d2 = d2Result.delivery;
    expect(d2.rentCharge).toBe(3300);

    // 5. Query projections report independent rent obligations
    const deliveries = await deliveryService.listDeliveries(facilityId, { page: 1, limit: 10, grnId: grn0007.id });
    const fetchedD1 = deliveries.items.find((d) => d.id === d1.id)!;
    const fetchedD2 = deliveries.items.find((d) => d.id === d2.id)!;
    expect(fetchedD1.rentTotalAmount).toBe(11950);
    expect(fetchedD1.rentRemainingBalance).toBe(11950);
    expect(fetchedD1.rentPaymentStatus).toBe('Not Settled');
    expect(fetchedD2.rentTotalAmount).toBe(3300);
    expect(fetchedD2.rentRemainingBalance).toBe(3300);
    expect(fetchedD2.rentPaymentStatus).toBe('Not Settled');

    // 6. Test Delivery-level Overpayment Guard
    await expect(
      rentService.recordPayment(facilityId, { grnId: grn0007.id, deliveryId: d1.id, amountPaid: 12000, paymentMode: 'Cash', paymentDate: new Date('2026-11-04T12:00:00.000Z') }, USER_ID),
    ).rejects.toThrow(/exceeds remaining rent balance of ₹11950/);

    await expect(
      rentService.recordPayment(facilityId, { grnId: grn0007.id, deliveryId: d2.id, amountPaid: 3500, paymentMode: 'Cash', paymentDate: new Date('2026-11-04T12:00:00.000Z') }, USER_ID),
    ).rejects.toThrow(/exceeds remaining rent balance of ₹3300/);

    // 7. Pay CHL-26-27-0004 in full (₹11,950)
    const p1Result = await rentService.recordPayment(
      facilityId,
      { grnId: grn0007.id, deliveryId: d1.id, amountPaid: 11950, paymentMode: 'Cash', paymentDate: new Date('2026-11-04T12:30:00.000Z'), notes: 'Full settlement for CHL-26-27-0004' },
      USER_ID,
    );
    const payment1 = await RentPaymentModel.findOne({ id: p1Result.payment.id }).lean();
    expect(payment1?.deliveryId).toBe(d1.id);
    expect(payment1?.challanNumber).toBe(d1.challanNumber);
    expect(payment1?.gpNumber).toBe(d1.gpNumber);

    // Delivery 1 is Settled, Delivery 2 is STILL UNSETTLED
    const deliveriesAfterP1 = await deliveryService.listDeliveries(facilityId, { page: 1, limit: 10, grnId: grn0007.id });
    const d1AfterP1 = deliveriesAfterP1.items.find((d) => d.id === d1.id)!;
    const d2AfterP1 = deliveriesAfterP1.items.find((d) => d.id === d2.id)!;
    expect(d1AfterP1.rentTotalPaid).toBe(11950);
    expect(d1AfterP1.rentRemainingBalance).toBe(0);
    expect(d1AfterP1.rentPaymentStatus).toBe('Settled');
    expect(d2AfterP1.rentTotalPaid).toBe(0);
    expect(d2AfterP1.rentRemainingBalance).toBe(3300);
    expect(d2AfterP1.rentPaymentStatus).toBe('Not Settled');

    // Receipt print output for Delivery 1 contains Gate Pass and Challan
    const receiptHtml = await rentService.renderReceipt(facilityId, p1Result.payment.receiptNumber, USER_ID);
    expect(receiptHtml).toContain(d1.challanNumber);
    expect(receiptHtml).toContain('GP-0004');
    expect(receiptHtml).toContain('70 bags');

    // 8. Historical Source Consignment GRN #0011 dues were NOT touched
    const summary0011AfterP1 = await rentService.getRentSummary(facilityId, grn0011.id);
    expect(summary0011AfterP1.totalDue).toBe(23040);
    expect(summary0011AfterP1.remainingBalance).toBe(23040);

    // 9. Settle CHL-26-27-0005 in full (₹3,300)
    await rentService.recordPayment(
      facilityId,
      { grnId: grn0007.id, deliveryId: d2.id, amountPaid: 3300, paymentMode: 'UPI', paymentDate: new Date('2026-11-04T14:00:00.000Z'), notes: 'UPI Ref: UPI9876543210' },
      USER_ID,
    );

    const deliveriesFinal = await deliveryService.listDeliveries(facilityId, { page: 1, limit: 10, grnId: grn0007.id });
    expect(deliveriesFinal.items.find((d) => d.id === d1.id)?.rentPaymentStatus).toBe('Settled');
    expect(deliveriesFinal.items.find((d) => d.id === d2.id)?.rentPaymentStatus).toBe('Settled');

    const summary0007Final = await rentService.getRentSummary(facilityId, grn0007.id);
    expect(summary0007Final.totalPaid).toBe(15250);
    expect(summary0007Final.remainingBalance).toBe(0);
    expect(summary0007Final.paymentStatus).toBe('Settled');
    expect((await rentService.getRentSummary(facilityId, grn0011.id)).remainingBalance).toBe(23040);
  });
});
