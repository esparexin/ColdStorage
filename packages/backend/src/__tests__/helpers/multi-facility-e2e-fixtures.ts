import mongoose from 'mongoose';
import { BackupLogModel } from '../../database/models/backup-log.model.js';
import { CommodityModel } from '../../database/models/commodity.model.js';
import { CounterModel } from '../../database/models/counter.model.js';
import { CustomerModel } from '../../database/models/customer.model.js';
import { DeliveryChallanModel } from '../../database/models/delivery-challan.model.js';
import { DeliveryReversalModel } from '../../database/models/delivery-reversal.model.js';
import { FacilityModel } from '../../database/models/facility.model.js';
import { GrnModel } from '../../database/models/grn.model.js';
import { InventoryTransactionModel } from '../../database/models/inventory-transaction.model.js';
import { PutAwayAllocationModel } from '../../database/models/put-away.model.js';
import { UserModel } from '../../database/models/user.model.js';
import { config } from '../../config.js';
import { createAuthSeeder } from './auth-fixtures.js';
import { seedCustomer, seedFacility } from './master-data-fixtures.js';

/**
 * Two-tenant scenario shared by the Phase 11 end-to-end suites.
 *
 * Facility is the only tenancy boundary now that chamber is free text, so a scenario is just
 * two facilities, one customer each, one shared commodity and a user per role per facility.
 * `prefix` keeps ids, codes and usernames disjoint between suites that share one database.
 */
export interface MultiFacilityScenario {
  prefix: string;
  facilityA: string;
  facilityB: string;
  commodityId: string;
  customerA: string;
  customerB: string;
  userIds: string[];
  tokens: {
    superAdmin: string;
    adminA: string;
    operatorA: string;
    operatorB: string;
  };
}

export async function seedMultiFacilityScenario(prefix: string): Promise<MultiFacilityScenario> {
  const facilityA = await seedFacility({
    id: `fac-${prefix}-alpha`,
    name: `Facility ${prefix.toUpperCase()} Alpha`,
    code: `${prefix.toUpperCase()}-A`,
  });
  const facilityB = await seedFacility({
    id: `fac-${prefix}-beta`,
    name: `Facility ${prefix.toUpperCase()} Beta`,
    code: `${prefix.toUpperCase()}-B`,
  });

  const commodityId = `cmd-${prefix}-potato`;
  await CommodityModel.findOneAndUpdate(
    { id: commodityId },
    {
      $set: {
        name: `${prefix} Seed Potato`,
        normalizedName: `${prefix} seed potato`,
        isActive: true,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).exec();

  const customerA = await seedCustomer({
    id: `cust-${prefix}-alpha`,
    name: `${prefix.toUpperCase()} Alpha Farmer`,
    facilityId: facilityA,
  });
  const customerB = await seedCustomer({
    id: `cust-${prefix}-beta`,
    name: `${prefix.toUpperCase()} Beta Farmer`,
    facilityId: facilityB,
  });

  const seedUser = createAuthSeeder(config.jwtSecret);
  const superId = `usr-${prefix}-super`;
  const adminAId = `usr-${prefix}-admin-a`;
  const operatorAId = `usr-${prefix}-op-a`;
  const operatorBId = `usr-${prefix}-op-b`;

  const [{ token: superAdmin }, { token: adminA }, { token: operatorA }, { token: operatorB }] =
    await Promise.all([
      seedUser({
        userId: superId,
        username: `${prefix}_superadmin`,
        role: 'SUPER_ADMIN',
        facilityIds: [],
      }),
      seedUser({
        userId: adminAId,
        username: `${prefix}_admin_a`,
        role: 'ADMIN',
        facilityIds: [facilityA],
      }),
      seedUser({
        userId: operatorAId,
        username: `${prefix}_op_a`,
        role: 'OPERATOR',
        facilityIds: [facilityA],
      }),
      seedUser({
        userId: operatorBId,
        username: `${prefix}_op_b`,
        role: 'OPERATOR',
        facilityIds: [facilityB],
      }),
    ]);

  return {
    prefix,
    facilityA,
    facilityB,
    commodityId,
    customerA,
    customerB,
    userIds: [superId, adminAId, operatorAId, operatorBId],
    tokens: { superAdmin, adminA, operatorA, operatorB },
  };
}

/** Removes every document the scenario owns so suites stay order-independent and re-runnable. */
export async function cleanupMultiFacilityScenario(scenario: MultiFacilityScenario): Promise<void> {
  const facilityIds = [scenario.facilityA, scenario.facilityB];
  await FacilityModel.deleteMany({ id: { $in: facilityIds } });
  await CustomerModel.deleteMany({ id: { $in: [scenario.customerA, scenario.customerB] } });
  await CommodityModel.deleteMany({ id: scenario.commodityId });
  await GrnModel.deleteMany({ facilityId: { $in: facilityIds } });
  await PutAwayAllocationModel.deleteMany({ facilityId: { $in: facilityIds } });
  await InventoryTransactionModel.deleteMany({ facilityId: { $in: facilityIds } });
  await DeliveryChallanModel.deleteMany({ facilityId: { $in: facilityIds } });
  await DeliveryReversalModel.deleteMany({ facilityId: { $in: facilityIds } });
  await CounterModel.deleteMany({ facilityId: { $in: facilityIds } });
  // AuditLog is immutable through the model, so teardown goes straight to the collection.
  await mongoose.connection
    .collection('auditlogs')
    .deleteMany({ facilityId: { $in: facilityIds } });
  await mongoose.connection
    .collection('auditlogs')
    .deleteMany({ userId: { $in: scenario.userIds } });
  await BackupLogModel.deleteMany({ triggeredBy: { $in: scenario.userIds } });
  await UserModel.deleteMany({ id: { $in: scenario.userIds } });
}
