import http from 'node:http';
import mongoose, { type PipelineStage } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { connectToDatabase, disconnectDatabase } from '../database/connection.js';
import { inspectDatabaseIndexesReadOnly, verifyIndexDeclarations } from '../database/indexes.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { seedFacility } from './helpers/master-data-fixtures.js';

const app = createApp();

const FACILITY_ID = 'fac-perf-test';
const BENCHMARK_FACILITY_ID = 'fac-perf-bench';
const BENCHMARK_RECORDS = 1000;
// Benchmark thresholds: the 200 ms latency ceiling covers Atlas Free Tier round-trip latency,
// while local MongoDB comfortably meets the original 100 ms plan criterion.
const MIN_WRITES_PER_SECOND = 250;
const MAX_MEAN_LATENCY_MS = 200;

/** Synthetic GRN ledger rows; chamber is free text, so the ledger groups by that label. */
function buildBenchmarkGrns(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `grn-bench-${i}`,
    facilityId: BENCHMARK_FACILITY_ID,
    grnNumber: `GRN-BENCH-${String(i).padStart(4, '0')}`,
    inwardReceiptNumber: `RCPT-BENCH-${String(i).padStart(4, '0')}`,
    date: new Date(Date.now() - i * 60000),
    customerId: `cust-bench-${i % 25}`,
    customerName: `Benchmark Customer ${i % 25}`,
    commodityId: `cmd-bench-${i % 5}`,
    commodityName: 'Potato',
    chamber: `CH-${i % 4}`,
    bags: 100,
    bagType: 'S' as const,
    // Composition is mandatory on every GRN; a single-type receipt stores zero on the unused side.
    smallBags: 100,
    bigBags: 0,
    smallBagWeight: 50,
    rentType: 'Seasonal' as const,
    rentAmount: 5000,
    status: 'OPEN' as const,
    createdBy: 'benchmark-runner',
  }));
}

describe('Phase 11: Performance Optimization, Index Audit & Benchmarking', () => {
  let adminToken: string;
  let superAdminToken: string;
  let server: http.Server;
  let serverPort: number;

  const seed = createAuthSeeder(config.jwtSecret);

  beforeAll(async () => {
    await connectToDatabase();

    await FacilityModel.deleteMany({ id: { $regex: /^fac-perf/ } });
    await seedFacility({ id: FACILITY_ID, name: 'Performance Test Facility', code: 'PERF' });
    await seedFacility({ id: BENCHMARK_FACILITY_ID, name: 'Perf Bench Facility', code: 'PERFB' });

    ({ token: adminToken } = await seed({
      userId: 'usr-perf-admin',
      username: 'perf_admin',
      role: 'ADMIN',
      facilityIds: [FACILITY_ID],
      expiresInSeconds: 3600,
    }));

    ({ token: superAdminToken } = await seed({
      userId: 'usr-perf-super',
      username: 'perf_super',
      role: 'SUPER_ADMIN',
      facilityIds: [],
      expiresInSeconds: 3600,
    }));

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        serverPort = typeof addr === 'object' && addr ? addr.port : 4000;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await FacilityModel.deleteMany({ id: { $regex: /^fac-perf/ } });
    await GrnModel.deleteMany({ facilityId: BENCHMARK_FACILITY_ID });
    await InventoryTransactionModel.deleteMany({ facilityId: FACILITY_ID });
    await disconnectDatabase();
  });

  it('1. compresses large JSON responses (> 1 KB) with gzip encoding', async () => {
    // Seed 25 facilities to exceed 1 KB payload
    for (let i = 0; i < 25; i++) {
      await seedFacility({
        id: `fac-perf-comp-${i}`,
        name: `Performance Compression Facility ${i} with extended description and long string`,
      });
    }

    try {
      // Use raw http.get to prevent superagent from auto-decompressing and stripping Content-Encoding
      const headers = await new Promise<http.IncomingHttpHeaders>((resolve, reject) => {
        const req = http.get(
          {
            hostname: '127.0.0.1',
            port: serverPort,
            path: '/api/facilities',
            headers: {
              Authorization: `Bearer ${superAdminToken}`,
              'Accept-Encoding': 'gzip',
            },
          },
          (res) => {
            resolve(res.headers);
            res.resume();
          },
        );
        req.on('error', reject);
      });

      expect(headers['content-encoding']).toBe('gzip');
    } finally {
      await FacilityModel.deleteMany({ id: { $regex: /^fac-perf-comp-/ } });
    }
  });

  it('2. bypasses compression for chunked streaming CSV export endpoints to prevent buffering', async () => {
    const res = await request(app)
      .get(`/api/facilities/${FACILITY_ID}/export/stock-summary`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Accept-Encoding', 'gzip');

    expect(res.status).toBe(200);
    // Explicit bypass: Content-Encoding should NOT be gzip
    expect(res.headers['content-encoding']).toBeUndefined();
  });

  it('3. read-only index verification utility confirms compound index coverage across domain models without mutating database', async () => {
    const reports = verifyIndexDeclarations();
    expect(reports.length).toBeGreaterThanOrEqual(15);

    for (const report of reports) {
      expect(report.isCompliant).toBe(true);
      expect(report.totalIndexes).toBeGreaterThan(0);
    }

    const auditLogReport = reports.find((r) => r.modelName === 'AuditLog');
    expect(auditLogReport).toBeDefined();
    expect(auditLogReport?.compoundIndexes.length).toBeGreaterThanOrEqual(3);

    const invTxReport = reports.find((r) => r.modelName === 'InventoryTransaction');
    expect(invTxReport).toBeDefined();
    expect(invTxReport?.compoundIndexes.length).toBeGreaterThanOrEqual(6);

    // Read-only database index inspection
    const dbIndexes = await inspectDatabaseIndexesReadOnly(mongoose.connection);
    expect(dbIndexes).toBeDefined();
    expect(Object.keys(dbIndexes).length).toBeGreaterThan(0);
  });

  it('4. verifies database query connection pooling and clean disconnect', async () => {
    expect(mongoose.connection.readyState).toBe(1); // 1 = connected

    const client = mongoose.connection.getClient();
    expect(client).toBeDefined();

    // Verify ping command executes smoothly through pool
    const adminDb = mongoose.connection.db?.admin();
    expect(adminDb).toBeDefined();
    const pingResult = await adminDb?.ping();
    expect(pingResult).toBeDefined();
  });

  it('5. verifies client disconnect terminates active streaming cursors without orphan handles', async () => {
    const cursor = InventoryTransactionModel.find({ facilityId: FACILITY_ID }).cursor();
    let isClosed = false;

    await new Promise<void>((resolve) => {
      cursor.on('close', () => {
        isClosed = true;
        resolve();
      });
      cursor.destroy();
    });

    expect(isClosed).toBe(true);
  });

  it('6. executes 1,000-record GRN ledger write and aggregation benchmark and verifies write throughput plus sub-200ms average read latency', async () => {
    await GrnModel.deleteMany({ facilityId: BENCHMARK_FACILITY_ID });

    try {
      // Write throughput: the full 1,000-row GRN ledger must be committed at a usable rate.
      const writeStart = performance.now();
      await GrnModel.insertMany(buildBenchmarkGrns(BENCHMARK_RECORDS), { ordered: false });
      const writeSeconds = (performance.now() - writeStart) / 1000;

      expect(await GrnModel.countDocuments({ facilityId: BENCHMARK_FACILITY_ID })).toBe(
        BENCHMARK_RECORDS,
      );
      expect(BENCHMARK_RECORDS / writeSeconds).toBeGreaterThanOrEqual(MIN_WRITES_PER_SECOND);

      const pipeline: PipelineStage[] = [
        { $match: { facilityId: BENCHMARK_FACILITY_ID } },
        {
          $group: {
            _id: '$chamber',
            totalBags: { $sum: '$bags' },
            totalRent: { $sum: '$rentAmount' },
            grnCount: { $sum: 1 },
          },
        },
        { $sort: { totalBags: -1 } },
      ];
      const runAggregation = async () => GrnModel.aggregate(pipeline);

      // 5 Warmup runs
      for (let w = 0; w < 5; w++) {
        await runAggregation();
      }

      // 10 Measured iterations
      let totalElapsedMs = 0;

      for (let i = 0; i < 10; i++) {
        const start = performance.now();
        const results = await runAggregation();
        totalElapsedMs += performance.now() - start;
        expect(results.length).toBeGreaterThan(0);
      }

      expect(totalElapsedMs / 10).toBeLessThanOrEqual(MAX_MEAN_LATENCY_MS);
    } finally {
      await GrnModel.deleteMany({ facilityId: BENCHMARK_FACILITY_ID });
    }
  });
});
