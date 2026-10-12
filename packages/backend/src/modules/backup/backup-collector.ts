import { AssetModel } from '../../database/models/asset.model.js';
import { AuditLogModel } from '../../database/models/audit-log.model.js';
import { CommodityModel } from '../../database/models/commodity.model.js';
import { CommodityRateModel } from '../../database/models/commodity-rate.model.js';
import { CounterModel } from '../../database/models/counter.model.js';
import { CustomerModel } from '../../database/models/customer.model.js';
import { DeliveryChallanModel } from '../../database/models/delivery-challan.model.js';
import { DeliveryReversalModel } from '../../database/models/delivery-reversal.model.js';
import { FacilityModel } from '../../database/models/facility.model.js';
import { GrnModel } from '../../database/models/grn.model.js';
import { GroupModel } from '../../database/models/group.model.js';
import { InternalMovementModel } from '../../database/models/internal-movement.model.js';
import { InventoryTransactionModel } from '../../database/models/inventory-transaction.model.js';
import { RentExtensionModel } from '../../database/models/rent-extension.model.js';
import { RentPaymentModel } from '../../database/models/rent-payment.model.js';
import { SystemSettingsModel } from '../../database/models/system-settings.model.js';
import { UserModel } from '../../database/models/user.model.js';

/**
 * Collects all business entities in dependency order.
 *
 * Approved exclusions (documented, never silently omitted):
 * - Session records (ephemeral auth, Mongo SSOT) and active JWTs.
 * - BackupLog collection itself (avoids recursive growth).
 * - Role collection is seed-managed via code; roles are re-seeded on boot (see role.service).
 * - Cloudinary binaries: only AssetModel metadata is archived, not image bytes.
 *
 * Every other persisted business collection must appear here and in
 * `backup-collector.coverage.test.ts`. Commodity rates, groups, internal
 * movements and rent extensions were previously omitted (BKP-04).
 */
export const BACKUP_COLLECTOR_KEYS = [
  'systemSettings',
  'users',
  'facilities',
  'customers',
  'commodities',
  'commodityRates',
  'grns',
  'inventoryTransactions',
  'deliveryChallans',
  'deliveryReversals',
  'rentPayments',
  'rentExtensions',
  'assets',
  'counters',
  'groups',
  'internalMovements',
  'auditLogs',
] as const;

export async function collectBackupEntities(): Promise<Record<string, unknown>> {
  const [
    systemSettings,
    users,
    facilities,
    customers,
    commodities,
    commodityRates,
    grns,
    inventoryTransactions,
    deliveryChallans,
    deliveryReversals,
    rentPayments,
    rentExtensions,
    assets,
    counters,
    groups,
    internalMovements,
    auditLogs,
  ] = await Promise.all([
    SystemSettingsModel.find().lean().exec(),
    UserModel.find().lean().exec(),
    FacilityModel.find().lean().exec(),
    CustomerModel.find().lean().exec(),
    CommodityModel.find().lean().exec(),
    CommodityRateModel.find().lean().exec(),
    GrnModel.find().lean().exec(),
    InventoryTransactionModel.find().lean().exec(),
    DeliveryChallanModel.find().lean().exec(),
    DeliveryReversalModel.find().lean().exec(),
    RentPaymentModel.find().lean().exec(),
    RentExtensionModel.find().lean().exec(),
    AssetModel.find().lean().exec(),
    CounterModel.find().lean().exec(),
    GroupModel.find().lean().exec(),
    InternalMovementModel.find().lean().exec(),
    AuditLogModel.find().lean().exec(),
  ]);

  return {
    systemSettings,
    users,
    facilities,
    customers,
    commodities,
    commodityRates,
    grns,
    inventoryTransactions,
    deliveryChallans,
    deliveryReversals,
    rentPayments,
    rentExtensions,
    assets,
    counters,
    groups,
    internalMovements,
    auditLogs,
  };
}
