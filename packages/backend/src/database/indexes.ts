import mongoose, { type Model } from 'mongoose';
import { AssetModel } from './models/asset.model.js';
import { AuditLogModel } from './models/audit-log.model.js';
import { BackupLogModel } from './models/backup-log.model.js';
import { CommodityModel } from './models/commodity.model.js';
import { CommodityRateModel } from './models/commodity-rate.model.js';
import { CounterModel } from './models/counter.model.js';
import { CustomerModel } from './models/customer.model.js';
import { DeliveryChallanModel } from './models/delivery-challan.model.js';
import { DeliveryReversalModel } from './models/delivery-reversal.model.js';
import { FacilityModel } from './models/facility.model.js';
import { GrnModel } from './models/grn.model.js';
import { GroupModel } from './models/group.model.js';
import { InternalMovementModel } from './models/internal-movement.model.js';
import { InventoryTransactionModel } from './models/inventory-transaction.model.js';
import { RentExtensionModel } from './models/rent-extension.model.js';
import { RentPaymentModel } from './models/rent-payment.model.js';
import { RoleModel } from './models/role.model.js';
import { SessionModel } from './models/session.model.js';
import { SystemSettingsModel } from './models/system-settings.model.js';
import { UserModel } from './models/user.model.js';

export interface ModelIndexReport {
  modelName: string;
  totalIndexes: number;
  compoundIndexes: Array<Record<string, number | string>>;
  singleFieldIndexes: string[];
  isCompliant: boolean;
}

const MONITORED_MODELS: Array<{ name: string; model: Model<unknown> }> = [
  { name: 'Asset', model: AssetModel as unknown as Model<unknown> },
  { name: 'AuditLog', model: AuditLogModel as unknown as Model<unknown> },
  { name: 'BackupLog', model: BackupLogModel as unknown as Model<unknown> },
  { name: 'Commodity', model: CommodityModel as unknown as Model<unknown> },
  { name: 'CommodityRate', model: CommodityRateModel as unknown as Model<unknown> },
  { name: 'Counter', model: CounterModel as unknown as Model<unknown> },
  { name: 'Customer', model: CustomerModel as unknown as Model<unknown> },
  { name: 'DeliveryChallan', model: DeliveryChallanModel as unknown as Model<unknown> },
  { name: 'DeliveryReversal', model: DeliveryReversalModel as unknown as Model<unknown> },
  { name: 'Facility', model: FacilityModel as unknown as Model<unknown> },
  // Display label 'GRN' maps to GrnModel/mongoose name 'Grn' (collection grns); kept for logs.
  { name: 'GRN', model: GrnModel as unknown as Model<unknown> },
  { name: 'Group', model: GroupModel as unknown as Model<unknown> },
  { name: 'InternalMovement', model: InternalMovementModel as unknown as Model<unknown> },
  { name: 'InventoryTransaction', model: InventoryTransactionModel as unknown as Model<unknown> },
  { name: 'RentExtension', model: RentExtensionModel as unknown as Model<unknown> },
  { name: 'RentPayment', model: RentPaymentModel as unknown as Model<unknown> },
  { name: 'Role', model: RoleModel as unknown as Model<unknown> },
  { name: 'Session', model: SessionModel as unknown as Model<unknown> },
  { name: 'SystemSettings', model: SystemSettingsModel as unknown as Model<unknown> },
  { name: 'User', model: UserModel as unknown as Model<unknown> },
];

/**
 * Read-only index declaration verification utility.
 * Inspects all schema index definitions in memory without issuing index build
 * or mutation commands (such as syncIndexes or createIndex) against the database.
 */
export function verifyIndexDeclarations(): ModelIndexReport[] {
  return MONITORED_MODELS.map(({ name, model }) => {
    const schema = model.schema;
    const compoundIndexes = schema
      .indexes()
      .map(([fields]) => fields as Record<string, number | string>);

    const singleFieldIndexes: string[] = ['_id'];
    schema.eachPath((path, schemaType) => {
      if (path === '_id') return;
      const options = (schemaType as { options?: { index?: unknown; unique?: unknown } }).options;
      if (options && (options.index || options.unique)) {
        singleFieldIndexes.push(path);
      }
    });

    const totalIndexes = compoundIndexes.length + singleFieldIndexes.length;

    return {
      modelName: name,
      totalIndexes,
      compoundIndexes,
      singleFieldIndexes,
      isCompliant: totalIndexes > 0,
    };
  });
}

/**
 * Read-only database index inspector.
 * Inspects actual existing indexes on active MongoDB collections via read-only collection.indexes().
 * Strictly NEVER executes createIndex, dropIndex, or syncIndexes.
 * Pass `modelNames` to inspect a subset (e.g. per-endpoint checks); defaults to all monitored models.
 */
type LiveIndexEntry = { name: string; key: Record<string, unknown> };

export async function inspectDatabaseIndexesReadOnly(
  connection: mongoose.Connection,
  modelNames?: string[],
): Promise<Record<string, LiveIndexEntry[]>> {
  const result: Record<string, LiveIndexEntry[]> = {};
  const targets = modelNames && modelNames.length > 0
    ? MONITORED_MODELS.filter(({ name }) => modelNames.includes(name))
    : MONITORED_MODELS;

  for (const { name, model } of targets) {
    const collectionName = model.collection.name;
    try {
      const collection = connection.collection(collectionName);
      const indexes = await collection.indexes();
      result[name] = indexes.map((idx) => ({
        name: idx.name || 'unnamed',
        key: idx.key as Record<string, unknown>,
      }));
    } catch {
      result[name] = [];
    }
  }

  return result;
}

/**
 * Required uniqueness enforcement for duplicate-GRN prevention, mirroring the
 * unique indexes declared on the Grn schema. Compared against live index
 * metadata only — this function never touches the database.
 */
export const REQUIRED_GRN_UNIQUE_INDEX_KEYS: Array<Record<string, number>> = [
  { facilityId: 1, grnNumber: 1 },
  { facilityId: 1, inwardReceiptNumber: 1 },
];

function indexKeySignature(key: Record<string, unknown>): string {
  return JSON.stringify(Object.entries(key));
}

function requiredIndexLabel(key: Record<string, number>): string {
  return Object.entries(key)
    .map(([field, order]) => `${field}_${order}`)
    .join('_');
}

/**
 * Returns the readable names (e.g. `facilityId_1_grnNumber_1`) of required GRN
 * uniqueness indexes absent from live metadata. Empty means enforcement is present.
 * Unknown/extra indexes are ignored; a failed inspection reports all-missing so
 * absence of evidence is never reported as compliance.
 */
export function findMissingGrnUniqueIndexes(
  liveGrnIndexes: Array<{ name: string; key: Record<string, unknown> }> | null | undefined,
): string[] {
  if (!liveGrnIndexes) {
    return REQUIRED_GRN_UNIQUE_INDEX_KEYS.map(requiredIndexLabel);
  }
  const live = new Set(liveGrnIndexes.map((idx) => indexKeySignature(idx.key)));
  return REQUIRED_GRN_UNIQUE_INDEX_KEYS.filter((key) => !live.has(indexKeySignature(key))).map(
    requiredIndexLabel,
  );
}

