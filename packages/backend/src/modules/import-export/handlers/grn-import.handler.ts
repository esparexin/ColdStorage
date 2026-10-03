import type {
  CreateGrnInput,
  ImportRowResult,
  ImportSummary,
} from '@cold-storage/contracts';
import { createGrnSchema } from '@cold-storage/contracts';
import { ChamberModel } from '../../../database/models/chamber.model.js';
import { CommodityModel } from '../../../database/models/commodity.model.js';
import { CustomerModel } from '../../../database/models/customer.model.js';
import { auditService } from '../../audit/audit.service.js';
import type { GrnService } from '../../grn/grn.service.js';
import {
  GRN_IMPORT_ALLOWED_HEADERS,
  GRN_IMPORT_REQUIRED_HEADERS,
  parseAndValidateCsv,
} from '../csv-parser.helper.js';

/** Row-level numeric parsing helpers: empty cells become null so the canonical schema decides. */
function parseOptionalInt(value: string | undefined): number | null {
  if (!value || value.trim() === '') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? Number.NaN : parsed;
}

function parseOptionalFloat(value: string | undefined): number | null {
  if (!value || value.trim() === '') return null;
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? Number.NaN : parsed;
}

export async function executeGrnImport(
  facilityId: string,
  csvContent: string | Buffer,
  grnServiceInstance: GrnService,
  userId: string,
): Promise<ImportSummary> {
  const { headers, dataRows } = parseAndValidateCsv(
    csvContent,
    GRN_IMPORT_REQUIRED_HEADERS,
    GRN_IMPORT_ALLOWED_HEADERS,
  );

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
    uniqueCustomerNames.length > 0
      ? CustomerModel.find(
          { facilityIds: facilityId, name: { $in: uniqueCustomerNames }, isActive: true },
          { id: 1, name: 1 },
        )
          .lean()
          .exec()
      : [],
    uniqueCommodityNames.length > 0
      ? CommodityModel.find(
          { normalizedName: { $in: uniqueCommodityNames }, isActive: true },
          { id: 1, name: 1, normalizedName: 1 },
        )
          .lean()
          .exec()
      : [],
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

    // Row-level business validation is delegated to the canonical createGrnSchema so the CSV
    // import path can never accept a row that the interactive GRN endpoint would reject.
    const rentMonths = row.rentType === 'Monthly' ? parseOptionalInt(row.rentMonthsStr) : null;
    const contractCheck = createGrnSchema.safeParse({
      date: row.date,
      customerId: customerId ?? 'unresolved-customer',
      commodityId: commodityId ?? 'unresolved-commodity',
      chamberId: chamberId ?? 'unresolved-chamber',
      bags: parseInt(row.bagsStr, 10),
      bagType: row.bagType,
      nominalUnitWeight: parseOptionalFloat(row.nominalUnitWeightStr),
      nominalTotalWeight: parseOptionalFloat(row.nominalTotalWeightStr),
      actualWeight: parseOptionalFloat(row.actualWeightStr),
      rentType: row.rentType,
      rentMonths,
      rentAmount: parseFloat(row.rentAmountStr),
      gpNumber: null,
      marks: null,
      vehicleNumber: row.vehicleNumber || null,
      remarks: row.remarks || null,
    });

    if (!contractCheck.success) {
      for (const issue of contractCheck.error.issues) {
        const field = issue.path.join('.') || 'row';
        rowErrors.push(`${field}: ${issue.message}`);
      }
    }

    if (rowErrors.length > 0 || !contractCheck.success) {
      results.push({
        row: row.rowNumber,
        status: 'rejected',
        errors: rowErrors.length > 0 ? rowErrors : ['Row failed contract validation'],
      });
      continue;
    }

    try {
      // The canonical schema output is authoritative, so imported rows carry exactly the
      // same coerced values an interactive GRN submission would have produced.
      const createGrnInput: CreateGrnInput = {
        ...contractCheck.data,
        customerId: customerId!,
        commodityId: commodityId!,
        chamberId: chamberId!,
        gpNumber: row.gpNumber ?? null,
        marks: row.marks ?? null,
        remarks: row.remarks ?? null,
      };

      const { grn } = await grnServiceInstance.createGrn(facilityId, createGrnInput, userId);
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
