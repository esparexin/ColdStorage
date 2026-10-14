import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import type { BackupInspectResponse } from '@cold-storage/contracts';
import { config } from '../../config.js';
import { assertSafeDatabaseTarget } from '../../database/connection.js';
import { BackupLogModel } from '../../database/models/backup-log.model.js';
import { auditService } from '../audit/audit.service.js';
import { decryptBackupArchive, getValidEncryptionKey } from './backup-crypto.js';
import { COMPOUND_IDENTITY_FIELDS, RESTORE_TARGETS } from './backup-restore-targets.js';

const EXPECTED_FORMAT = 'COLD_STORAGE_BACKUP';

function sha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

export async function readBackupArchive(backupId: string): Promise<{ logId: string; buffer: Buffer }> {
  const log = await BackupLogModel.findOne({ id: backupId }).lean().exec();
  if (!log || log.status !== 'COMPLETED') {
    throw new Error('BACKUP_NOT_FOUND: completed backup with this id does not exist');
  }
  const buffer = await fs.readFile(log.storageLocation);
  if (log.checksum && sha256Hex(buffer) !== log.checksum) {
    throw new Error('ARCHIVE_CORRUPTED: checksum mismatch, refuse to serve');
  }
  return { logId: log.id, buffer };
}

export async function inspectBackup(
  backupId: string,
  overrideKey?: string,
): Promise<BackupInspectResponse> {
  const { buffer } = await readBackupArchive(backupId);
  const keyBuffer = getValidEncryptionKey(overrideKey);
  const payload = decryptBackupArchive(buffer, keyBuffer.toString('hex')) as {
    metadata?: { format?: string; version?: string; createdAt?: string };
    entities?: Record<string, unknown[]>;
  };
  if (payload.metadata?.format !== EXPECTED_FORMAT) {
    throw new Error('ARCHIVE_CORRUPTED: unexpected backup format');
  }
  const entities = payload.entities ?? {};
  const entityCounts: Record<string, number> = {};
  for (const [k, v] of Object.entries(entities)) {
    entityCounts[k] = Array.isArray(v) ? v.length : 0;
  }
  const log = await BackupLogModel.findOne({ id: backupId }).lean().exec();
  return {
    id: backupId,
    format: payload.metadata?.format ?? 'unknown',
    version: payload.metadata?.version ?? 'unknown',
    createdAt: payload.metadata?.createdAt ?? new Date(0).toISOString(),
    checksumMatch: log?.checksum ? sha256Hex(buffer) === log.checksum : false,
    entityCounts,
  };
}

export interface RestoreResult {
  backupId: string;
  dryRun: boolean;
  targetDatabase: string;
  entityCounts: Record<string, number>;
  upsertedCounts?: Record<string, number>;
}

/**
 * Full restore with safeguards (BKP-03).
 * - `confirm` must equal backupId (proves inspection).
 * - `assertSafeDatabaseTarget` always enforced; live cold_storage writes
 *   additionally require BACKUP_ALLOW_LIVE_RESTORE=true.
 * - Take a fresh backup before any non-dry-run restore (documented in runbook).
 * - Upsert by `id`, never drop collections.
 */
export async function restoreBackup(
  userId: string,
  input: { backupId: string; confirm: string; dryRun?: boolean; targetDatabase?: string },
  overrideKey?: string,
): Promise<RestoreResult> {
  const { backupId, confirm, dryRun = true, targetDatabase } = input;
  if (confirm !== backupId) {
    throw new Error('RESTORE_CONFIRM_MISMATCH: confirm must equal backupId');
  }
  const { buffer } = await readBackupArchive(backupId);
  const keyBuffer = getValidEncryptionKey(overrideKey);
  const payload = decryptBackupArchive(buffer, keyBuffer.toString('hex')) as {
    metadata?: { format?: string };
    entities?: Record<string, Array<Record<string, unknown>>>;
  };
  if (payload.metadata?.format !== EXPECTED_FORMAT) {
    throw new Error('ARCHIVE_CORRUPTED: unexpected backup format');
  }
  const currentDb = mongoose.connection.name || 'unknown';
  const targetDb = targetDatabase ?? currentDb;
  const mongoUri = config.mongoUri ?? '';
  assertSafeDatabaseTarget(mongoUri);
  if (targetDb === 'cold_storage' && !dryRun && config.backupAllowLiveRestore !== true) {
    throw new Error('RESTORE_LIVE_BLOCKED: set BACKUP_ALLOW_LIVE_RESTORE=true to write live DB');
  }
  if (targetDb !== currentDb && !dryRun) {
    throw new Error('RESTORE_TARGET_MISMATCH: non-dry-run restores must target the active DB');
  }
  const entities = payload.entities ?? {};
  const entityCounts: Record<string, number> = {};
  for (const [k, v] of Object.entries(entities)) {
    entityCounts[k] = Array.isArray(v) ? v.length : 0;
  }
  if (dryRun) {
    await auditService.log({
      eventType: 'BACKUP_TRIGGERED',
      severity: 'INFO',
      userId,
      resource: 'backup',
      resourceId: backupId,
      details: { restoreDryRun: true, entityCounts },
    });
    return { backupId, dryRun: true, targetDatabase: targetDb, entityCounts };
  }
  const upsertedCounts: Record<string, number> = {};
  // The restore writes to up to 17 collections. Without a transaction a
  // failure part-way through (for example the immutability guard on
  // RentPaymentModel, which throws for every updateOne including an upsert)
  // left the database partially restored with no compensating action and no
  // way back other than a separate backup. One transaction makes the whole
  // restore all-or-nothing.
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      for (const target of RESTORE_TARGETS) {
        const docs = entities[target.key];
        if (!Array.isArray(docs) || docs.length === 0) {
          upsertedCounts[target.key] = 0;
          continue;
        }
        const { modelRef, identity, key } = target;
        let upserted = 0;
        for (const doc of docs as Array<Record<string, unknown>>) {
          const { _id, __v, ...rest } = doc;
          void _id;
          void __v;

          let filter: Record<string, unknown>;
          if (identity === 'compound') {
            // No `id` on the model; the natural key is the composite tuple.
            filter = Object.fromEntries(
              COMPOUND_IDENTITY_FIELDS.map((f) => [f, doc[f] as unknown]),
            );
            if (COMPOUND_IDENTITY_FIELDS.some((f) => doc[f] === undefined)) continue;
          } else {
            const docId = doc[identity];
            if (typeof docId !== 'string' || !docId) continue;
            // SystemSettings has no `id`; its document key is the fixed _id.
            filter = { [identity]: docId };
          }

          if (target.bypassImmutabilityGuard) {
            // Native driver: the model's blocking immutability hook would
            // otherwise abort the whole (now transactional) restore. See
            // RESTORE_TARGETS.bypassImmutabilityGuard for the rationale.
            const collName = (modelRef as unknown as { collection: { collectionName: string } })
              .collection.collectionName;
            await mongoose.connection
              .collection(collName)
              .updateOne(filter as never, { $set: rest } as never, {
                upsert: true,
                session,
              } as never);
          } else {
            // runValidators was absent, so no schema validation ran on write
            // and an archive could insert documents the model itself would
            // have rejected (for example a DeliveryChallan with zero bags).
            await modelRef
              .updateOne(filter, { $set: rest }, {
                upsert: true,
                runValidators: true,
                session,
              })
              .exec();
          }
          upserted += 1;
        }
        upsertedCounts[key] = upserted;
      }
    });
  } finally {
    await session.endSession();
  }
  await auditService.log({
    eventType: 'BACKUP_TRIGGERED',
    severity: 'CRITICAL',
    userId,
    resource: 'backup',
    resourceId: backupId,
    details: { restoreDryRun: false, targetDatabase: targetDb, upsertedCounts },
  });
  return { backupId, dryRun: false, targetDatabase: targetDb, entityCounts, upsertedCounts };
}
