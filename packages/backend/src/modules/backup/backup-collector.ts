import { AuditLogModel } from '../../database/models/audit-log.model.js';
import { CommodityModel } from '../../database/models/commodity.model.js';
import { CounterModel } from '../../database/models/counter.model.js';
import { CustomerModel } from '../../database/models/customer.model.js';
import { DeliveryChallanModel } from '../../database/models/delivery-challan.model.js';
import { DeliveryReversalModel } from '../../database/models/delivery-reversal.model.js';
import { FacilityModel } from '../../database/models/facility.model.js';
import { GrnModel } from '../../database/models/grn.model.js';
import { InventoryTransactionModel } from '../../database/models/inventory-transaction.model.js';
import { PutAwayAllocationModel } from '../../database/models/put-away.model.js';
import { SystemSettingsModel } from '../../database/models/system-settings.model.js';
import { UserModel } from '../../database/models/user.model.js';

/**
 * Collects all business entities in dependency order.
 * Ephemeral session records and active JWT access tokens are strictly excluded.
 */
export async function collectBackupEntities(): Promise<Record<string, unknown>> {
  const [
    systemSettings,
    users,
    facilities,
    customers,
    commodities,
    grns,
    putAways,
    inventoryTransactions,
    deliveryChallans,
    deliveryReversals,
    counters,
    auditLogs,
  ] = await Promise.all([
    SystemSettingsModel.find().lean().exec(),
    UserModel.find().lean().exec(),
    FacilityModel.find().lean().exec(),
    CustomerModel.find().lean().exec(),
    CommodityModel.find().lean().exec(),
    GrnModel.find().lean().exec(),
    PutAwayAllocationModel.find().lean().exec(),
    InventoryTransactionModel.find().lean().exec(),
    DeliveryChallanModel.find().lean().exec(),
    DeliveryReversalModel.find().lean().exec(),
    CounterModel.find().lean().exec(),
    AuditLogModel.find().lean().exec(),
  ]);

  return {
    systemSettings,
    users,
    facilities,
    customers,
    commodities,
    grns,
    putAways,
    inventoryTransactions,
    deliveryChallans,
    deliveryReversals,
    counters,
    auditLogs,
  };
}
