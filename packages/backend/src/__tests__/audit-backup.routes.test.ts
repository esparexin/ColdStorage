import { promises as fs } from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { AuditLogModel } from '../database/models/audit-log.model.js';
import { BackupLogModel } from '../database/models/backup-log.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { SystemSettingsModel } from '../database/models/system-settings.model.js';
import { UserModel } from '../database/models/user.model.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';

const app = createApp();

describe('P10 Audit & Backup Routes, Security & RBAC Integration Tests', () => {
  const facilityA = 'fac-audit-a';
  const facilityB = 'fac-audit-b';
  const validHexKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  let superAdminToken: string;
  let adminToken: string;
  let operatorToken: string;
  let readOnlyToken: string;
  let mustChangePasswordToken: string;

  const seed = createAuthSeeder(config.jwtSecret);

  beforeAll(async () => {
    process.env.BACKUP_ENCRYPTION_KEY = validHexKey;
    const mongoUri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/cold_storage_test';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }
  });

  afterAll(async () => {
    try {
      const storageDir = path.resolve(process.cwd(), 'storage');
      await fs.rm(storageDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  beforeEach(async () => {
    await mongoose.connection.collection('auditlogs').deleteMany({});
    await BackupLogModel.deleteMany({});
    await SystemSettingsModel.deleteMany({});
    await FacilityModel.deleteMany({});
    await UserModel.deleteMany({});

    // Seed facilities
    await FacilityModel.create([
      {
        id: facilityA,
        name: 'Facility A',
        code: 'FAC-A',
        address: 'Sector 1',
        isActive: true,
      },
      {
        id: facilityB,
        name: 'Facility B',
        code: 'FAC-B',
        address: 'Sector 2',
        isActive: true,
      },
    ]);

    // Seed settings singleton
    await SystemSettingsModel.create({
      _id: 'SYSTEM_SETTINGS',
      orgName: 'Himalayan Cold Chains Pvt Ltd',
      address: 'Plot 42, Industrial Area, Parwanoo, HP',
      contact: '+91 1792 234567',
      timezone: 'Asia/Kolkata',
      backupPolicy: {
        retentionDays: 30,
        backupEnabled: true,
      },
    });

    // Create tokens
    ({ token: superAdminToken } = await seed({
      userId: 'audit-usr-sa',
      username: 'audit_superadmin',
      role: 'SUPER_ADMIN',
      facilityIds: [],
    }));

    ({ token: adminToken } = await seed({
      userId: 'audit-usr-adm',
      username: 'audit_admin',
      role: 'ADMIN',
      facilityIds: [facilityA],
    }));

    ({ token: operatorToken } = await seed({
      userId: 'audit-usr-op',
      username: 'audit_operator',
      role: 'OPERATOR',
      facilityIds: [facilityA],
    }));

    ({ token: readOnlyToken } = await seed({
      userId: 'audit-usr-ro',
      username: 'audit_readonly',
      role: 'READ_ONLY',
      facilityIds: [facilityA],
    }));

    ({ token: mustChangePasswordToken } = await seed({
      userId: 'audit-usr-mcp',
      username: 'audit_mustchange',
      role: 'SUPER_ADMIN',
      facilityIds: [],
      mustChangePassword: true,
    }));

    // Seed sample audit logs
    await AuditLogModel.create([
      {
        id: 'aud-seed-1',
        timestamp: new Date('2026-10-01T10:00:00Z'),
        eventType: 'GRN_CREATED',
        severity: 'INFO',
        facilityId: facilityA,
        userId: 'audit-usr-op',
        username: 'audit_operator',
        userRole: 'OPERATOR',
        ipAddress: '127.0.0.1',
        userAgent: 'TestClient/1.0',
        resource: 'grn',
        resourceId: 'grn-1',
        details: { bags: 50 },
      },
      {
        id: 'aud-seed-2',
        timestamp: new Date('2026-10-01T11:00:00Z'),
        eventType: 'GRN_CREATED',
        severity: 'INFO',
        facilityId: facilityB,
        userId: 'audit-usr-adm2',
        username: 'admin2',
        userRole: 'ADMIN',
        ipAddress: '127.0.0.1',
        userAgent: 'TestClient/1.0',
        resource: 'grn',
        resourceId: 'grn-2',
        details: { bags: 75 },
      },
      {
        id: 'aud-seed-3',
        timestamp: new Date('2026-10-01T12:00:00Z'),
        eventType: 'AUTH_LOGIN_SUCCESS',
        severity: 'INFO',
        facilityId: null,
        userId: 'audit-usr-sa',
        username: 'audit_superadmin',
        userRole: 'SUPER_ADMIN',
        ipAddress: '127.0.0.1',
        userAgent: 'TestClient/1.0',
        resource: 'auth',
        resourceId: null,
        details: { method: 'password' },
      },
    ]);
  });

  it('1. returns 401 when unauthenticated on GET /api/audit-logs', async () => {
    const res = await request(app).get('/api/audit-logs');
    expect(res.status).toBe(401);
  });

  it('2. returns 401 when unauthenticated on POST /api/backups/trigger', async () => {
    const res = await request(app).post('/api/backups/trigger').send({});
    expect(res.status).toBe(401);
  });

  it('3. returns 403 when mustChangePassword = true on audit and backup routes', async () => {
    const auditRes = await request(app)
      .get('/api/audit-logs')
      .set('Authorization', `Bearer ${mustChangePasswordToken}`);
    expect(auditRes.status).toBe(403);
    expect(auditRes.body.error).toMatch(/password change/i);

    const backupRes = await request(app)
      .post('/api/backups/trigger')
      .set('Authorization', `Bearer ${mustChangePasswordToken}`)
      .send({});
    expect(backupRes.status).toBe(403);
    expect(backupRes.body.error).toMatch(/password change/i);
  });

  it('4. returns 403 when OPERATOR attempts GET /api/audit-logs (lacks audit:view)', async () => {
    const res = await request(app)
      .get('/api/audit-logs')
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/lacks permission 'audit:view'/);
  });

  it('5. returns 403 when READ_ONLY attempts GET /api/audit-logs', async () => {
    const res = await request(app)
      .get('/api/audit-logs')
      .set('Authorization', `Bearer ${readOnlyToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/lacks permission 'audit:view'/);
  });

  it('6. returns 403 when ADMIN attempts POST /api/backups/trigger (lacks backup:manage)', async () => {
    const res = await request(app)
      .post('/api/backups/trigger')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/lacks permission 'backup:manage'/);
  });

  it('7. returns 403 when ADMIN attempts to query audit logs for an unassigned facility', async () => {
    const res = await request(app)
      .get(`/api/audit-logs?facilityId=${facilityB}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not authorized to access facility/);
  });

  it('8. returns 200 with audit logs for ADMIN querying their assigned facility', async () => {
    const res = await request(app)
      .get(`/api/audit-logs?facilityId=${facilityA}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(1);
    expect(res.body.logs[0].facilityId).toBe(facilityA);
    expect(res.body.totalCount).toBe(1);
  });

  it('9. returns 200 with global audit logs for SUPER_ADMIN', async () => {
    const res = await request(app)
      .get('/api/audit-logs')
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(3);
    expect(res.body.totalCount).toBe(3);
  });

  it('10. returns 201 and triggers backup when called by SUPER_ADMIN on POST /api/backups/trigger', async () => {
    const res = await request(app)
      .post('/api/backups/trigger')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ backupType: 'MANUAL' });
    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Backup completed successfully');
    expect(res.body.backupLog).toBeDefined();
    expect(res.body.backupLog.status).toBe('COMPLETED');
    expect(res.body.backupLog.backupType).toBe('MANUAL');
    expect(res.body.filename).toMatch(/^backup_.*\.enc$/);
  });

  it('11. returns 200 with backup history list on GET /api/backups for SUPER_ADMIN', async () => {
    // Seed a backup record
    await BackupLogModel.create({
      id: 'bak-test-1',
      backupType: 'MANUAL',
      status: 'COMPLETED',
      sizeBytes: 1024,
      checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      storageLocation: 'backups/test.enc',
      retentionExpiresAt: new Date(Date.now() + 30 * 86400000),
      triggeredBy: 'usr-sa',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await request(app)
      .get('/api/backups')
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].id).toBe('bak-test-1');
  });

  it('12. returns 200 with backup status configuration projection on GET /api/backups/status', async () => {
    const res = await request(app)
      .get('/api/backups/status')
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);
    const archive = res.body.encryptedArchive;
    expect(archive).toBeDefined();
    expect(archive.enabled).toBe(true);
    expect(archive.retentionDays).toBe(30);
    // The projection reports only what this backend implements. There is no platform-managed
    // backup integration, so no such field is emitted.
    expect(res.body).not.toHaveProperty('atlasManagedBackup');
    expect(archive.totalCompletedBackups).toBeGreaterThanOrEqual(0);
  });
});
