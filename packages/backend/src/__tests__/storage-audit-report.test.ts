import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DeliveryChallanModel } from '../database/models/delivery-challan.model.js';
import { deliveryService } from '../modules/delivery/delivery.service.js';
import { rentService } from '../modules/rent/rent.service.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

const USER_ID = 'usr-reporter';

describe('Phase 6: Storage Occupancy Audit & Reporting (storage-audit-report.test.ts)', () => {
  let facilityId: string;
  let customerId: string;
  let grnId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    facilityId = await seedFacility({ name: 'Audit Report Facility' });
    customerId = await seedCustomer({ facilityId, name: 'Audit Farms Ltd' });
    grnId = await seedGrn({
      facilityId,
      customerId,
      chamber: 'CH-01',
      bags: 100,
      commodityName: 'Apples',
      grnNumber: 'GRN-26-27-0040',
      date: new Date('2026-09-15T10:00:00Z'),
      rentAmount: 3000,
      marks: 'LOT-40',
      gpNumber: 'GP-40',
    });

    // Pay rent in full
    await rentService.recordPayment(
      facilityId,
      { grnId, amountPaid: 3000, paymentMode: 'UPI', paymentDate: new Date('2026-09-16T10:00:00Z') },
      USER_ID,
    );

    // Delivery 1: 40 bags on 2026-09-20
    await deliveryService.createDelivery(
      facilityId,
      {
        grnId,
        bags: 40,
        date: new Date('2026-09-20T10:00:00Z'),
        marks: 'LOT-40-A',
        gpNumber: 'GP-40-1',
        remarks: 'First partial dispatch',
      },
      USER_ID,
    );

    // Delivery 2: 60 bags on 2026-09-25 (closing GRN)
    await deliveryService.createDelivery(
      facilityId,
      {
        grnId,
        bags: 60,
        date: new Date('2026-09-25T10:00:00Z'),
        marks: 'LOT-40-B',
        gpNumber: 'GP-40-2',
        remarks: 'Final dispatch',
      },
      USER_ID,
    );
  });

  it('generates movement view report with full audit trail and zero duplicate records created', async () => {
    const challanCountBefore = await DeliveryChallanModel.countDocuments();

    const report = await rentService.getStorageOccupancyAuditReport(facilityId, {
      view: 'movement',
      grnId,
    });

    // Zero duplicate records created
    expect(await DeliveryChallanModel.countDocuments()).toBe(challanCountBefore);

    expect(report.facilityId).toBe(facilityId);
    expect(report.view).toBe('movement');
    expect(report.totalRecords).toBe(3);

    const [inward, partial, final] = report.items;

    // Inward line
    expect(inward.movementType).toBe('INWARD');
    expect(inward.openingBags).toBe(0);
    expect(inward.deliveredBags).toBe(0);
    expect(inward.closingBags).toBe(100);
    expect(inward.paymentStatus).toBe('Settled');
    expect(inward.totalPaid).toBe(3000);
    expect(inward.remainingBalance).toBe(0);

    // Partial delivery line
    expect(partial.movementType).toBe('PARTIAL_OUTWARD');
    expect(partial.openingBags).toBe(100);
    expect(partial.deliveredBags).toBe(40);
    expect(partial.closingBags).toBe(60);
    expect(partial.marks).toBe('LOT-40-A');
    expect(partial.gpNumber).toBe('GP-40-1');
    expect(partial.remarks).toBe('First partial dispatch');
    expect(partial.outwardDate).toBeDefined();

    // Final delivery line
    expect(final.movementType).toBe('FINAL_OUTWARD');
    expect(final.openingBags).toBe(60);
    expect(final.deliveredBags).toBe(60);
    expect(final.closingBags).toBe(0);
    expect(final.marks).toBe('LOT-40-B');
    expect(final.gpNumber).toBe('GP-40-2');
  });

  it('generates monthly view report showing occupancy per period', async () => {
    const report = await rentService.getStorageOccupancyAuditReport(facilityId, {
      view: 'monthly',
      grnId,
    });

    expect(report.view).toBe('monthly');
    expect(report.totalRecords).toBeGreaterThanOrEqual(1);

    const period = report.items[0];
    expect(period.month).toMatch(/September 2026/);
    expect(period.openingBags).toBe(100);
    expect(period.deliveredBags).toBe(100);
    expect(period.closingBags).toBe(0);
    expect(period.paymentStatus).toBe('Settled');
  });

  it('generates seasonal view report with peak occupancy', async () => {
    const report = await rentService.getStorageOccupancyAuditReport(facilityId, {
      view: 'seasonal',
      grnId,
    });

    expect(report.view).toBe('seasonal');
    expect(report.totalRecords).toBe(1);

    const item = report.items[0];
    expect(item.season).toMatch(/\d{4}-\d{4}/);
    expect(item.openingBags).toBe(100);
    expect(item.deliveredBags).toBe(100);
    expect(item.closingBags).toBe(0);
    expect(item.applicableOccupancy).toBe(100);
  });

  it('filters report by closing balance', async () => {
    const report = await rentService.getStorageOccupancyAuditReport(facilityId, {
      view: 'movement',
      closingBalance: 60,
    });

    expect(report.totalRecords).toBe(1);
    expect(report.items[0].closingBags).toBe(60);
    expect(report.items[0].deliveredBags).toBe(40);
  });

  it('filters report by outward date and date range', async () => {
    const report = await rentService.getStorageOccupancyAuditReport(facilityId, {
      view: 'movement',
      outwardDate: '2026-09-20',
    });

    expect(report.totalRecords).toBe(1);
    expect(report.items[0].deliveredBags).toBe(40);

    const rangeReport = await rentService.getStorageOccupancyAuditReport(facilityId, {
      view: 'movement',
      fromDate: '2026-09-24T00:00:00Z',
      toDate: '2026-09-26T00:00:00Z',
    });

    expect(rangeReport.totalRecords).toBe(1);
    expect(rangeReport.items[0].deliveredBags).toBe(60);
  });
});
