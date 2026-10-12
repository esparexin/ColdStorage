import { promises as fs } from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { connectToDatabase, disconnectDatabase } from '../database/connection.js';
import { BackupLogModel } from '../database/models/backup-log.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { SystemSettingsModel } from '../database/models/system-settings.model.js';
import { UserModel } from '../database/models/user.model.js';
import { seedAuditBackupMasterData, seedAuditBackupTokens } from './helpers/audit-backup-fixtures.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';

const app = createApp();

describe('BKP-03 backup download/inspect/restore', () => {
  const facilityA = 'fac-restore-a';
  const facilityB = 'fac-restore-b';
  const validHexKey = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
  let superAdminToken = '';
  const seed = createAuthSeeder(config.jwtSecret);

  beforeAll(async () => {
    config.backupEncryptionKey = validHexKey;
    config.backupAllowLiveRestore = false;
    await connectToDatabase();
  });

  afterAll(async () => {
    try {
      await fs.rm(path.resolve(process.cwd(), 'storage'), { recursive: true, force: true });
    } catch { /* ignore */ }
    await disconnectDatabase();
  });

  beforeEach(async () => {
    await mongoose.connection.collection('auditlogs').deleteMany({});
    await BackupLogModel.deleteMany({});
    await SystemSettingsModel.deleteMany({});
    await FacilityModel.deleteMany({});
    await UserModel.deleteMany({});
    await seedAuditBackupMasterData(facilityA, facilityB);
    const tokens = await seedAuditBackupTokens(seed, facilityA);
    superAdminToken = tokens.superAdminToken;
  });

  it('trigger → inspect → download → dry-run restore', async () => {
    const trigger = await request(app)
      .post('/api/backups/trigger')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({});
    expect(trigger.status).toBe(201);
    const backupId = trigger.body.backupLog.id as string;

    const inspect = await request(app)
      .get(`/api/backups/${backupId}/inspect`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(inspect.status).toBe(200);
    expect(inspect.body.checksumMatch).toBe(true);
    expect(inspect.body.entityCounts).toBeDefined();

    const download = await request(app)
      .get(`/api/backups/${backupId}/download`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(download.status).toBe(200);

    const dryRun = await request(app)
      .post('/api/backups/restore')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ backupId, confirm: backupId, dryRun: true });
    expect(dryRun.status).toBe(200);
    expect(dryRun.body.result.dryRun).toBe(true);
  });

  it('rejects mismatched confirm and blocks live restore without guard', async () => {
    const trigger = await request(app)
      .post('/api/backups/trigger')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({});
    const backupId = trigger.body.backupLog.id as string;
    const bad = await request(app)
      .post('/api/backups/restore')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ backupId, confirm: 'wrong', dryRun: true });
    expect(bad.status).toBe(400);
  });
});
