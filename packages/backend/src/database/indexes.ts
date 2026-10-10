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
import { InventoryTransactionModel } from './models/inventory-transaction.model.js';
import { RentExtensionModel } from './models/rent-extension.model.js';
import { RentPaymentModel } from './models/rent-payment.model.js';
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
  { name: 'GRN', model: GrnModel as unknown as Model<unknown> },
  { name: 'InventoryTransaction', model: InventoryTransactionModel as unknown as Model<unknown> },
  { name: 'RentExtension', model: RentExtensionModel as unknown as Model<unknown> },
  { name: 'RentPayment', model: RentPaymentModel as unknown as Model<unknown> },
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
 */
export async function inspectDatabaseIndexesReadOnly(
  connection: mongoose.Connection,
): Promise<Record<string, Array<{ name: string; key: Record<string, unknown> }>>> {
  const result: Record<string, Array<{ name: string; key: Record<string, unknown> }>> = {};

  for (const { name, model } of MONITORED_MODELS) {
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
