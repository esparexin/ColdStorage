import { AuditLogModel } from '../../database/models/audit-log.model.js';
import { FacilityModel } from '../../database/models/facility.model.js';
import { SystemSettingsModel } from '../../database/models/system-settings.model.js';
import { createAuthSeeder } from './auth-fixtures.js';

export interface AuditBackupTokens {
  superAdminToken: string;
  adminToken: string;
  operatorToken: string;
  readOnlyToken: string;
  mustChangePasswordToken: string;
}

export async function seedAuditBackupMasterData(facilityA: string, facilityB: string): Promise<void> {
  await FacilityModel.create([
    { id: facilityA, name: 'Facility A', code: 'FAC-A', address: 'Sector 1', isActive: true },
    { id: facilityB, name: 'Facility B', code: 'FAC-B', address: 'Sector 2', isActive: true },
  ]);

  await SystemSettingsModel.create({
    _id: 'SYSTEM_SETTINGS',
    orgName: 'Himalayan Cold Chains Pvt Ltd',
    address: 'Plot 42, Industrial Area, Parwanoo, HP',
    contact: '+91 1792 234567',
    timezone: 'Asia/Kolkata',
    backupPolicy: { retentionDays: 30, backupEnabled: true },
  });

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
}

export async function seedAuditBackupTokens(
  seed: ReturnType<typeof createAuthSeeder>,
  facilityA: string,
): Promise<AuditBackupTokens> {
  const { token: superAdminToken } = await seed({
    userId: 'audit-usr-sa',
    username: 'audit_superadmin',
    role: 'SUPER_ADMIN',
    facilityIds: [],
  });

  const { token: adminToken } = await seed({
    userId: 'audit-usr-adm',
    username: 'audit_admin',
    role: 'ADMIN',
    facilityIds: [facilityA],
  });

  const { token: operatorToken } = await seed({
    userId: 'audit-usr-op',
    username: 'audit_operator',
    role: 'OPERATOR',
    facilityIds: [facilityA],
  });

  const { token: readOnlyToken } = await seed({
    userId: 'audit-usr-ro',
    username: 'audit_readonly',
    role: 'READ_ONLY',
    facilityIds: [facilityA],
  });

  const { token: mustChangePasswordToken } = await seed({
    userId: 'audit-usr-mcp',
    username: 'audit_mustchange',
    role: 'SUPER_ADMIN',
    facilityIds: [],
    mustChangePassword: true,
  });

  return {
    superAdminToken,
    adminToken,
    operatorToken,
    readOnlyToken,
    mustChangePasswordToken,
  };
}
