import { afterAll, afterEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { AuditLogModel } from '../database/models/audit-log.model.js';
import { auditService } from '../modules/audit/audit.service.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
} from './helpers/stock-reset.js';

/**
 * Regression guard for the audit-log read privilege boundary (W1.11).
 *
 * `getLogById` skipped its scope check whenever the record had no facilityId:
 *
 *   if (authorizedFacilityIds !== null && log.facilityId) { ... }
 *
 * Every global system event is written with `facilityId: null` - USER_CREATED,
 * USER_UPDATED, USER_PASSWORD_RESET, ROLE_*, SETTINGS_UPDATED,
 * BACKUP_TRIGGERED and all AUTH_* events. A facility-scoped ADMIN holds
 * `audit:view` but not `user:manage`, `role:manage`, `settings:manage` or
 * `backup:manage`, so it could read every SUPER_ADMIN-only administrative
 * event through GET /api/audit-logs/:id, including usernames, roles, IP
 * addresses, user agents and backup filenames.
 *
 * The list endpoint already restricted non-global readers to
 * `{ facilityId: { $in: authorizedFacilityIds } }`, which excludes null. The
 * two endpoints disagreed; this aligns the single-record path with the list.
 */
describe('getLogById facility scope', () => {
  afterEach(async () => {
    await mongoose.connection.collection('auditlogs').deleteMany({});
  });

  const base = {
    eventType: 'USER_PASSWORD_RESET',
    severity: 'SECURITY' as const,
    userId: 'usr-1',
    username: 'admin',
    userRole: 'SUPER_ADMIN',
    ipAddress: '10.0.0.1',
    userAgent: 'vitest',
    resource: 'user',
    resourceId: 'usr-1',
    timestamp: new Date(),
    details: {},
  };

  async function seed(id: string, facilityId: string | null): Promise<string> {
    await AuditLogModel.create({ ...base, id, facilityId } as never);
    return id;
  }

  it('denies a scoped reader access to a global (facilityId null) event', async () => {
    await connectToTestDatabase();
    const id = await seed('aud-global-1', null);

    await expect(auditService.getLogById(id, ['fac-a'])).rejects.toThrow(/ACCESS_DENIED/);
    await expect(auditService.getLogById(id, ['fac-b'])).rejects.toThrow(/ACCESS_DENIED/);
    await expect(auditService.getLogById(id, [])).rejects.toThrow(/ACCESS_DENIED/);
  });

  it('allows a globally authorized reader (null) to read a global event', async () => {
    await connectToTestDatabase();
    const id = await seed('aud-global-2', null);
    const log = await auditService.getLogById(id, null);
    expect(log?.id).toBe(id);
  });

  it('still allows a scoped reader access to its own facility event', async () => {
    await connectToTestDatabase();
    const id = await seed('aud-scoped-1', 'fac-a');
    const log = await auditService.getLogById(id, ['fac-a', 'fac-c']);
    expect(log?.id).toBe(id);
  });

  it('still denies a scoped reader access to another facility event', async () => {
    await connectToTestDatabase();
    const id = await seed('aud-scoped-2', 'fac-b');
    await expect(auditService.getLogById(id, ['fac-a'])).rejects.toThrow(/ACCESS_DENIED/);
  });

  it('returns null for an unknown id without leaking an access error', async () => {
    await connectToTestDatabase();
    expect(await auditService.getLogById('aud-missing', ['fac-a'])).toBeNull();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });
});
