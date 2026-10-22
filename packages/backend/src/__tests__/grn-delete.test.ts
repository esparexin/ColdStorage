import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { RentPaymentModel } from '../database/models/rent-payment.model.js';
import { RentExtensionModel } from '../database/models/rent-extension.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { DeliveryChallanModel } from '../database/models/delivery-challan.model.js';
import { DeliveryReversalModel } from '../database/models/delivery-reversal.model.js';
import { InternalMovementModel } from '../database/models/internal-movement.model.js';
import { AuditLogModel } from '../database/models/audit-log.model.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import { connectToTestDatabase, disconnectTestDatabase, resetStockCollections } from './helpers/stock-reset.js';

const app = createApp();
const seedAuth = createAuthSeeder(config.jwtSecret);
const facilityId = 'fac-grn-delete-test';

describe('GRN Delete (Testing Only)', () => {
  let adminToken: string;
  let customerId: string;
  let commodityId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
    ({ token: adminToken } = await seedAuth({
      userId: 'usr-grn-delete-admin',
      username: 'grn.delete.admin',
      role: 'ADMIN',
      facilityIds: [facilityId],
    }));
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await mongoose.connection.collection('rentpayments').deleteMany({});
    await mongoose.connection.collection('rentextensions').deleteMany({});
    await mongoose.connection.collection('internalmovements').deleteMany({});
    await mongoose.connection.collection('auditlogs').deleteMany({});
    await seedFacility({ id: facilityId, code: 'DLT', name: 'Delete Test Facility' });
    customerId = await seedCustomer({ id: 'cust-dlt-01', facilityId, name: 'Delete Test Customer' });
    const cmd = await CommodityModel.create({
      id: 'cmd-dlt-wheat', name: 'Wheat', normalizedName: 'wheat', isActive: true,
    });
    commodityId = cmd.id;
  });

  it('deletes a GRN with no dependencies successfully', async () => {
    const grnId = await seedGrn({
      facilityId, customerId, customerName: 'Delete Test Customer', commodityId, commodityName: 'Wheat',
      chamber: 'CH-01', bags: 100, bagType: 'S', rentType: 'Seasonal', rentAmount: 1000,
      grnNumber: '0040', date: new Date('2026-04-10'), smallBagPrice: 10, bigBagPrice: 10, bagPrice: 10,
    });

    const res = await request(app)
      .delete(`/api/facilities/${facilityId}/grns/${grnId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        grnId,
        confirmationToken: '0040',
        reason: 'Testing-only deletion of GRN 0040',
      });

    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
    expect(res.body.id).toBe(grnId);
    expect(res.body.grnNumber).toBe('0040');
    expect(res.body.auditLogged).toBe(true);
    expect(res.body.dependentRecords).toEqual({
      rentPayments: 0,
      rentExtensions: 0,
      inventoryTransactions: 1, // seedGrn creates an INWARD_PUTAWAY ledger row
      deliveryChallans: 0,
      deliveryReversals: 0,
      internalMovements: 0,
    });

    // Verify GRN is gone
    const deletedGrn = await GrnModel.findOne({ id: grnId }).lean().exec();
    expect(deletedGrn).toBeNull();
  });

  it('deletes a GRN with all dependent record types', async () => {
    const grnId = await seedGrn({
      facilityId, customerId, customerName: 'Delete Test Customer', commodityId, commodityName: 'Wheat',
      chamber: 'CH-01', bags: 100, bagType: 'S', rentType: 'Seasonal', rentAmount: 1000,
      grnNumber: '0041', date: new Date('2026-04-10'), smallBagPrice: 10, bigBagPrice: 10, bagPrice: 10,
    });

    // Create dependent records
    await RentPaymentModel.create({
      id: 'rp-dlt-01', facilityId, grnId, grnNumber: '0041',
      receiptNumber: 'RCP-DLT-01', amountPaid: 500, paymentMode: 'Cash',
      paymentDate: new Date(), createdBy: 'usr-grn-delete-admin',
    });
    await RentExtensionModel.create({
      id: 're-dlt-01', facilityId, grnId, grnNumber: '0041',
      seasonYear: 2026, period: 'JANUARY',
      snapshotDate: new Date('2026-01-01'), snapshotBags: 100,
      bagRate: 10, calculatedAmount: 1000, finalAmount: 1000,
      finalizedBy: 'usr-grn-delete-admin', finalizedAt: new Date(),
    });
    // Note: seedGrn already created an INWARD_PUTAWAY inventory transaction
    await DeliveryChallanModel.create({
      id: 'ch-dlt-01', facilityId, grnId, grnNumber: '0041',
      challanNumber: 'CH-DLT-01', date: new Date(),
      customerId, customerName: 'Delete Test Customer', commodityId, commodityName: 'Wheat',
      chamber: 'CH-01', smallBags: 50, bigBags: 0, status: 'REVERSED',
      issuedBy: 'usr-grn-delete-admin',
    });
    await DeliveryReversalModel.create({
      id: 'dr-dlt-01', facilityId, deliveryId: 'ch-dlt-01', challanNumber: 'CH-DLT-01',
      grnId, reason: 'Test reversal', reversedBy: 'usr-grn-delete-admin', reversedAt: new Date(),
    });
    await InternalMovementModel.create({
      id: 'mv-dlt-01', facilityId, movementType: 'MERGE', movementDate: new Date(),
      targetGrnId: null, targetGrnNumber: null, sourceGrnIds: [], sourceGrnNumbers: [],
      totalBagsMoved: 0, smallBagsMoved: 0, bigBagsMoved: 0, hamaliBags: 0, hamaliCharge: 0,
      grnId, grnNumber: '0041', financialSnapshot: {
        rentAmount: 0, totalPaid: 0, remainingBalance: 0, paymentStatus: 'Not Settled', hamaliAmount: 0,
      }, performedBy: 'usr-grn-delete-admin',
    });

    const res = await request(app)
      .delete(`/api/facilities/${facilityId}/grns/${grnId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        grnId,
        confirmationToken: '0041',
        reason: 'Delete GRN with all dependent records',
      });

    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
    expect(res.body.dependentRecords).toEqual({
      rentPayments: 1,
      rentExtensions: 1,
      inventoryTransactions: 1,
      deliveryChallans: 1,
      deliveryReversals: 1,
      internalMovements: 1,
    });

    // Verify all dependent records are gone
    expect(await RentPaymentModel.countDocuments({ grnId }).exec()).toBe(0);
    expect(await RentExtensionModel.countDocuments({ grnId }).exec()).toBe(0);
    expect(await InventoryTransactionModel.countDocuments({ grnId }).exec()).toBe(0);
    expect(await DeliveryChallanModel.countDocuments({ grnId }).exec()).toBe(0);
    expect(await DeliveryReversalModel.countDocuments({ grnId }).exec()).toBe(0);
    expect(await InternalMovementModel.countDocuments({ grnId }).exec()).toBe(0);

    // Verify audit log entry exists
    const auditEntries = await AuditLogModel.find({
      eventType: 'GRN_DELETED', resourceId: grnId,
    }).lean().exec();
    expect(auditEntries.length).toBe(1);
    expect(auditEntries[0].details.grnNumber).toBe('0041');
  });
});

