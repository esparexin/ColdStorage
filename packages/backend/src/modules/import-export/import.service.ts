import { parse } from 'csv-parse/sync';
import type {
  CreateCustomerInput,
  CreateGrnInput,
  ImportRowResult,
  ImportSummary,
} from '@cold-storage/contracts';
import { CustomerModel } from '../../database/models/customer.model.js';
import { CommodityModel } from '../../database/models/commodity.model.js';
import { ChamberModel } from '../../database/models/chamber.model.js';
import {
  CustomerService,
  customerService as defaultCustomerService,
} from '../customers/customer.service.js';
import { GrnService, grnService as defaultGrnService } from '../grn/grn.service.js';
import { auditService } from '../audit/audit.service.js';

export const CUSTOMER_IMPORT_REQUIRED_HEADERS = ['name', 'mobile'] as const;
export const CUSTOMER_IMPORT_ALLOWED_HEADERS = ['name', 'mobile', 'address', 'gstin'] as const;

export const GRN_IMPORT_REQUIRED_HEADERS = [
  'date',
  'customerName',
  'commodityName',
  'chamberNumber',
  'bags',
  'bagType',
  'rentType',
  'rentAmount',
] as const;

export const GRN_IMPORT_ALLOWED_HEADERS = [
  'date',
  'customerName',
  'commodityName',
  'chamberNumber',
  'bags',
  'bagType',
  'rentType',
  'rentMonths',
  'rentAmount',
  'nominalUnitWeight',
  'nominalTotalWeight',
  'actualWeight',
  'vehicleNumber',
  'gpNumber',
  'marks',
  'remarks',
] as const;

export class ImportService {
  constructor(
    private grnServiceInstance: GrnService = defaultGrnService,
    private customerServiceInstance: CustomerService = defaultCustomerService,
  ) {}

  /**
   * Parses and validates raw CSV content structurally.
   * Guarantees 0 database queries and 0 database writes if structural checks fail.
   */
  private parseAndValidateCsv(
    csvContent: string | Buffer,
    requiredHeaders: readonly string[],
    allowedHeaders: readonly string[],
  ): { headers: string[]; dataRows: string[][] } {
    let records: string[][];
    try {
      records = parse(csvContent, {
        bom: true,
        relax_column_count: false,
        skip_empty_lines: true,
        trim: true,
      }) as string[][];
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const lower = msg.toLowerCase();
      if (
        lower.includes('inconsistent') ||
        lower.includes('column') ||
        lower.includes('record length')
      ) {
        throw new Error(`INCONSISTENT_COLUMN_COUNT: ${msg}`);
      }
      throw new Error(`MALFORMED_CSV: ${msg}`);
    }

    if (!records || records.length === 0) {
      throw new Error('EMPTY_CSV_FILE: CSV file contains no records');
    }

    const headers = records[0];
    if (new Set(headers).size !== headers.length) {
      throw new Error('DUPLICATE_CSV_HEADERS: CSV contains duplicate headers');
    }

    const missing = requiredHeaders.filter((h) => !headers.includes(h));
    if (missing.length > 0) {
      throw new Error(`MISSING_CSV_HEADERS: Missing required headers: ${missing.join(', ')}`);
    }

    const unknown = headers.filter((h) => !allowedHeaders.includes(h));
    if (unknown.length > 0) {
      throw new Error(`UNKNOWN_CSV_HEADERS: Unrecognized headers: ${unknown.join(', ')}`);
    }

    const dataRows = records.slice(1);
    if (dataRows.length === 0) {
      throw new Error('EMPTY_CSV_FILE: CSV file contains 0 data rows');
    }

    if (dataRows.length > 500) {
      throw new Error('ROW_LIMIT_EXCEEDED: CSV file contains more than 500 data rows');
    }

    return { headers, dataRows };
  }

  /**
   * Imports customers for a facility from CSV.
   *
   * Transaction rule: ImportService does NOT open any MongoDB transaction.
   * CustomerService.createCustomer owns persistence.
   */
  public async importCustomers(
    facilityId: string,
    csvContent: string | Buffer,
    userId?: string,
  ): Promise<ImportSummary> {
    const { headers, dataRows } = this.parseAndValidateCsv(
      csvContent,
      CUSTOMER_IMPORT_REQUIRED_HEADERS,
      CUSTOMER_IMPORT_ALLOWED_HEADERS,
    );

    // Map rows to raw objects
    const nameIdx = headers.indexOf('name');
    const mobileIdx = headers.indexOf('mobile');
    const addressIdx = headers.indexOf('address');
    const gstinIdx = headers.indexOf('gstin');

    const parsedRows = dataRows.map((cols, idx) => ({
      rowNumber: idx + 1,
      name: cols[nameIdx]?.trim() ?? '',
      mobile: cols[mobileIdx]?.trim() ?? '',
      address: addressIdx !== -1 ? cols[addressIdx]?.trim() || undefined : undefined,
      gstin: gstinIdx !== -1 ? cols[gstinIdx]?.trim() || undefined : undefined,
    }));

    // Batched duplicate mobile pre-lookup (exactly 1 physical database query)
    const validMobiles = Array.from(
      new Set(parsedRows.map((r) => r.mobile).filter((m) => /^[6-9]\d{9}$/.test(m))),
    );

    const existingDocs =
      validMobiles.length > 0
        ? await CustomerModel.find(
            { mobile: { $in: validMobiles } },
            { id: 1, mobile: 1, facilityIds: 1 },
          )
            .lean()
            .exec()
        : [];

    const existingMap = new Map<string, { id: string; facilityIds: string[] }>(
      existingDocs.map((doc) => [doc.mobile, doc]),
    );

    const seenFileMobiles = new Set<string>();
    const seenMobileFirstRow = new Map<string, number>();
    const results: ImportRowResult[] = [];

    for (const row of parsedRows) {
      const rowErrors: string[] = [];

      if (!row.name) {
        rowErrors.push('Customer name is required');
      }

      if (!row.mobile || !/^[6-9]\d{9}$/.test(row.mobile)) {
        rowErrors.push('Mobile must be a valid 10-digit Indian mobile number');
      }

      // Check intra-file duplicate
      if (row.mobile && seenFileMobiles.has(row.mobile)) {
        const firstRow = seenMobileFirstRow.get(row.mobile);
        rowErrors.push(
          `Duplicate record within import file: mobile ${row.mobile} already specified at row ${firstRow}`,
        );
      }

      // Check existing customer facility registration conflict
      const existing = row.mobile ? existingMap.get(row.mobile) : undefined;
      if (existing && existing.facilityIds.includes(facilityId)) {
        rowErrors.push(
          `Customer with mobile '${row.mobile}' is already registered for this facility`,
        );
      }

      if (rowErrors.length > 0) {
        results.push({
          row: row.rowNumber,
          status: 'rejected',
          errors: rowErrors,
        });
        continue;
      }

      // Track mobile for intra-file deduplication
      seenFileMobiles.add(row.mobile);
      seenMobileFirstRow.set(row.mobile, row.rowNumber);

      // Invoke canonical domain service
      try {
        const input: CreateCustomerInput = {
          name: row.name,
          mobile: row.mobile,
          address: row.address,
          gstin: row.gstin,
          facilityIds: [facilityId],
          isActive: true,
        };
        const customer = await this.customerServiceInstance.createCustomer(input);
        results.push({
          row: row.rowNumber,
          status: 'committed',
          id: customer.id,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Customer creation failed';
        results.push({
          row: row.rowNumber,
          status: 'rejected',
          errors: [message],
        });
      }
    }

    const committed = results.filter((r) => r.status === 'committed').length;
    const rejected = results.filter((r) => r.status === 'rejected').length;

    await auditService.log({
      eventType: 'IMPORT_EXECUTED',
      severity: 'INFO',
      userId: userId ?? 'SYSTEM',
      facilityId,
      resource: 'import',
      resourceId: null,
      details: {
        entityType: 'customer',
        totalRows: dataRows.length,
        committed,
        rejected,
      },
    });

    return {
      totalRows: dataRows.length,
      committed,
      rejected,
      results,
    };
  }

  /**
   * Imports GRNs for a facility from CSV.
   *
   * Transaction rule: ImportService does NOT open any MongoDB transaction.
   * GrnService.createGrn owns the session and transaction.
   */
  public async importGrns(
    facilityId: string,
    csvContent: string | Buffer,
    userId: string,
  ): Promise<ImportSummary> {
    const { headers, dataRows } = this.parseAndValidateCsv(
      csvContent,
      GRN_IMPORT_REQUIRED_HEADERS,
      GRN_IMPORT_ALLOWED_HEADERS,
    );

    // Map column indices
    const dateIdx = headers.indexOf('date');
    const customerNameIdx = headers.indexOf('customerName');
    const commodityNameIdx = headers.indexOf('commodityName');
    const chamberNumberIdx = headers.indexOf('chamberNumber');
    const bagsIdx = headers.indexOf('bags');
    const bagTypeIdx = headers.indexOf('bagType');
    const rentTypeIdx = headers.indexOf('rentType');
    const rentMonthsIdx = headers.indexOf('rentMonths');
    const rentAmountIdx = headers.indexOf('rentAmount');
    const nominalUnitWeightIdx = headers.indexOf('nominalUnitWeight');
    const nominalTotalWeightIdx = headers.indexOf('nominalTotalWeight');
    const actualWeightIdx = headers.indexOf('actualWeight');
    const vehicleNumberIdx = headers.indexOf('vehicleNumber');
    const gpNumberIdx = headers.indexOf('gpNumber');
    const marksIdx = headers.indexOf('marks');
    const remarksIdx = headers.indexOf('remarks');

    const parsedRows = dataRows.map((cols, idx) => ({
      rowNumber: idx + 1,
      date: cols[dateIdx]?.trim() ?? '',
      customerName: cols[customerNameIdx]?.trim() ?? '',
      commodityName: cols[commodityNameIdx]?.trim() ?? '',
      chamberNumber: cols[chamberNumberIdx]?.trim() ?? '',
      bagsStr: cols[bagsIdx]?.trim() ?? '',
      bagType: cols[bagTypeIdx]?.trim() ?? '',
      rentType: cols[rentTypeIdx]?.trim() ?? '',
      rentMonthsStr: rentMonthsIdx !== -1 ? cols[rentMonthsIdx]?.trim() || undefined : undefined,
      rentAmountStr: cols[rentAmountIdx]?.trim() ?? '',
      nominalUnitWeightStr:
        nominalUnitWeightIdx !== -1 ? cols[nominalUnitWeightIdx]?.trim() || undefined : undefined,
      nominalTotalWeightStr:
        nominalTotalWeightIdx !== -1 ? cols[nominalTotalWeightIdx]?.trim() || undefined : undefined,
      actualWeightStr:
        actualWeightIdx !== -1 ? cols[actualWeightIdx]?.trim() || undefined : undefined,
      vehicleNumber:
        vehicleNumberIdx !== -1 ? cols[vehicleNumberIdx]?.trim() || undefined : undefined,
      gpNumber: gpNumberIdx !== -1 ? cols[gpNumberIdx]?.trim() || undefined : undefined,
      marks: marksIdx !== -1 ? cols[marksIdx]?.trim() || undefined : undefined,
      remarks: remarksIdx !== -1 ? cols[remarksIdx]?.trim() || undefined : undefined,
    }));

    // Batched reference resolution: exactly 3 queries
    const uniqueCustomerNames = Array.from(
      new Set(parsedRows.map((r) => r.customerName).filter(Boolean)),
    );
    const uniqueCommodityNames = Array.from(
      new Set(parsedRows.map((r) => r.commodityName.toLowerCase()).filter(Boolean)),
    );
    const uniqueChamberNumbers = Array.from(
      new Set(parsedRows.map((r) => r.chamberNumber).filter(Boolean)),
    );

    const [customers, commodities, chambers] = await Promise.all([
      // Query 1: Active customers assigned to this facility
      uniqueCustomerNames.length > 0
        ? CustomerModel.find(
            { facilityIds: facilityId, name: { $in: uniqueCustomerNames }, isActive: true },
            { id: 1, name: 1 },
          )
            .lean()
            .exec()
        : [],
      // Query 2: Active commodities
      uniqueCommodityNames.length > 0
        ? CommodityModel.find(
            { normalizedName: { $in: uniqueCommodityNames }, isActive: true },
            { id: 1, name: 1, normalizedName: 1 },
          )
            .lean()
            .exec()
        : [],
      // Query 3: Active chambers in this facility
      uniqueChamberNumbers.length > 0
        ? ChamberModel.find(
            { facilityId, chamberNumber: { $in: uniqueChamberNumbers }, isActive: true },
            { id: 1, chamberNumber: 1 },
          )
            .lean()
            .exec()
        : [],
    ]);

    const customerMap = new Map<string, string>(customers.map((c) => [c.name, c.id]));
    const commodityMap = new Map<string, string>(commodities.map((c) => [c.normalizedName, c.id]));
    const chamberMap = new Map<string, string>(chambers.map((c) => [c.chamberNumber, c.id]));

    const results: ImportRowResult[] = [];

    for (const row of parsedRows) {
      const rowErrors: string[] = [];

      // Reference Lookups
      const customerId = customerMap.get(row.customerName);
      if (!customerId) {
        rowErrors.push(`Customer '${row.customerName}' not found or inactive for this facility`);
      }

      const commodityId = commodityMap.get(row.commodityName.toLowerCase());
      if (!commodityId) {
        rowErrors.push(`Commodity '${row.commodityName}' not found or inactive`);
      }

      const chamberId = chamberMap.get(row.chamberNumber);
      if (!chamberId) {
        rowErrors.push(`Chamber '${row.chamberNumber}' not found or inactive for this facility`);
      }

      // Bags
      const bags = parseInt(row.bagsStr, 10);
      if (isNaN(bags) || bags <= 0) {
        rowErrors.push('Bags must be a positive integer >= 1');
      }

      // BagType
      if (!['S', 'B', 'S+B'].includes(row.bagType)) {
        rowErrors.push("Bag type must be 'S', 'B', or 'S+B'");
      }

      // RentType & RentMonths
      if (!['Monthly', 'Seasonal'].includes(row.rentType)) {
        rowErrors.push("Rent type must be 'Monthly' or 'Seasonal'");
      }

      let rentMonths: number | undefined;
      if (row.rentType === 'Monthly') {
        if (!row.rentMonthsStr) {
          rowErrors.push("Rent months is required when rent type is 'Monthly'");
        } else {
          rentMonths = parseInt(row.rentMonthsStr, 10);
          if (isNaN(rentMonths) || rentMonths <= 0) {
            rowErrors.push('Rent months must be a positive integer');
          }
        }
      }

      // RentAmount
      const rentAmount = parseFloat(row.rentAmountStr);
      if (isNaN(rentAmount) || rentAmount < 0) {
        rowErrors.push('Rent amount must be a non-negative number');
      }

      // Date format check
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || isNaN(Date.parse(row.date))) {
        rowErrors.push('Date must be a valid ISO 8601 date string (YYYY-MM-DD)');
      }

      // Weights parsing
      const nominalUnitWeight = row.nominalUnitWeightStr
        ? parseFloat(row.nominalUnitWeightStr)
        : undefined;
      const nominalTotalWeight = row.nominalTotalWeightStr
        ? parseFloat(row.nominalTotalWeightStr)
        : undefined;
      const actualWeight = row.actualWeightStr ? parseFloat(row.actualWeightStr) : undefined;

      if (rowErrors.length > 0) {
        results.push({
          row: row.rowNumber,
          status: 'rejected',
          errors: rowErrors,
        });
        continue;
      }

      // Domain execution via canonical GrnService
      try {
        const createGrnInput: CreateGrnInput = {
          date: new Date(row.date),
          customerId: customerId!,
          commodityId: commodityId!,
          chamberId: chamberId!,
          bags,
          bagType: row.bagType as 'S' | 'B' | 'S+B',
          rentType: row.rentType as 'Monthly' | 'Seasonal',
          rentMonths: rentMonths ?? null,
          rentAmount,
          nominalUnitWeight: nominalUnitWeight ?? null,
          nominalTotalWeight: nominalTotalWeight ?? null,
          actualWeight: actualWeight ?? null,
          vehicleNumber: row.vehicleNumber ?? null,
          gpNumber: row.gpNumber ?? null,
          marks: row.marks ?? null,
          remarks: row.remarks ?? null,
        };

        const { grn } = await this.grnServiceInstance.createGrn(facilityId, createGrnInput, userId);
        results.push({
          row: row.rowNumber,
          status: 'committed',
          id: grn.id,
          referenceNumber: grn.grnNumber,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'GRN creation failed';
        results.push({
          row: row.rowNumber,
          status: 'rejected',
          errors: [message],
        });
      }
    }

    const committed = results.filter((r) => r.status === 'committed').length;
    const rejected = results.filter((r) => r.status === 'rejected').length;

    await auditService.log({
      eventType: 'IMPORT_EXECUTED',
      severity: 'INFO',
      userId,
      facilityId,
      resource: 'import',
      resourceId: null,
      details: {
        entityType: 'grn',
        totalRows: dataRows.length,
        committed,
        rejected,
      },
    });

    return {
      totalRows: dataRows.length,
      committed,
      rejected,
      results,
    };
  }
}

export const importService = new ImportService();
