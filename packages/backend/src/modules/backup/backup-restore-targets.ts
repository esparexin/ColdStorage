import { AuditLogModel } from '../../database/models/audit-log.model.js';
import { AssetModel } from '../../database/models/asset.model.js';
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
 * Document identity strategy for a restored entity.
 *
 * `id`       - the business key on an `id`-bearing model (most models).
 * `_id`      - the fixed document identifier used by SystemSettings, whose
 *              schema declares no `id` field at all.
 * `compound` - the natural composite key, used by Counter, which also declares
 *              no `id` and is uniquely identified by
 *              `{ facilityId, counterType, financialYear }`.
 */
export type RestoreIdentity = 'id' | '_id' | 'compound';

/** Fields forming the natural key for models with no `id`. */
export const COMPOUND_IDENTITY_FIELDS = ['facilityId', 'counterType', 'financialYear'] as const;

/**
 * The only model capability a restore needs: an upsert by identity field.
 *
 * Declared structurally rather than as `Model<any, any, any>` so the restore
 * registry cannot pull in arbitrary model surface, and so the file passes
 * `--max-warnings=0` without an explicit-any escape hatch. Mongoose models are
 * structurally assignable to this via their `updateOne` overloads.
 */
export interface RestorableModel {
  updateOne(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    options: Record<string, unknown>,
  ): { exec(): Promise<unknown> };
}

export interface RestoreTarget {
  /** Mongoose model name, used in audit output. */
  readonly model: string;
  /** Key under `entities` in the archive, matching BACKUP_COLLECTOR_KEYS. */
  readonly key: string;
  readonly modelRef: RestorableModel;
  readonly identity: RestoreIdentity;
  /**
   * Write through the native driver collection instead of the model.
   *
   * `AuditLogModel` and `RentPaymentModel` register a blocking query hook that
   * throws on every `updateOne`, so a model-level restore of any archive
   * containing either collection aborts part-way. That is correct for ordinary
   * application writes — these are append-only by design — but a confirmed
   * disaster-recovery restore must be able to repopulate them, or it is not a
   * restore.
   *
   * The same bypass is used by `reset-orphaned-stock.ts`, which documents it.
   * A restore is a privileged, checksum-verified, explicitly confirmed and
   * separately audited operation, so the guard does not apply to it. The
   * native path cannot run Mongoose schema validators; the archived documents
   * were schema-valid when they were written.
   */
  readonly bypassImmutabilityGuard?: boolean;
}

/**
 * Restore targets: the explicit model <-> archive-key mapping.
 *
 * This replaces a naive derivation that lowercased the first character of the
 * model name and appended "s" (`SystemSettings` -> `systemSettingss`,
 * `Facility` -> `facilitys`, `Commodity` -> `commoditys`). None of those
 * matched the collector's camelCase keys, so 3 of 17 collections restored
 * nothing while the API still answered `200 "Restore complete"`. The three
 * were SystemSettings, Facility and Commodity: the organisation identity and
 * two of the three master-data collections.
 *
 * Keys are listed explicitly and in the same order as
 * `BACKUP_COLLECTOR_KEYS`; `backup-collector.coverage.test.ts` and
 * `scripts/check-backup-coverage.sh` enforce that bijection so the two lists
 * cannot drift apart again.
 *
 * Models are imported directly rather than resolved through
 * `mongoose.models[name]`, which silently returned undefined for any caller
 * that had not imported every route module and yielded 17 zero-counts.
 */
export const RESTORE_TARGETS: readonly RestoreTarget[] = [
  { model: 'SystemSettings', key: 'systemSettings', modelRef: SystemSettingsModel, identity: '_id' },
  { model: 'User', key: 'users', modelRef: UserModel, identity: 'id' },
  { model: 'Facility', key: 'facilities', modelRef: FacilityModel, identity: 'id' },
  { model: 'Customer', key: 'customers', modelRef: CustomerModel, identity: 'id' },
  { model: 'Commodity', key: 'commodities', modelRef: CommodityModel, identity: 'id' },
  { model: 'CommodityRate', key: 'commodityRates', modelRef: CommodityRateModel, identity: 'id' },
  { model: 'Grn', key: 'grns', modelRef: GrnModel, identity: 'id' },
  {
    model: 'InventoryTransaction',
    key: 'inventoryTransactions',
    modelRef: InventoryTransactionModel,
    identity: 'id',
  },
  {
    model: 'DeliveryChallan',
    key: 'deliveryChallans',
    modelRef: DeliveryChallanModel,
    identity: 'id',
  },
  {
    model: 'DeliveryReversal',
    key: 'deliveryReversals',
    modelRef: DeliveryReversalModel,
    identity: 'id',
  },
  {
    model: 'RentPayment',
    key: 'rentPayments',
    modelRef: RentPaymentModel,
    identity: 'id',
    bypassImmutabilityGuard: true,
  },
  { model: 'RentExtension', key: 'rentExtensions', modelRef: RentExtensionModel, identity: 'id' },
  { model: 'Asset', key: 'assets', modelRef: AssetModel, identity: 'id' },
  { model: 'Counter', key: 'counters', modelRef: CounterModel, identity: 'compound' },
  { model: 'Group', key: 'groups', modelRef: GroupModel, identity: 'id' },
  {
    model: 'InternalMovement',
    key: 'internalMovements',
    modelRef: InternalMovementModel,
    identity: 'id',
  },
  {
    model: 'AuditLog',
    key: 'auditLogs',
    modelRef: AuditLogModel,
    identity: 'id',
    bypassImmutabilityGuard: true,
  },
];