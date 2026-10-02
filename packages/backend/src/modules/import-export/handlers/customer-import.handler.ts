import type {
  CreateCustomerInput,
  ImportRowResult,
  ImportSummary,
} from '@cold-storage/contracts';
import { CustomerModel } from '../../../database/models/customer.model.js';
import { auditService } from '../../audit/audit.service.js';
import type { CustomerService } from '../../customers/customer.service.js';
import {
  CUSTOMER_IMPORT_ALLOWED_HEADERS,
  CUSTOMER_IMPORT_REQUIRED_HEADERS,
  parseAndValidateCsv,
} from '../csv-parser.helper.js';

export async function executeCustomerImport(
  facilityId: string,
  csvContent: string | Buffer,
  customerServiceInstance: CustomerService,
  userId?: string,
): Promise<ImportSummary> {
  const { headers, dataRows } = parseAndValidateCsv(
    csvContent,
    CUSTOMER_IMPORT_REQUIRED_HEADERS,
    CUSTOMER_IMPORT_ALLOWED_HEADERS,
  );

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

    if (row.mobile && seenFileMobiles.has(row.mobile)) {
      const firstRow = seenMobileFirstRow.get(row.mobile);
      rowErrors.push(
        `Duplicate record within import file: mobile ${row.mobile} already specified at row ${firstRow}`,
      );
    }

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

    seenFileMobiles.add(row.mobile);
    seenMobileFirstRow.set(row.mobile, row.rowNumber);

    try {
      const input: CreateCustomerInput = {
        name: row.name,
        mobile: row.mobile,
        address: row.address,
        gstin: row.gstin,
        facilityIds: [facilityId],
        isActive: true,
      };
      const customer = await customerServiceInstance.createCustomer(input);
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
