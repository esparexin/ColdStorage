import { promises as fs } from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { CommodityModel } from '../../database/models/commodity.model.js';
import { CounterModel } from '../../database/models/counter.model.js';
import { CustomerModel } from '../../database/models/customer.model.js';
import { FacilityModel } from '../../database/models/facility.model.js';
import { SystemSettingsModel } from '../../database/models/system-settings.model.js';
import { collectBackupEntities } from '../../modules/backup/backup-collector.js';
import { encryptBackupPayload } from '../../modules/backup/backup-crypto.js';

export const ROUNDTRIP_KEY = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
export const ROUNDTRIP_BACKUP_ID = 'bkp-roundtrip-1';

export const RT = {
  facilityId: 'fac-rt-1',
  customerId: 'cust-rt-1',
  commodityId: 'cmd-rt-1',
  rentPaymentId: 'rpay-rt-1',
  auditLogId: 'aud-rt-1',
} as const;

/**
 * Removes ONLY the rows the round-trip suite seeds.
 *
 * A blanket wipe of all 17 collections is not safe: the suite shares
 * `cold_storage_test` with the other backup tests and vitest may run files
 * concurrently, so a full delete would destroy rows another file relies on.
 * Deleting by the specific seeded ids keeps the proof intact - a restore still
 * has to re-insert the documents - without collateral damage.
 *
 * BackupLog, RentPayment and AuditLog go through the NATIVE driver:
 * RentPaymentModel and AuditLogModel register blocking hooks that prohibit
 * deleteMany through the model. The same bypass is documented in
 * `reset-orphaned-stock.ts`.
 */
export async function wipeSeededRows(): Promise<void> {
  await FacilityModel.deleteMany({ id: RT.facilityId }).exec();
  await CustomerModel.deleteMany({ id: RT.customerId }).exec();
  await CommodityModel.deleteMany({ id: RT.commodityId }).exec();
  await CounterModel.deleteMany({ facilityId: RT.facilityId }).exec();
  await mongoose.connection
    .collection(SystemSettingsModel.collection.collectionName)
    .deleteMany({ _id: 'SYSTEM_SETTINGS' } as never);
  await mongoose.connection.collection('rentpayments').deleteMany({ id: RT.rentPaymentId });
  await mongoose.connection.collection('auditlogs').deleteMany({ id: RT.auditLogId });
}

/**
 * Clears the registered archive row between tests.
 *
 * Kept separate from {@link wipeSeededRows} because a test writes the archive
 * and then wipes the seeded rows to prove the restore re-inserts them; wiping
 * the BackupLog there would delete the archive the restore is about to read.
 */
export async function wipeArchiveRow(): Promise<void> {
  await mongoose.connection.collection('backuplogs').deleteMany({ id: ROUNDTRIP_BACKUP_ID });
}

/** Seeds one document into the identity-strategy-sensitive collections. */
export async function seedRoundtripRows(): Promise<void> {
  await SystemSettingsModel.create({
    _id: 'SYSTEM_SETTINGS',
    orgName: 'Roundtrip Org',
    gstin: '27AAAAA0000A1Z5',
  } as never);
  await FacilityModel.create({
    id: RT.facilityId,
    name: 'RT Facility',
    code: 'RT1',
  } as never);
  await CustomerModel.create({
    id: RT.customerId,
    name: 'RT Customer',
    facilityIds: [RT.facilityId],
  } as never);
  await CommodityModel.create({
    id: RT.commodityId,
    name: 'RT Commodity',
    normalizedName: 'rt commodity',
  } as never);
  // Counter declares no `id`; its natural key is the compound tuple.
  await CounterModel.create({
    facilityId: RT.facilityId,
    counterType: 'CHALLAN',
    financialYear: '2026-27',
    lastSequence: 7,
  } as never);
}

/** Collects, encrypts and writes a real archive, then registers its BackupLog row. */
export async function writeArchive(
  storageDir: string,
  extraSeeds?: () => Promise<void>,
): Promise<void> {
  if (extraSeeds) await extraSeeds();
  const entities = await collectBackupEntities();
  const { finalArchive: archive, checksum } = encryptBackupPayload(
    Buffer.from(
      JSON.stringify({
        metadata: {
          format: 'COLD_STORAGE_BACKUP',
          version: '1',
          createdAt: new Date().toISOString(),
        },
        entities,
      }),
    ),
    Buffer.from(ROUNDTRIP_KEY, 'hex'),
  );
  const location = path.join(storageDir, `${ROUNDTRIP_BACKUP_ID}.enc`);
  await fs.writeFile(location, archive);
  await mongoose.connection.collection('backuplogs').updateOne(
    { id: ROUNDTRIP_BACKUP_ID },
    {
      $set: {
        backupType: 'MANUAL',
        status: 'COMPLETED',
        sizeBytes: archive.length,
        storageLocation: location,
        retentionExpiresAt: new Date(Date.now() + 7 * 86400000),
        triggeredBy: 'user-rt',
        checksum,
      },
    },
    { upsert: true },
  );
}

export function makeStorageDir(): Promise<string> {
  const dir = path.resolve(process.cwd(), 'storage', 'backups');
  return fs.mkdir(dir, { recursive: true }).then(() => dir);
}
