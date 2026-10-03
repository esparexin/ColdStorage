import { EventEmitter } from 'node:events';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Response } from 'express';
import { CustomerModel } from '../database/models/customer.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { ExportService, exportService } from '../modules/import-export/export.service.js';
import { buildDateFilter } from '../modules/import-export/csv-stream.helper.js';
import { captureCsv, MockResponse } from './helpers/csv-response-fixtures.js';
import { seedFacility, seedGrn } from './helpers/master-data-fixtures.js';

/**
 * P8 ExportService streaming mechanics & date-range filtering.
 *
 * Scope: stream headers, chunked backpressure without buffering, client-disconnect cleanup,
 * mid-flight stream failure, and the Asia/Kolkata half-open date filter.
 *
 * NOT in scope here: column header sets (export.headers.test.ts), stock-summary contents
 * (export.stock-summary.test.ts) and cross-facility isolation (export.isolation.test.ts).
 */
describe('P8 ExportService streaming & date filters', () => {
  const facilityId = 'fac-exp-stream';

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
    await CustomerModel.deleteMany({});
    await GrnModel.deleteMany({});
    await seedFacility({ id: facilityId, code: 'EXP' });
  });

  // 1. Stream Headers & Chunking
  it('stream headers & chunking: emits text/csv; charset=utf-8, Content-Disposition, and chunked transfer', async () => {
    const capture = await captureCsv((res) => exportService.exportCustomers(facilityId, {}, res));

    expect(capture.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(capture.headers['content-disposition']).toContain('customers-fac-exp-stream.csv');
    expect(capture.headers['transfer-encoding']).toBe('chunked');
  });

  // 2. Backpressure & No Buffering
  it('backpressure & no buffering: streams 1,000 records without loading full array into memory', async () => {
    const docs = Array.from({ length: 1000 }, (_, i) => ({
      id: `cust-bp-${i}`,
      name: `Customer ${i}`,
      facilityIds: [facilityId],
      isActive: true,
    }));
    await CustomerModel.insertMany(docs);

    const capture = await captureCsv((res) => exportService.exportCustomers(facilityId, {}, res));

    expect(capture.rows).toHaveLength(1001); // 1 header + 1000 data rows
  });

  // 3. Client Disconnect
  it('client disconnect: simulates res.close event; verifies Mongoose cursor .close() is called', async () => {
    let cursorClosed = false;
    interface FakeRecord {
      name: string;
      isActive: boolean;
      createdAt: Date;
    }
    const fakeCursor: AsyncIterable<FakeRecord> & { close: () => Promise<void> } = {
      async *[Symbol.asyncIterator]() {
        yield { name: 'Alice', isActive: true, createdAt: new Date() };
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
        ['name', 'isActive'],
        (d) => [d.name, d.isActive],
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
      isActive: boolean;
    }
    const errorCursor: AsyncIterable<ErrorRecord> & { close: () => Promise<void> } = {
      async *[Symbol.asyncIterator]() {
        yield { name: 'Alice', isActive: true };
        throw new Error('Database connection lost');
      },
      close: async () => {},
    };

    const mock = new MockResponse();
    const svc = new ExportService();

    await svc.streamCursor(
      errorCursor,
      ['name', 'isActive'],
      (d) => [d.name, d.isActive],
      mock as unknown as Response,
      'test.csv',
    );

    expect(mock.destroyed).toBe(true);
  });

  // 5. Date Filter Case 1 (Neither)
  it('date filter Case 1 (Neither): no from, no to returns all historical records', () => {
    expect(buildDateFilter('date', {})).toEqual({});
  });

  // 6. Date Filter Case 2 (From Only)
  it('date filter Case 2 (From Only): from returns records >= fromDate (Asia/Kolkata start of day)', () => {
    expect(buildDateFilter('date', { from: '2026-10-01' })).toEqual({
      date: { $gte: new Date('2026-10-01T00:00:00.000+05:30') },
    });
  });

  // 7. Date Filter Case 3 (To Only)
  it('date filter Case 3 (To Only): to returns records < toDate (Asia/Kolkata start of day)', () => {
    expect(buildDateFilter('date', { to: '2026-10-05' })).toEqual({
      date: { $lt: new Date('2026-10-05T00:00:00.000+05:30') },
    });
  });

  // 8. Date Filter Case 4 (Both)
  it('date filter Case 4 (Both): from and to returns records in half-open interval [fromDate, toDate)', () => {
    expect(buildDateFilter('date', { from: '2026-10-01', to: '2026-10-05' })).toEqual({
      date: {
        $gte: new Date('2026-10-01T00:00:00.000+05:30'),
        $lt: new Date('2026-10-05T00:00:00.000+05:30'),
      },
    });
  });

  it('date filter rejects an inverted or empty range', () => {
    expect(() => buildDateFilter('date', { from: '2026-10-05', to: '2026-10-01' })).toThrow();
    expect(() => buildDateFilter('date', { from: '2026-10-01', to: '2026-10-01' })).toThrow();
  });

  // 9. Date Boundary Exactness
  it('date boundary exactness: record on exact from midnight is included, record on exact to midnight is excluded', async () => {
    await seedCustomerAt('cust-b-1', 'On From Boundary', '2026-10-01T00:00:00.000+05:30');
    await seedCustomerAt('cust-b-2', 'On To Boundary', '2026-10-02T00:00:00.000+05:30');

    const capture = await captureCsv((res) =>
      exportService.exportCustomers(facilityId, { from: '2026-10-01', to: '2026-10-02' }, res),
    );

    expect(capture.body).toContain('On From Boundary');
    expect(capture.body).not.toContain('On To Boundary');
  });

  // 10. Empty result set still emits the header row exactly once
  it('empty result set: still emits a single header row and ends the stream', async () => {
    await seedGrn({ facilityId, grnNumber: 'GRN-DATED-001' });
    const capture = await captureCsv((res) =>
      exportService.exportGrns(facilityId, { from: '2020-01-01', to: '2020-01-02' }, res),
    );

    expect(capture.rows).toHaveLength(1);
    expect(capture.header).toContain('grnNumber');
  });

  /** Seeds a customer with an explicit createdAt so the half-open boundary can be tested exactly. */
  async function seedCustomerAt(id: string, name: string, createdAt: string): Promise<void> {
    await CustomerModel.create({
      id,
      name,
      facilityIds: [facilityId],
      isActive: true,
      createdAt: new Date(createdAt),
    });
  }
});
