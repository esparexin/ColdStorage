import { describe, expect, it } from 'vitest';
import {
  auditLogRecordSchema,
  auditQuerySchema,
  backupLogRecordSchema,
  backupStatusResponseSchema,
  backupTriggerSchema,
} from '../index.js';

describe('Suite 1: Contracts — audit-backup.contracts.test.ts', () => {
  // 1. Validates audit query schema with valid date range, pagination, and event types
  it('validates audit query schema with valid parameters', () => {
    const validQuery = {
      facilityId: 'fac-1',
      eventType: 'GRN_CREATED',
      severity: 'INFO',
      userId: 'usr-1',
      from: '2026-10-01T00:00:00.000Z',
      to: '2026-10-01T23:59:59.999Z',
      page: '2',
      limit: '25',
    };

    const parsed = auditQuerySchema.safeParse(validQuery);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.page).toBe(2);
      expect(parsed.data.limit).toBe(25);
      expect(parsed.data.eventType).toBe('GRN_CREATED');
    }
  });

  // 2. Rejects invalid audit query parameters (e.g. negative page, unknown severity)
  it('rejects invalid audit query parameters', () => {
    const invalidQuery = {
      page: -1,
      severity: 'UNKNOWN_SEVERITY',
      limit: 1000,
    };

    const parsed = auditQuerySchema.safeParse(invalidQuery);
    expect(parsed.success).toBe(false);
  });

  // 3. Validates audit log record DTO schema
  it('validates audit log record DTO schema with complete data', () => {
    const validLog = {
      id: 'audit_01H123456789',
      timestamp: new Date().toISOString(),
      eventType: 'AUTH_LOGIN_SUCCESS',
      severity: 'INFO',
      facilityId: 'fac-1',
      userId: 'usr-1',
      username: 'harpreet_admin',
      userRole: 'ADMIN',
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0 Chrome/120.0',
      resource: 'auth',
      resourceId: 'session-123',
      details: { method: 'password', mfa: false },
    };

    const parsed = auditLogRecordSchema.safeParse(validLog);
    expect(parsed.success).toBe(true);
  });

  // 4. Validates backup trigger request schema with valid type ('MANUAL')
  it('validates backup trigger request schema with valid manual type', () => {
    const defaultParsed = backupTriggerSchema.safeParse({});
    expect(defaultParsed.success).toBe(true);
    if (defaultParsed.success) {
      expect(defaultParsed.data.backupType).toBe('MANUAL');
    }

    const explicitParsed = backupTriggerSchema.safeParse({ backupType: 'MANUAL' });
    expect(explicitParsed.success).toBe(true);
  });

  // 5. Rejects backup trigger with invalid payload or unsupported type
  it('rejects backup trigger with invalid payload or unsupported type', () => {
    const invalidParsed = backupTriggerSchema.safeParse({ backupType: 'AUTOMATIC_UNSUPPORTED' });
    expect(invalidParsed.success).toBe(false);
  });

  // 6. Validates backup log record DTO schema
  it('validates backup log record DTO schema', () => {
    const validRecord = {
      id: 'backup_20261001_001',
      backupType: 'MANUAL',
      status: 'COMPLETED',
      sizeBytes: 1048576,
      checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      storageLocation: 'storage/backups/backup_20261001_001.enc',
      retentionExpiresAt: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
      triggeredBy: 'usr-superadmin',
      errorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const parsed = backupLogRecordSchema.safeParse(validRecord);
    expect(parsed.success).toBe(true);
  });

  // 7. Validates backup status projection schema
  it('validates backup status projection schema', () => {
    const validStatus = {
      atlasManagedBackup: {
        provider: 'MongoDB Atlas',
        retentionDays: 7,
        mode: 'PLATFORM_MANAGED',
        status: 'CONFIGURED',
      },
      applicationEncryptedBackup: {
        enabled: true,
        retentionDays: 30,
        lastBackupAt: new Date().toISOString(),
        lastBackupStatus: 'COMPLETED',
        totalCompletedBackups: 12,
      },
    };

    const parsed = backupStatusResponseSchema.safeParse(validStatus);
    expect(parsed.success).toBe(true);
  });

  // 8. Rejects audit record when mandatory fields are missing
  it('rejects audit record when mandatory fields are missing', () => {
    const invalidLog = {
      id: 'audit_incomplete',
      // missing timestamp, eventType, severity
      userId: 'usr-1',
    };

    const parsed = auditLogRecordSchema.safeParse(invalidLog);
    expect(parsed.success).toBe(false);
  });
});
