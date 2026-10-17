import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { seedControllerRates } from './helpers/lifecycle-testkit.js';
import { GrnModel } from '../database/models/grn.model.js';
import { RentPaymentModel } from '../database/models/rent-payment.model.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import { connectToTestDatabase, disconnectTestDatabase, resetStockCollections } from './helpers/stock-reset.js';
import { rentService } from '../modules/rent/rent.service.js';

const app = createApp();
const seedAuth = createAuthSeeder(config.jwtSecret);
const facilityId = 'fac-merge-recon';

describe('Source GRN Financial Settlement & Carry-Forward Reconciliation', () => {
  let adminToken: string;
  let customerA: string;
  let commodityId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
    ({ token: adminToken } = await seedAuth({
      userId: 'usr-recon-admin',
      username: 'recon.admin',
      role: 'ADMIN',
      facilityIds: [facilityId],
    }));
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await seedControllerRates('cmd-paddy-recon');
    await mongoose.connection.collection('rentpayments').deleteMany({});
    await mongoose.connection.collection('internalmovements').deleteMany({});
    await seedFacility({ id: facilityId, code: 'RCF', name: 'Reconciliation Facility' });
    customerA = await seedCustomer({ id: 'cust-recon-a', facilityId, name: 'Penchaliah' });
    const cmd = await CommodityModel.create({ id: 'cmd-paddy-recon', name: 'Paddy', normalizedName: 'paddy', isActive: true });
    commodityId = cmd.id;
  });

  it('1. Fully paid source GRN: obligation ₹12,000, paid ₹12,000, balance ₹0, carried ₹0', async () => {
    const targetGrnId = await seedGrn({
      facilityId, customerId: customerA, customerName: 'Penchaliah', commodityId, commodityName: 'Paddy',
      chamber: 'CH-01', bags: 15, rentType: 'Seasonal', rentAmount: 3000, grnNumber: 'GRN-26-27-0031',
    });

    const sourceGrnId = await seedGrn({
      facilityId, customerId: customerA, customerName: 'Penchaliah', commodityId, commodityName: 'Paddy',
      chamber: 'CH-01', bags: 10, rentType: 'Seasonal', rentAmount: 12000, grnNumber: 'GRN-26-27-0030',
    });

    await RentPaymentModel.create({
      id: 'rp-src-full', facilityId, grnId: sourceGrnId, grnNumber: 'GRN-26-27-0030',
      receiptNumber: 'RCPT-FULL-01', amountPaid: 12000, paymentMode: 'Cash',
      paymentDate: new Date('2024-07-01'), createdBy: 'usr-recon-admin',
    });

    // Verify GET /rent/grn/:id summary reconciliation
    const summary = await rentService.getRentSummary(facilityId, sourceGrnId);
    expect(summary.totalDue).toBe(12000);
    expect(summary.totalPaid).toBe(12000);
    expect(summary.remainingBalance).toBe(0);
    expect(summary.paymentStatus).toBe('Settled');
    expect(summary.payments).toHaveLength(1);

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId,
        sourceGrnIds: [sourceGrnId],
        movementDate: new Date(),
        remarks: 'Stock consolidation: fully settled source lot',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Carried rent is ₹0; target continues its own 3000 rent
    expect(res.body.targetGrn.rentAmount).toBe(3000);
    expect(res.body.targetGrn.bags).toBe(25);

    const closedSource = await GrnModel.findOne({ id: sourceGrnId }).lean().exec();
    expect(closedSource?.status).toBe('CLOSED');
    expect(closedSource?.remarks).toContain('Rent Obligation ₹12000, Paid ₹12000, Pending ₹0 (Status: Settled)');
  });

  it('2. Partially paid source GRN: obligation ₹12,000, paid ₹4,000, balance ₹8,000, carried ₹8,000', async () => {
    const targetGrnId = await seedGrn({
      facilityId, customerId: customerA, customerName: 'Penchaliah', commodityId, commodityName: 'Paddy',
      chamber: 'CH-01', bags: 15, rentType: 'Seasonal', rentAmount: 3000, grnNumber: 'GRN-26-27-0032',
    });

    const sourceGrnId = await seedGrn({
      facilityId, customerId: customerA, customerName: 'Penchaliah', commodityId, commodityName: 'Paddy',
      chamber: 'CH-01', bags: 10, rentType: 'Seasonal', rentAmount: 12000, grnNumber: 'GRN-26-27-0033',
    });

    await RentPaymentModel.create({
      id: 'rp-src-part', facilityId, grnId: sourceGrnId, grnNumber: 'GRN-26-27-0033',
      receiptNumber: 'RCPT-PART-01', amountPaid: 4000, paymentMode: 'Cash',
      paymentDate: new Date('2024-07-01'), createdBy: 'usr-recon-admin',
    });

    const summary = await rentService.getRentSummary(facilityId, sourceGrnId);
    expect(summary.totalDue).toBe(12000);
    expect(summary.totalPaid).toBe(4000);
    expect(summary.remainingBalance).toBe(8000);
    expect(summary.paymentStatus).toBe('Not Settled');

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId,
        sourceGrnIds: [sourceGrnId],
        movementDate: new Date(),
        remarks: 'Merge partial lot into target',
      });

    expect(res.status).toBe(200);
    // 3000 target + 8000 carried pending = 11000
    expect(res.body.targetGrn.rentAmount).toBe(11000);
    expect(res.body.targetGrn.bags).toBe(25);

    const closedSource = await GrnModel.findOne({ id: sourceGrnId }).lean().exec();
    expect(closedSource?.remarks).toContain('Rent Obligation ₹12000, Paid ₹4000, Pending ₹8000 (Status: Not Settled)');
  });

  it('3. Unpaid source GRN: obligation ₹12,000, paid ₹0, balance ₹12,000, carried ₹12,000', async () => {
    const targetGrnId = await seedGrn({
      facilityId, customerId: customerA, customerName: 'Penchaliah', commodityId, commodityName: 'Paddy',
      chamber: 'CH-01', bags: 15, rentType: 'Seasonal', rentAmount: 3000, grnNumber: 'GRN-26-27-0034',
    });

    const sourceGrnId = await seedGrn({
      facilityId, customerId: customerA, customerName: 'Penchaliah', commodityId, commodityName: 'Paddy',
      chamber: 'CH-01', bags: 10, rentType: 'Seasonal', rentAmount: 12000, grnNumber: 'GRN-26-27-0035',
    });

    const summary = await rentService.getRentSummary(facilityId, sourceGrnId);
    expect(summary.totalDue).toBe(12000);
    expect(summary.totalPaid).toBe(0);
    expect(summary.remainingBalance).toBe(12000);
    expect(summary.paymentStatus).toBe('Not Settled');

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId,
        sourceGrnIds: [sourceGrnId],
        movementDate: new Date(),
        remarks: 'Merge unpaid lot into target',
      });

    expect(res.status).toBe(200);
    // 3000 target + 12000 carried = 15000
    expect(res.body.targetGrn.rentAmount).toBe(15000);

    const closedSource = await GrnModel.findOne({ id: sourceGrnId }).lean().exec();
    expect(closedSource?.remarks).toContain('Rent Obligation ₹12000, Paid ₹0, Pending ₹12000 (Status: Not Settled)');
  });

  it('4. Source GRN with initial rentAmount = 0 reconciles obligation with recorded payments', async () => {
    const targetGrnId = await seedGrn({
      facilityId, customerId: customerA, customerName: 'Penchaliah', commodityId, commodityName: 'Paddy',
      chamber: 'CH-01', bags: 15, rentType: 'Seasonal', rentAmount: 3000, grnNumber: 'GRN-26-27-0036',
    });

    // Inward lot with rentAmount 0 but recorded payment of 12000
    const sourceGrnId = await seedGrn({
      facilityId, customerId: customerA, customerName: 'Penchaliah', commodityId, commodityName: 'Paddy',
      chamber: 'CH-01', bags: 10, rentType: 'Seasonal', rentAmount: 0, grnNumber: 'GRN-26-27-0037',
    });

    await RentPaymentModel.create({
      id: 'rp-src-zero-reconcile', facilityId, grnId: sourceGrnId, grnNumber: 'GRN-26-27-0037',
      receiptNumber: 'RCPT-ZREC-01', amountPaid: 12000, paymentMode: 'Cash',
      paymentDate: new Date('2024-07-01'), createdBy: 'usr-recon-admin',
    });

    // Verified: buildRentSummary reconciles obligation to 12000 instead of reporting 0
    const summary = await rentService.getRentSummary(facilityId, sourceGrnId);
    expect(summary.totalDue).toBe(12000);
    expect(summary.totalPaid).toBe(12000);
    expect(summary.remainingBalance).toBe(0);
    expect(summary.paymentStatus).toBe('Settled');

    const res = await request(app)
      .post(`/api/facilities/${facilityId}/internal-movements/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetGrnId,
        sourceGrnIds: [sourceGrnId],
        movementDate: new Date(),
        remarks: 'Merge reconciled lot into target',
      });

    expect(res.status).toBe(200);
    expect(res.body.targetGrn.rentAmount).toBe(3000);

    const closedSource = await GrnModel.findOne({ id: sourceGrnId }).lean().exec();
    // Audit remarks must NOT say Rent Obligation ₹0 when ₹12,000 was paid
    expect(closedSource?.remarks).toContain('Rent Obligation ₹12000, Paid ₹12000, Pending ₹0 (Status: Settled)');
  });
});
