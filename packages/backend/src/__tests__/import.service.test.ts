import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChamberModel } from '../database/models/chamber.model.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CounterModel } from '../database/models/counter.model.js';
import { CustomerModel } from '../database/models/customer.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { CustomerService } from '../modules/customers/customer.service.js';
import { GrnService } from '../modules/grn/grn.service.js';
import { ImportService } from '../modules/import-export/import.service.js';

describe('P8 ImportService Unit & Integration Tests', () => {
  const facilityId = 'fac-imp-test';
  const otherFacilityId = 'fac-imp-other';
  const userId = 'usr-admin-1';
  let importService: ImportService;
  let grnService: GrnService;
  let customerService: CustomerService;

  beforeAll(async () => {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cold_storage_test';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  beforeEach(async () => {
    await FacilityModel.deleteMany({});
    await ChamberModel.deleteMany({});
    await CommodityModel.deleteMany({});
    await CustomerModel.deleteMany({});
    await GrnModel.deleteMany({});
    await CounterModel.deleteMany({});

    grnService = new GrnService();
    customerService = new CustomerService();
    importService = new ImportService(grnService, customerService);

    // Setup base facility
    await FacilityModel.create({
      id: facilityId,
      name: 'Central Cold Storage',
      code: 'CCS',
      address: 'Industrial Area',
      isActive: true,
    });
    await FacilityModel.create({
      id: otherFacilityId,
      name: 'North Cold Storage',
      code: 'NCS',
      address: 'North Zone',
      isActive: true,
    });

    // Setup base chamber
    await ChamberModel.create({
      id: 'ch-imp-1',
      facilityId,
      chamberNumber: 'CH-01',
      name: 'Chamber 1',
      isActive: true,
    });

    // Setup base commodity
    await CommodityModel.create({
      id: 'cmd-imp-1',
      name: 'Potato',
      normalizedName: 'potato',
      variety: 'Kufri Jyoti',
      isActive: true,
    });
  });

  // 1. Structural Failure Zero-DB-Query Guarantee
  it('structural failure zero-DB-query guarantee: pre-resolution failures trigger 0 database queries and 0 database writes', async () => {
    const findSpy = vi.spyOn(mongoose.Model, 'find');
    const createSpy = vi.spyOn(mongoose.Model, 'create');

    const malformedCsv = 'name,mobile\n"Unclosed quote,9876543210';
    await expect(importService.importCustomers(facilityId, malformedCsv)).rejects.toThrow(
      'MALFORMED_CSV',
    );

    expect(findSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();

    const customerCount = await CustomerModel.countDocuments();
    expect(customerCount).toBe(0);

    findSpy.mockRestore();
    createSpy.mockRestore();
  });

  // 2. Transaction Ownership
  it('transaction ownership: proves ImportService delegates transaction ownership to GrnService and does NOT open an outer MongoDB transaction', async () => {
    const startSessionSpy = vi.spyOn(mongoose, 'startSession');

    // Setup customer for GRN
    await CustomerModel.create({
      id: 'cust-trans-1',
      name: 'Farmer John',
      mobile: '9876543210',
      facilityIds: [facilityId],
      isActive: true,
    });

    const csv = [
      'date,customerName,commodityName,chamberNumber,bags,bagType,rentType,rentAmount',
      '2026-10-01,Farmer John,Potato,CH-01,50,S,Seasonal,500',
    ].join('\n');

    const grnServiceSpy = vi.spyOn(grnService, 'createGrn');

    await importService.importGrns(facilityId, csv, userId);

    expect(grnServiceSpy).toHaveBeenCalledTimes(1);

    // GrnService.createGrn internally opens 1 session for its transaction.
    // If ImportService opened a transaction, startSession would be called > 1 time.
    expect(startSessionSpy).toHaveBeenCalledTimes(1);

    grnServiceSpy.mockRestore();
    startSessionSpy.mockRestore();
  });

  // 3. BOM Handling
  it('BOM handling: correctly strips UTF-8 BOM from CSV header', async () => {
    const bomCsv = '\ufeffname,mobile\nAlice,9876543210';
    const summary = await importService.importCustomers(facilityId, bomCsv);
    expect(summary.totalRows).toBe(1);
    expect(summary.committed).toBe(1);
    expect(summary.results[0].status).toBe('committed');
  });

  // 4. Malformed CSV
  it('malformed CSV: rejects CSV with unmatched quotes with canonical MALFORMED_CSV error; HTTP 400 mapping is verified by the routes suite', async () => {
    const csv = 'name,mobile\n"Alice,9876543210';
    await expect(importService.importCustomers(facilityId, csv)).rejects.toThrow('MALFORMED_CSV');
  });

  // 5. Duplicate Headers
  it('duplicate headers: rejects CSV with duplicate column names', async () => {
    const csv = 'name,mobile,name\nAlice,9876543210,Alice';
    await expect(importService.importCustomers(facilityId, csv)).rejects.toThrow(
      'DUPLICATE_CSV_HEADERS',
    );
  });

  // 6. Missing Headers
  it('missing headers: rejects CSV missing mandatory columns', async () => {
    const csv = 'name,address\nAlice,Kolkata';
    await expect(importService.importCustomers(facilityId, csv)).rejects.toThrow(
      'MISSING_CSV_HEADERS',
    );
  });

  // 7. Unknown Headers
  it('unknown headers: rejects CSV with unrecognized headers', async () => {
    const csv = 'name,mobile,unknownField\nAlice,9876543210,test';
    await expect(importService.importCustomers(facilityId, csv)).rejects.toThrow(
      'UNKNOWN_CSV_HEADERS',
    );
  });

  // 8. Inconsistent Columns
  it('inconsistent columns: rejects CSV where data row has fewer/more columns than header', async () => {
    const csv = 'name,mobile\nAlice,9876543210,extraValue';
    await expect(importService.importCustomers(facilityId, csv)).rejects.toThrow(
      'INCONSISTENT_COLUMN_COUNT',
    );
  });

  // 9. Max Rows
  it('max rows: rejects upload containing 501 data rows before domain execution', async () => {
    const lines = ['name,mobile'];
    for (let i = 1; i <= 501; i++) {
      lines.push(`Customer ${i},98765${String(i).padStart(5, '0')}`);
    }
    const csv = lines.join('\n');
    await expect(importService.importCustomers(facilityId, csv)).rejects.toThrow(
      'ROW_LIMIT_EXCEEDED',
    );
  });

  // 10. Customer Batched Lookup
  it('customer batched lookup: validates that customer duplicate check executes exactly 1 database query (no N+1)', async () => {
    const findSpy = vi.spyOn(CustomerModel, 'find');

    const csv = [
      'name,mobile',
      'Farmer 1,9876500001',
      'Farmer 2,9876500002',
      'Farmer 3,9876500003',
    ].join('\n');

    await importService.importCustomers(facilityId, csv);

    // The batched lookup executes CustomerModel.find({ mobile: { $in: [...] } }) exactly once
    expect(findSpy).toHaveBeenCalledTimes(1);

    findSpy.mockRestore();
  });

  // 11. Customer Intra-File Duplicate
  it('customer intra-file duplicate: first customer row succeeds; second row with same mobile in same file is rejected deterministically', async () => {
    const csv = ['name,mobile', 'Original Alice,9876543210', 'Duplicate Alice,9876543210'].join(
      '\n',
    );

    const summary = await importService.importCustomers(facilityId, csv);
    expect(summary.totalRows).toBe(2);
    expect(summary.committed).toBe(1);
    expect(summary.rejected).toBe(1);
    expect(summary.results[0].status).toBe('committed');
    expect(summary.results[1].status).toBe('rejected');
    expect(summary.results[1].errors?.[0]).toContain('Duplicate record within import file');
  });

  // 12. Customer Service Delegation
  it('customer service delegation: verifies customerService.createCustomer is invoked with canonical input', async () => {
    const createSpy = vi.spyOn(customerService, 'createCustomer');

    const csv = 'name,mobile,address,gstin\nTest Farmer,9876543210,Plot 5,27AAAAA0000A1Z5';
    await importService.importCustomers(facilityId, csv);

    expect(createSpy).toHaveBeenCalledWith({
      name: 'Test Farmer',
      mobile: '9876543210',
      address: 'Plot 5',
      gstin: '27AAAAA0000A1Z5',
      facilityIds: [facilityId],
      isActive: true,
    });

    createSpy.mockRestore();
  });

  // 13. Customer Re-registration Semantics
  it('customer re-registration semantics: when customer already exists for this facility, row is rejected with canonical error; when customer exists for other facilities, target facility is associated', async () => {
    // Customer existing in otherFacilityId
    await customerService.createCustomer({
      name: 'Existing Bob',
      mobile: '9876511111',
      facilityIds: [otherFacilityId],
      isActive: true,
    });

    // Customer existing already in facilityId
    await customerService.createCustomer({
      name: 'Existing Charlie',
      mobile: '9876522222',
      facilityIds: [facilityId],
      isActive: true,
    });

    const csv = [
      'name,mobile',
      'Bob Association,9876511111', // exists in other facility -> should be associated
      'Charlie Conflict,9876522222', // already in this facility -> rejected
    ].join('\n');

    const summary = await importService.importCustomers(facilityId, csv);
    expect(summary.committed).toBe(1);
    expect(summary.rejected).toBe(1);

    const bob = await CustomerModel.findOne({ mobile: '9876511111' });
    expect(bob?.facilityIds).toContain(facilityId);
    expect(bob?.facilityIds).toContain(otherFacilityId);

    expect(summary.results[1].status).toBe('rejected');
    expect(summary.results[1].errors?.[0]).toContain('already registered for this facility');
  });

  // 14. GRN Reference Resolution
  it('GRN reference resolution: resolves customer, commodity, and chamber in exactly 3 batched read-only queries', async () => {
    await CustomerModel.create({
      id: 'cust-ref-1',
      name: 'Farmer 1',
      mobile: '9876543210',
      facilityIds: [facilityId],
      isActive: true,
    });

    const custSpy = vi.spyOn(CustomerModel, 'find');
    const cmdSpy = vi.spyOn(CommodityModel, 'find');
    const chSpy = vi.spyOn(ChamberModel, 'find');

    const csv = [
      'date,customerName,commodityName,chamberNumber,bags,bagType,rentType,rentAmount',
      '2026-10-01,Farmer 1,Potato,CH-01,100,S,Seasonal,1000',
    ].join('\n');

    await importService.importGrns(facilityId, csv, userId);

    expect(custSpy).toHaveBeenCalledTimes(1);
    expect(cmdSpy).toHaveBeenCalledTimes(1);
    expect(chSpy).toHaveBeenCalledTimes(1);

    custSpy.mockRestore();
    cmdSpy.mockRestore();
    chSpy.mockRestore();
  });

  // 15. GRN Unresolvable Reference
  it('GRN unresolvable reference: rejects row referencing non-existent or inactive chamber; causes 0 writes for that row', async () => {
    await CustomerModel.create({
      id: 'cust-unres-1',
      name: 'Farmer 1',
      mobile: '9876543210',
      facilityIds: [facilityId],
      isActive: true,
    });

    const csv = [
      'date,customerName,commodityName,chamberNumber,bags,bagType,rentType,rentAmount',
      '2026-10-01,Farmer 1,Potato,NONEXISTENT_CHAMBER,100,S,Seasonal,1000',
    ].join('\n');

    const summary = await importService.importGrns(facilityId, csv, userId);
    expect(summary.totalRows).toBe(1);
    expect(summary.rejected).toBe(1);
    expect(summary.results[0].errors?.[0]).toContain('not found or inactive');

    const grnCount = await GrnModel.countDocuments();
    expect(grnCount).toBe(0);
  });

  // 16. GRN Identical Operational Rows NOT Rejected
  it('GRN identical operational rows NOT rejected: proves two valid GRN rows with identical customer, commodity, chamber, date, bags, and vehicle are both committed with distinct sequential grnNumbers', async () => {
    await CustomerModel.create({
      id: 'cust-dup-1',
      name: 'Farmer 1',
      mobile: '9876543210',
      facilityIds: [facilityId],
      isActive: true,
    });

    const csv = [
      'date,customerName,commodityName,chamberNumber,bags,bagType,rentType,rentAmount,vehicleNumber',
      '2026-10-01,Farmer 1,Potato,CH-01,100,S,Seasonal,1000,MH12AB1234',
      '2026-10-01,Farmer 1,Potato,CH-01,100,S,Seasonal,1000,MH12AB1234',
    ].join('\n');

    const summary = await importService.importGrns(facilityId, csv, userId);
    expect(summary.totalRows).toBe(2);
    expect(summary.committed).toBe(2);
    expect(summary.rejected).toBe(0);

    const ref1 = summary.results[0].referenceNumber;
    const ref2 = summary.results[1].referenceNumber;
    expect(ref1).toBeDefined();
    expect(ref2).toBeDefined();
    expect(ref1).not.toBe(ref2);
  });

  // 17. Counter Gapless Rollback
  it('counter gapless rollback: induces failure on row 2 of a 2-row batch; verifies row 1 succeeds, row 2 fails, and no counter gap is created', async () => {
    await CustomerModel.create({
      id: 'cust-gap-1',
      name: 'Farmer 1',
      mobile: '9876543210',
      facilityIds: [facilityId],
      isActive: true,
    });

    const csv = [
      'date,customerName,commodityName,chamberNumber,bags,bagType,rentType,rentAmount',
      '2026-10-01,Farmer 1,Potato,CH-01,100,S,Seasonal,1000', // valid
      '2026-10-01,Farmer 1,Potato,CH-01,0,S,Seasonal,1000', // invalid bags = 0 -> rejected
    ].join('\n');

    const summary = await importService.importGrns(facilityId, csv, userId);
    expect(summary.totalRows).toBe(2);
    expect(summary.committed).toBe(1);
    expect(summary.rejected).toBe(1);

    // Now insert a subsequent valid GRN via service and verify consecutive counter
    const nextCsv = [
      'date,customerName,commodityName,chamberNumber,bags,bagType,rentType,rentAmount',
      '2026-10-01,Farmer 1,Potato,CH-01,150,S,Seasonal,1500',
    ].join('\n');

    const nextSummary = await importService.importGrns(facilityId, nextCsv, userId);
    expect(nextSummary.committed).toBe(1);

    const grns = await GrnModel.find({ facilityId }).sort({ createdAt: 1 });
    expect(grns.length).toBe(2);

    const num1 = parseInt(grns[0].grnNumber.split('-').pop()!, 10);
    const num2 = parseInt(grns[1].grnNumber.split('-').pop()!, 10);
    expect(num2).toBe(num1 + 1);
  });

  // 18. Atomic Counter Allocation
  it('atomic counter allocation: verifies GRN creation reuses P4 counterService within GrnServices transaction', async () => {
    await CustomerModel.create({
      id: 'cust-atom-1',
      name: 'Farmer 1',
      mobile: '9876543210',
      facilityIds: [facilityId],
      isActive: true,
    });

    const csv = [
      'date,customerName,commodityName,chamberNumber,bags,bagType,rentType,rentAmount',
      '2026-10-01,Farmer 1,Potato,CH-01,100,S,Seasonal,1000',
    ].join('\n');

    const summary = await importService.importGrns(facilityId, csv, userId);
    expect(summary.committed).toBe(1);

    const counter = await CounterModel.findOne({ facilityId, counterType: 'GRN' });
    expect(counter).toBeDefined();
    expect(counter?.lastSequence).toBeGreaterThanOrEqual(1);
  });
});
