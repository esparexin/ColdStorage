import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditLogModel } from '../database/models/audit-log.model.js';

describe('Suite 2: Audit Model Immutability — audit-log.model.test.ts', () => {
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

  // 1. Successfully persists valid audit log document
  it('successfully persists valid audit log document', async () => {
    const doc = await AuditLogModel.create({
      id: 'audit_test_1',
      timestamp: new Date('2026-10-01T10:00:00Z'),
      eventType: 'AUTH_LOGIN_SUCCESS',
      severity: 'INFO',
      facilityId: 'fac-1',
      userId: 'usr-1',
      username: 'harpreet_admin',
      userRole: 'ADMIN',
      ipAddress: '192.168.1.50',
      userAgent: 'Mozilla/5.0',
      resource: 'auth',
      resourceId: 'session-1',
      details: { client: 'web' },
    });

    expect(doc.id).toBe('audit_test_1');
    expect(doc.eventType).toBe('AUTH_LOGIN_SUCCESS');

    const found = await AuditLogModel.findOne({ id: 'audit_test_1' }).lean();
    expect(found).toBeDefined();
    expect(found?.username).toBe('harpreet_admin');
  });

  // 2. Rejects document modification via .updateOne() / .save()
  it('rejects document modification via .updateOne() and .save()', async () => {
    const doc = await AuditLogModel.create({
      id: 'audit_test_2',
      timestamp: new Date(),
      eventType: 'GRN_CREATED',
      severity: 'INFO',
      facilityId: 'fac-1',
      userId: 'usr-1',
      username: 'operator1',
      userRole: 'OPERATOR',
      ipAddress: '127.0.0.1',
      userAgent: 'Agent',
      resource: 'grn',
      resourceId: 'grn-1',
      details: {},
    });

    // Test query-level updateOne rejection
    await expect(
      AuditLogModel.updateOne({ id: 'audit_test_2' }, { $set: { username: 'tampered' } }),
    ).rejects.toThrow(/AUDIT_LOG_IMMUTABLE/i);

    // Test document-level save modification rejection
    doc.username = 'tampered';
    await expect(doc.save()).rejects.toThrow(/AUDIT_LOG_IMMUTABLE/i);
  });

  // 3. Rejects document deletion via .deleteOne() / .deleteMany() / .findOneAndDelete()
  it('rejects document deletion via delete operations', async () => {
    await AuditLogModel.create({
      id: 'audit_test_3',
      timestamp: new Date(),
      eventType: 'INVENTORY_PUTAWAY',
      severity: 'INFO',
      facilityId: 'fac-1',
      userId: 'usr-1',
      username: 'operator1',
      userRole: 'OPERATOR',
      ipAddress: '127.0.0.1',
      userAgent: 'Agent',
      resource: 'inventory',
      resourceId: 'pos-1',
      details: {},
    });

    await expect(AuditLogModel.deleteOne({ id: 'audit_test_3' })).rejects.toThrow(
      /AUDIT_LOG_IMMUTABLE/i,
    );
    await expect(AuditLogModel.deleteMany({ id: 'audit_test_3' })).rejects.toThrow(
      /AUDIT_LOG_IMMUTABLE/i,
    );
    await expect(AuditLogModel.findOneAndDelete({ id: 'audit_test_3' })).rejects.toThrow(
      /AUDIT_LOG_IMMUTABLE/i,
    );
  });

  // 4. Enforces indexed compound query paths
  it('enforces compound query paths for facility and eventType filters', async () => {
    await AuditLogModel.create([
      {
        id: 'audit_idx_1',
        timestamp: new Date('2026-10-01T08:00:00Z'),
        eventType: 'DELIVERY_ISSUED',
        severity: 'INFO',
        facilityId: 'fac-north',
        userId: 'usr-1',
        username: 'user1',
        userRole: 'OPERATOR',
        ipAddress: '127.0.0.1',
        userAgent: 'Agent',
        resource: 'delivery',
        resourceId: 'chl-1',
        details: {},
      },
      {
        id: 'audit_idx_2',
        timestamp: new Date('2026-10-01T09:00:00Z'),
        eventType: 'DELIVERY_REVERSED',
        severity: 'WARN',
        facilityId: 'fac-north',
        userId: 'usr-admin',
        username: 'admin1',
        userRole: 'ADMIN',
        ipAddress: '127.0.0.1',
        userAgent: 'Agent',
        resource: 'delivery',
        resourceId: 'chl-1',
        details: {},
      },
    ]);

    const results = await AuditLogModel.find({
      facilityId: 'fac-north',
      timestamp: { $gte: new Date('2026-10-01T07:00:00Z') },
    })
      .sort({ timestamp: -1 })
      .lean();

    expect(results.length).toBe(2);
    expect(results[0].id).toBe('audit_idx_2');
    expect(results[1].id).toBe('audit_idx_1');
  });

  // 5. Successfully stores sanitized structured details object without schema truncation
  it('successfully stores complex structured details object without truncation', async () => {
    const complexDetails = {
      orderId: 'ORD-999',
      positionsAllocated: [
        { code: 'CH1-R1-L1-P01', bags: 50 },
        { code: 'CH1-R1-L1-P02', bags: 50 },
      ],
      financialImpact: { rentTotal: 25000, currency: 'INR' },
      systemFlags: { verified: true, attempts: 1 },
    };

    const doc = await AuditLogModel.create({
      id: 'audit_complex_1',
      timestamp: new Date(),
      eventType: 'INVENTORY_PUTAWAY',
      severity: 'INFO',
      facilityId: 'fac-1',
      userId: 'usr-1',
      username: 'op1',
      userRole: 'OPERATOR',
      ipAddress: '127.0.0.1',
      userAgent: 'TestBrowser',
      resource: 'inventory',
      resourceId: 'alloc-1',
      details: complexDetails,
    });

    const retrieved = await AuditLogModel.findOne({ id: doc.id }).lean();
    expect(retrieved?.details).toEqual(complexDetails);
  });

  // 6. Correctly accepts facilityId: null for system-level and global authentication events
  it('correctly accepts facilityId: null for system-level and global events', async () => {
    const doc = await AuditLogModel.create({
      id: 'audit_global_1',
      timestamp: new Date(),
      eventType: 'SETTINGS_UPDATED',
      severity: 'WARN',
      facilityId: null,
      userId: 'usr-sa',
      username: 'superadmin',
      userRole: 'SUPER_ADMIN',
      ipAddress: '10.0.0.1',
      userAgent: 'OpsTool',
      resource: 'settings',
      resourceId: 'SYSTEM_SETTINGS',
      details: { modifiedKeys: ['timezone', 'backupPolicy'] },
    });

    expect(doc.facilityId).toBeNull();
    const found = await AuditLogModel.findOne({ id: 'audit_global_1' }).lean();
    expect(found?.facilityId).toBeNull();
  });
});
