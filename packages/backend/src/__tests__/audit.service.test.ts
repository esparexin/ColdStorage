import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditLogModel } from '../database/models/audit-log.model.js';
import { auditService } from '../modules/audit/audit.service.js';

describe('Suite 3: Audit Service & Domain Integration — audit.service.test.ts', () => {
  beforeAll(async () => {
    const mongoUri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/cold_storage_test';
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
    await mongoose.connection.collection('auditlogs').deleteMany({});
  });

  // 1. Emits and persists authentication events (AUTH_LOGIN_SUCCESS, AUTH_LOGIN_FAILED)
  it('emits and persists authentication events', async () => {
    await auditService.log({
      eventType: 'AUTH_LOGIN_SUCCESS',
      severity: 'INFO',
      userId: 'usr-1',
      username: 'op1',
      userRole: 'OPERATOR',
      ipAddress: '192.168.1.1',
      userAgent: 'Chrome',
      resource: 'auth',
      resourceId: 'session-123',
    });

    await auditService.log({
      eventType: 'AUTH_LOGIN_FAILED',
      severity: 'SECURITY',
      userId: 'ANONYMOUS',
      username: 'bad_user',
      userRole: 'ANONYMOUS',
      ipAddress: '10.0.0.99',
      userAgent: 'Bot',
      resource: 'auth',
      details: { reason: 'INVALID_CREDENTIALS' },
    });

    const logs = await AuditLogModel.find().lean();
    expect(logs.length).toBe(2);
    expect(logs.some((l) => l.eventType === 'AUTH_LOGIN_SUCCESS')).toBe(true);
    expect(logs.some((l) => l.eventType === 'AUTH_LOGIN_FAILED')).toBe(true);
  });

  // 2. Emits and persists security access denial events (ACCESS_DENIED)
  it('emits and persists security access denial events', async () => {
    await auditService.log({
      eventType: 'ACCESS_DENIED',
      severity: 'SECURITY',
      facilityId: 'fac-b',
      userId: 'usr-op-a',
      username: 'operator_a',
      userRole: 'OPERATOR',
      ipAddress: '127.0.0.1',
      userAgent: 'Mozilla',
      resource: 'facility',
      resourceId: 'fac-b',
      details: { attemptedRoute: '/api/facilities/fac-b/grns' },
    });

    const doc = await AuditLogModel.findOne({ eventType: 'ACCESS_DENIED' }).lean();
    expect(doc).toBeDefined();
    expect(doc?.severity).toBe('SECURITY');
    expect(doc?.facilityId).toBe('fac-b');
  });

  // 3. Emits and persists entity lifecycle events (GRN_CREATED, DELIVERY_ISSUED)
  it('emits and persists entity lifecycle events', async () => {
    await auditService.log({
      eventType: 'GRN_CREATED',
      severity: 'INFO',
      facilityId: 'fac-1',
      userId: 'usr-op',
      username: 'op',
      userRole: 'OPERATOR',
      resource: 'grn',
      resourceId: 'grn-101',
      details: { grnNumber: 'GRN-2026-0001', bags: 100 },
    });

    await auditService.log({
      eventType: 'DELIVERY_ISSUED',
      severity: 'INFO',
      facilityId: 'fac-1',
      userId: 'usr-op',
      username: 'op',
      userRole: 'OPERATOR',
      resource: 'delivery',
      resourceId: 'chl-201',
      details: { challanNumber: 'CHL-2026-0001', totalBags: 30 },
    });

    const grnLog = await AuditLogModel.findOne({ eventType: 'GRN_CREATED' }).lean();
    expect(grnLog?.resourceId).toBe('grn-101');
    const chlLog = await AuditLogModel.findOne({ eventType: 'DELIVERY_ISSUED' }).lean();
    expect(chlLog?.resourceId).toBe('chl-201');
  });

  // 4. Correctly filters audit logs by facilityId for facility-scoped administrators
  it('correctly filters audit logs by facilityId for facility-scoped administrators', async () => {
    await auditService.log({
      eventType: 'GRN_CREATED',
      severity: 'INFO',
      facilityId: 'fac-alpha',
      resource: 'grn',
      resourceId: 'grn-a',
    });
    await auditService.log({
      eventType: 'GRN_CREATED',
      severity: 'INFO',
      facilityId: 'fac-beta',
      resource: 'grn',
      resourceId: 'grn-b',
    });

    // Admin assigned to fac-alpha
    const res = await auditService.queryLogs({ page: 1, limit: 10 }, ['fac-alpha']);
    expect(res.totalCount).toBe(1);
    expect(res.logs[0].facilityId).toBe('fac-alpha');
  });

  // 5. Blocks facility-scoped administrators from querying audit records of unassigned facilities
  it('blocks facility-scoped administrators from querying audit records of unassigned facilities', async () => {
    await expect(
      auditService.queryLogs({ facilityId: 'fac-unassigned', page: 1, limit: 10 }, ['fac-alpha']),
    ).rejects.toThrow(/ACCESS_DENIED/i);
  });

  // 6. Allows SUPER_ADMIN to query audit logs across all facilities and global events
  it('allows SUPER_ADMIN to query audit logs across all facilities and global events', async () => {
    await auditService.log({
      eventType: 'SETTINGS_UPDATED',
      severity: 'WARN',
      facilityId: null, // global
      resource: 'settings',
    });
    await auditService.log({
      eventType: 'GRN_CREATED',
      severity: 'INFO',
      facilityId: 'fac-1',
      resource: 'grn',
    });

    // authorizedFacilityIds = null signifies SUPER_ADMIN
    const res = await auditService.queryLogs({ page: 1, limit: 10 }, null);
    expect(res.totalCount).toBe(2);
  });

  // 7. Correctly filters logs by timestamp range (from and to)
  it('correctly filters logs by timestamp range', async () => {
    // Manually create with specific timestamps
    await AuditLogModel.collection.insertMany([
      {
        id: 'log_day1',
        timestamp: new Date('2026-10-01T10:00:00Z'),
        eventType: 'GRN_CREATED',
        severity: 'INFO',
        facilityId: 'fac-1',
        userId: 'u1',
        username: 'u1',
        userRole: 'OPERATOR',
        ipAddress: '127.0.0.1',
        userAgent: 'Test',
        resource: 'grn',
        resourceId: 'g1',
        details: {},
        createdAt: new Date(),
      },
      {
        id: 'log_day2',
        timestamp: new Date('2026-10-05T10:00:00Z'),
        eventType: 'GRN_CREATED',
        severity: 'INFO',
        facilityId: 'fac-1',
        userId: 'u1',
        username: 'u1',
        userRole: 'OPERATOR',
        ipAddress: '127.0.0.1',
        userAgent: 'Test',
        resource: 'grn',
        resourceId: 'g2',
        details: {},
        createdAt: new Date(),
      },
    ]);

    const res = await auditService.queryLogs(
      {
        from: '2026-10-01T00:00:00Z',
        to: '2026-10-02T23:59:59Z',
        page: 1,
        limit: 10,
      },
      null,
    );

    expect(res.totalCount).toBe(1);
    expect(res.logs[0].id).toBe('log_day1');
  });

  // 8. Correctly filters logs by eventType and severity
  it('correctly filters logs by eventType and severity', async () => {
    await auditService.log({
      eventType: 'AUTH_LOGIN_FAILED',
      severity: 'SECURITY',
      resource: 'auth',
    });
    await auditService.log({
      eventType: 'GRN_CREATED',
      severity: 'INFO',
      resource: 'grn',
    });

    const res = await auditService.queryLogs(
      { eventType: 'AUTH_LOGIN_FAILED', severity: 'SECURITY', page: 1, limit: 10 },
      null,
    );
    expect(res.totalCount).toBe(1);
    expect(res.logs[0].eventType).toBe('AUTH_LOGIN_FAILED');
  });

  // 9. Automatically redacts sensitive fields (passwords, tokens) before persistence
  it('automatically redacts sensitive fields before persistence', async () => {
    await auditService.log({
      eventType: 'AUTH_LOGIN_FAILED',
      severity: 'WARN',
      resource: 'auth',
      details: {
        username: 'attempted_user',
        password: 'PlainSecretPassword123!',
        token: 'eyJh...jwtToken...',
        nested: {
          refreshToken: 'refresh-abc-123',
          safeKey: 'ok-data',
        },
      },
    });

    const log = await AuditLogModel.findOne({ eventType: 'AUTH_LOGIN_FAILED' }).lean();
    const details = log?.details as Record<string, unknown>;
    expect(details.password).toBe('[REDACTED]');
    expect(details.token).toBe('[REDACTED]');
    const nested = details.nested as Record<string, unknown>;
    expect(nested.refreshToken).toBe('[REDACTED]');
    expect(nested.safeKey).toBe('ok-data');
  });

  // 10. Returns correct pagination metadata (totalCount, page, totalPages)
  it('returns correct pagination metadata', async () => {
    const records = Array.from({ length: 15 }, (_, i) => ({
      id: `audit_pag_${i}`,
      timestamp: new Date(Date.now() - i * 1000),
      eventType: 'GRN_CREATED' as const,
      severity: 'INFO' as const,
      facilityId: 'fac-1',
      userId: 'u1',
      username: 'u1',
      userRole: 'OPERATOR' as const,
      ipAddress: '127.0.0.1',
      userAgent: 'Test',
      resource: 'grn',
      resourceId: `g-${i}`,
      details: {},
      createdAt: new Date(),
    }));

    await AuditLogModel.collection.insertMany(records);

    const res = await auditService.queryLogs({ page: 2, limit: 5 }, null);
    expect(res.totalCount).toBe(15);
    expect(res.page).toBe(2);
    expect(res.limit).toBe(5);
    expect(res.totalPages).toBe(3);
    expect(res.logs.length).toBe(5);
  });
});
