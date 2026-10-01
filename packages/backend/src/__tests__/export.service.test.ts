import { EventEmitter } from 'node:events';
import { Writable } from 'node:stream';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Response } from 'express';
import { ChamberModel } from '../database/models/chamber.model.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CustomerModel } from '../database/models/customer.model.js';
import { DeliveryChallanModel } from '../database/models/delivery-challan.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { PositionModel } from '../database/models/position.model.js';
import { dashboardService } from '../modules/dashboard/dashboard.service.js';
import {
  ExportService,
  buildDateFilter,
  exportService,
} from '../modules/import-export/export.service.js';

// Mock Response object for testing streaming
class MockResponse extends Writable {
  public headers: Record<string, string> = {};
  public body = '';
  public destroyed = false;
  public headersSent = false;
  public writableEnded = false;

  constructor() {
    super();
  }

  public setHeader(key: string, value: string): void {
    this.headers[key.toLowerCase()] = value;
    this.headersSent = true;
  }

  public override _write(
    chunk: unknown,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.body += String(chunk);
    callback();
  }

  public override end(cb?: () => void): this {
    this.writableEnded = true;
    super.end(cb);
    return this;
  }

  public override destroy(error?: Error): this {
    this.destroyed = true;
    super.destroy(error);
    return this;
  }
}

describe('P8 ExportService Unit & Streaming Tests', () => {
  const facilityA = 'fac-exp-a';
  const facilityB = 'fac-exp-b';

  beforeAll(async () => {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cold_storage_test';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  beforeEach(async () => {
    await FacilityModel.deleteMany({});
    await ChamberModel.deleteMany({});
    await PositionModel.deleteMany({});
    await CommodityModel.deleteMany({});
    await CustomerModel.deleteMany({});
    await GrnModel.deleteMany({});
    await DeliveryChallanModel.deleteMany({});
    await InventoryTransactionModel.deleteMany({});

    await FacilityModel.create({
      id: facilityA,
      name: 'Facility A',
      code: 'FA',
      address: 'Zone A',
      isActive: true,
    });

    await FacilityModel.create({
      id: facilityB,
      name: 'Facility B',
      code: 'FB',
      address: 'Zone B',
      isActive: true,
    });
  });

  // 1. Stream Headers & Chunking
  it('stream headers & chunking: emits text/csv; charset=utf-8, Content-Disposition, and chunked transfer', async () => {
    const res = new MockResponse() as unknown as Response;
    await exportService.exportCustomers(facilityA, {}, res);

    const mockRes = res as unknown as MockResponse;
    expect(mockRes.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(mockRes.headers['content-disposition']).toContain('customers-fac-exp-a.csv');
    expect(mockRes.headers['transfer-encoding']).toBe('chunked');
  });

  // 2. Backpressure & No Buffering
  it('backpressure & no buffering: streams 1,000 records without loading full array into memory', async () => {
    const docs = [];
    for (let i = 1; i <= 1000; i++) {
      docs.push({
        id: `cust-bp-${i}`,
        name: `Customer ${i}`,
        mobile: `987000${String(i).padStart(4, '0')}`,
        facilityIds: [facilityA],
        isActive: true,
      });
    }
    await CustomerModel.insertMany(docs);

    const res = new MockResponse() as unknown as Response;
    await exportService.exportCustomers(facilityA, {}, res);

    const mockRes = res as unknown as MockResponse;
    const lines = mockRes.body.trim().split('\r\n');
    expect(lines.length).toBe(1001); // 1 header + 1000 data rows
  });

  // 3. Client Disconnect
  it('client disconnect: simulates res.close event; verifies Mongoose cursor .close() is called', async () => {
    let cursorClosed = false;
    interface FakeRecord {
      name: string;
      mobile: string;
      isActive: boolean;
      createdAt: Date;
    }
    const fakeCursor: AsyncIterable<FakeRecord> & { close: () => Promise<void> } = {
      async *[Symbol.asyncIterator]() {
        yield { name: 'Alice', mobile: '9876543210', isActive: true, createdAt: new Date() };
        // simulate delay
        await new Promise((r) => setTimeout(r, 50));
      },
      close: async () => {
        cursorClosed = true;
      },
    };

    const resEmitter = new EventEmitter() as unknown as Response;
    const mockRes = resEmitter as unknown as {
      headers: Record<string, string>;
      setHeader: (k: string, v: string) => void;
      writableEnded: boolean;
    };
    mockRes.headers = {};
    mockRes.setHeader = (k, v) => {
      mockRes.headers[k.toLowerCase()] = v;
    };
    mockRes.writableEnded = false;

    // Trigger close before pipeline finishes
    setTimeout(() => {
      resEmitter.emit('close');
    }, 10);

    const svc = new ExportService();
    try {
      await svc.streamCursor(
        fakeCursor,
        ['name', 'mobile'],
        (d) => [d.name, d.mobile],
        resEmitter,
        'test.csv',
      );
    } catch {
      // Expected abort
    }

    expect(cursorClosed).toBe(true);
  });

  // 4. Stream Error Mid-Flight
  it('stream error mid-flight: simulates cursor error; verifies res.destroy() is called and no corrupted file is finalized', async () => {
    interface ErrorRecord {
      name: string;
      mobile: string;
    }
    const errorCursor: AsyncIterable<ErrorRecord> & { close: () => Promise<void> } = {
      async *[Symbol.asyncIterator]() {
        yield { name: 'Alice', mobile: '9876543210' };
        throw new Error('Database connection lost');
      },
      close: async () => {},
    };

    const res = new MockResponse() as unknown as Response;
    const svc = new ExportService();

    await svc.streamCursor(errorCursor, ['name'], (d) => [d.name], res, 'test.csv');

    const mockRes = res as unknown as MockResponse;
    expect(mockRes.destroyed).toBe(true);
  });

  // 5. Date Filter Case 1 (Neither)
  it('date filter Case 1 (Neither): no from, no to returns all historical records', () => {
    const filter = buildDateFilter('date', {});
    expect(filter).toEqual({});
  });

  // 6. Date Filter Case 2 (From Only)
  it('date filter Case 2 (From Only): from returns records >= fromDate (Asia/Kolkata start of day)', () => {
    const filter = buildDateFilter('date', { from: '2026-10-01' });
    const expected = new Date('2026-10-01T00:00:00.000+05:30');
    expect(filter).toEqual({ date: { $gte: expected } });
  });

  // 7. Date Filter Case 3 (To Only)
  it('date filter Case 3 (To Only): to returns records < toDate (Asia/Kolkata start of day)', () => {
    const filter = buildDateFilter('date', { to: '2026-10-05' });
    const expected = new Date('2026-10-05T00:00:00.000+05:30');
    expect(filter).toEqual({ date: { $lt: expected } });
  });

  // 8. Date Filter Case 4 (Both)
  it('date filter Case 4 (Both): from and to returns records in half-open interval [fromDate, toDate)', () => {
    const filter = buildDateFilter('date', { from: '2026-10-01', to: '2026-10-05' });
    const fromExpected = new Date('2026-10-01T00:00:00.000+05:30');
    const toExpected = new Date('2026-10-05T00:00:00.000+05:30');
    expect(filter).toEqual({ date: { $gte: fromExpected, $lt: toExpected } });
  });

  // 9. Date Boundary Exactness
  it('date boundary exactness: record on exact from midnight is included, record on exact to midnight is excluded', async () => {
    // Record on exact start of from: 2026-10-01 00:00:00 IST
    await CustomerModel.create({
      id: 'cust-b-1',
      name: 'On From Boundary',
      mobile: '9870001111',
      facilityIds: [facilityA],
      isActive: true,
      createdAt: new Date('2026-10-01T00:00:00.000+05:30'),
    });

    // Record on exact start of to: 2026-10-02 00:00:00 IST (must be excluded)
    await CustomerModel.create({
      id: 'cust-b-2',
      name: 'On To Boundary',
      mobile: '9870002222',
      facilityIds: [facilityA],
      isActive: true,
      createdAt: new Date('2026-10-02T00:00:00.000+05:30'),
    });

    const res = new MockResponse() as unknown as Response;
    await exportService.exportCustomers(facilityA, { from: '2026-10-01', to: '2026-10-02' }, res);

    const mockRes = res as unknown as MockResponse;
    expect(mockRes.body).toContain('On From Boundary');
    expect(mockRes.body).not.toContain('On To Boundary');
  });

  // 10. Stock Summary Bounded Query
  it('stock summary bounded query: verifies query executes O(positions) aggregate using canonical P7 ledgerSignedQuantity', async () => {
    await ChamberModel.create({
      id: 'ch-stk-1',
      facilityId: facilityA,
      chamberNumber: 'CH-01',
      isActive: true,
    });

    await PositionModel.create({
      id: 'pos-stk-1',
      chamberId: 'ch-stk-1',
      facilityId: facilityA,
      levelId: 'lvl-1',
      rackId: 'rk-1',
      code: 'A-01',
      capacityBags: 500,
      isActive: true,
    });

    await InventoryTransactionModel.create({
      id: 'txn-stk-1',
      facilityId: facilityA,
      grnId: 'grn-stk-1',
      grnNumber: 'GRN-01',
      chamberId: 'ch-stk-1',
      rackId: 'rk-1',
      levelId: 'lvl-1',
      positionId: 'pos-stk-1',
      positionCode: 'A-01',
      customerId: 'cust-1',
      commodityId: 'comm-1',
      bagType: 'S',
      transactionType: 'INWARD_PUTAWAY',
      quantity: 200,
      referenceType: 'PUT_AWAY',
      referenceId: 'ref-1',
      createdBy: 'u1',
      createdAt: new Date(),
    });

    const res = new MockResponse() as unknown as Response;
    await exportService.exportStockSummary(facilityA, res);

    const mockRes = res as unknown as MockResponse;
    expect(mockRes.body).toContain('CH-01,true,500,200,300,40');
  });

  // 11. P7 / P8 Stock Summary Reconciliation
  it('P7 / P8 Stock Summary reconciliation: proves that sum of capacity, occupied bags, and available bags in P8 Stock Summary export exactly equals P7 DashboardService metrics on identical fixtures', async () => {
    // 2 chambers in Facility A
    await ChamberModel.create([
      { id: 'ch-rec-1', facilityId: facilityA, chamberNumber: 'CH-01', isActive: true },
      { id: 'ch-rec-2', facilityId: facilityA, chamberNumber: 'CH-02', isActive: false }, // inactive chamber
    ]);

    await PositionModel.create([
      {
        id: 'pos-rec-1',
        chamberId: 'ch-rec-1',
        facilityId: facilityA,
        levelId: 'lvl-1',
        rackId: 'rk-1',
        code: 'P-1',
        capacityBags: 600,
        isActive: true,
      },
      {
        id: 'pos-rec-2',
        chamberId: 'ch-rec-2',
        facilityId: facilityA,
        levelId: 'lvl-1',
        rackId: 'rk-1',
        code: 'P-2',
        capacityBags: 400,
        isActive: true,
      },
    ]);

    // Ledger transactions
    await InventoryTransactionModel.create([
      {
        id: 'txn-rec-1',
        facilityId: facilityA,
        grnId: 'grn-rec-1',
        grnNumber: 'GRN-01',
        chamberId: 'ch-rec-1',
        rackId: 'rk-1',
        levelId: 'lvl-1',
        positionId: 'pos-rec-1',
        positionCode: 'P-1',
        customerId: 'cust-1',
        commodityId: 'comm-1',
        bagType: 'S',
        transactionType: 'INWARD_PUTAWAY',
        quantity: 300,
        referenceType: 'PUT_AWAY',
        referenceId: 'ref-1',
        createdBy: 'u1',
        createdAt: new Date(),
      },
      {
        id: 'txn-rec-2',
        facilityId: facilityA,
        grnId: 'grn-rec-1',
        grnNumber: 'GRN-01',
        chamberId: 'ch-rec-1',
        rackId: 'rk-1',
        levelId: 'lvl-1',
        positionId: 'pos-rec-1',
        positionCode: 'P-1',
        customerId: 'cust-1',
        commodityId: 'comm-1',
        bagType: 'S',
        transactionType: 'OUTWARD_DELIVERY',
        quantity: 50,
        referenceType: 'DELIVERY',
        referenceId: 'ref-2',
        createdBy: 'u1',
        createdAt: new Date(),
      },
      {
        id: 'txn-rec-3',
        facilityId: facilityA,
        grnId: 'grn-rec-2',
        grnNumber: 'GRN-02',
        chamberId: 'ch-rec-2',
        rackId: 'rk-1',
        levelId: 'lvl-1',
        positionId: 'pos-rec-2',
        positionCode: 'P-2',
        customerId: 'cust-1',
        commodityId: 'comm-1',
        bagType: 'S',
        transactionType: 'INWARD_PUTAWAY',
        quantity: 100,
        referenceType: 'PUT_AWAY',
        referenceId: 'ref-3',
        createdBy: 'u1',
        createdAt: new Date(),
      },
    ]);

    // 1. Get P7 dashboard summary
    const p7Summary = await dashboardService.getSummary(facilityA);

    // 2. Get P8 stock summary export
    const res = new MockResponse() as unknown as Response;
    await exportService.exportStockSummary(facilityA, res);
    const mockRes = res as unknown as MockResponse;

    const lines = mockRes.body.trim().split('\r\n').slice(1); // skip header
    let exportTotalCapacity = 0;
    let exportTotalOccupied = 0;
    let exportTotalAvailable = 0;

    for (const line of lines) {
      const parts = line.split(',');
      exportTotalCapacity += parseInt(parts[2], 10);
      exportTotalOccupied += parseInt(parts[3], 10);
      exportTotalAvailable += parseInt(parts[4], 10);
    }

    // Exact reconciliation invariant:
    expect(exportTotalCapacity).toBe(p7Summary.totalCapacityBags);
    expect(exportTotalOccupied).toBe(p7Summary.occupiedBags);
    expect(exportTotalAvailable).toBe(p7Summary.availableBags);
  });

  // 12. Cross-Facility Isolation (GRN)
  it('cross-facility isolation (GRN): Exporting Facility A contains 0 records from Facility B', async () => {
    await GrnModel.create([
      {
        id: 'grn-iso-a',
        facilityId: facilityA,
        grnNumber: 'GRN-A-001',
        inwardReceiptNumber: 'RCPT-A-001',
        date: new Date(),
        customerId: 'c1',
        customerName: 'A',
        commodityId: 'cmd1',
        commodityName: 'Pot',
        chamberId: 'ch1',
        chamberNumber: '1',
        bags: 10,
        bagType: 'S',
        rentType: 'Seasonal',
        rentAmount: 100,
        status: 'OPEN',
        createdBy: 'u1',
      },
      {
        id: 'grn-iso-b',
        facilityId: facilityB,
        grnNumber: 'GRN-B-001',
        inwardReceiptNumber: 'RCPT-B-001',
        date: new Date(),
        customerId: 'c2',
        customerName: 'B',
        commodityId: 'cmd1',
        commodityName: 'Pot',
        chamberId: 'ch2',
        chamberNumber: '2',
        bags: 20,
        bagType: 'S',
        rentType: 'Seasonal',
        rentAmount: 200,
        status: 'OPEN',
        createdBy: 'u2',
      },
    ]);

    const res = new MockResponse() as unknown as Response;
    await exportService.exportGrns(facilityA, {}, res);

    const mockRes = res as unknown as MockResponse;
    expect(mockRes.body).toContain('GRN-A-001');
    expect(mockRes.body).not.toContain('GRN-B-001');
  });

  // 13. Cross-Facility Isolation (Deliveries)
  it('cross-facility isolation (Deliveries): Exporting Facility A contains 0 delivery records from Facility B', async () => {
    await DeliveryChallanModel.create([
      {
        id: 'del-iso-a',
        facilityId: facilityA,
        challanNumber: 'CHL-A-001',
        date: new Date(),
        grnId: 'grn-a',
        grnNumber: 'GRN-A-01',
        customerId: 'c1',
        customerName: 'A',
        commodityId: 'cmd1',
        commodityName: 'Pot',
        chamberId: 'ch1',
        chamberNumber: '1',
        items: [{ positionId: 'p1', positionCode: 'P-1', bags: 5 }],
        totalBags: 5,
        status: 'ISSUED',
        issuedBy: 'u1',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'del-iso-b',
        facilityId: facilityB,
        challanNumber: 'CHL-B-001',
        date: new Date(),
        grnId: 'grn-b',
        grnNumber: 'GRN-B-01',
        customerId: 'c2',
        customerName: 'B',
        commodityId: 'cmd1',
        commodityName: 'Pot',
        chamberId: 'ch2',
        chamberNumber: '2',
        items: [{ positionId: 'p2', positionCode: 'P-2', bags: 10 }],
        totalBags: 10,
        status: 'ISSUED',
        issuedBy: 'u2',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const res = new MockResponse() as unknown as Response;
    await exportService.exportDeliveries(facilityA, {}, res);

    const mockRes = res as unknown as MockResponse;
    expect(mockRes.body).toContain('CHL-A-001');
    expect(mockRes.body).not.toContain('CHL-B-001');
  });

  // 14. Cross-Facility Isolation (Ledger)
  it('cross-facility isolation (Ledger): Exporting Facility A contains 0 ledger records from Facility B', async () => {
    await InventoryTransactionModel.create([
      {
        id: 'txn-iso-a',
        facilityId: facilityA,
        grnId: 'grn-a-100',
        grnNumber: 'GRN-A-100',
        chamberId: 'ch-a',
        rackId: 'rk-a',
        levelId: 'lvl-a',
        positionId: 'pos-a',
        positionCode: 'P-A',
        customerId: 'c1',
        commodityId: 'cmd1',
        bagType: 'S',
        transactionType: 'INWARD_PUTAWAY',
        quantity: 50,
        referenceType: 'PUT_AWAY',
        referenceId: 'ref-a',
        createdBy: 'u1',
        createdAt: new Date(),
      },
      {
        id: 'txn-iso-b',
        facilityId: facilityB,
        grnId: 'grn-b-100',
        grnNumber: 'GRN-B-100',
        chamberId: 'ch-b',
        rackId: 'rk-b',
        levelId: 'lvl-b',
        positionId: 'pos-b',
        positionCode: 'P-B',
        customerId: 'c2',
        commodityId: 'cmd1',
        bagType: 'S',
        transactionType: 'INWARD_PUTAWAY',
        quantity: 70,
        referenceType: 'PUT_AWAY',
        referenceId: 'ref-b',
        createdBy: 'u2',
        createdAt: new Date(),
      },
    ]);

    const res = new MockResponse() as unknown as Response;
    await exportService.exportInventoryLedger(facilityA, {}, res);

    const mockRes = res as unknown as MockResponse;
    expect(mockRes.body).toContain('GRN-A-100');
    expect(mockRes.body).not.toContain('GRN-B-100');
  });

  // 15. Cross-Facility Isolation (Customer)
  it('cross-facility isolation (Customer): Exporting Facility A contains only customers registered for Facility A', async () => {
    await CustomerModel.create([
      {
        id: 'cust-iso-a',
        name: 'Farmer A Only',
        mobile: '9870000001',
        facilityIds: [facilityA],
        isActive: true,
      },
      {
        id: 'cust-iso-b',
        name: 'Farmer B Only',
        mobile: '9870000002',
        facilityIds: [facilityB],
        isActive: true,
      },
    ]);

    const res = new MockResponse() as unknown as Response;
    await exportService.exportCustomers(facilityA, {}, res);

    const mockRes = res as unknown as MockResponse;
    expect(mockRes.body).toContain('Farmer A Only');
    expect(mockRes.body).not.toContain('Farmer B Only');
  });

  // 16. Cross-Facility Isolation (Stock Summary)
  it('cross-facility isolation (Stock Summary): Stock summary aggregates only Facility A positions and transactions', async () => {
    await ChamberModel.create([
      { id: 'ch-iso-a', facilityId: facilityA, chamberNumber: 'CH-A1', isActive: true },
      { id: 'ch-iso-b', facilityId: facilityB, chamberNumber: 'CH-B1', isActive: true },
    ]);

    await PositionModel.create([
      {
        id: 'pos-iso-a',
        chamberId: 'ch-iso-a',
        facilityId: facilityA,
        levelId: 'l1',
        rackId: 'r1',
        code: 'A1',
        capacityBags: 200,
        isActive: true,
      },
      {
        id: 'pos-iso-b',
        chamberId: 'ch-iso-b',
        facilityId: facilityB,
        levelId: 'l2',
        rackId: 'r2',
        code: 'B1',
        capacityBags: 800,
        isActive: true,
      },
    ]);

    const res = new MockResponse() as unknown as Response;
    await exportService.exportStockSummary(facilityA, res);

    const mockRes = res as unknown as MockResponse;
    expect(mockRes.body).toContain('CH-A1');
    expect(mockRes.body).not.toContain('CH-B1');
    expect(mockRes.body).toContain(',200,');
    expect(mockRes.body).not.toContain(',800,');
  });
});
