import { customerNameSchema, type ImportRowResult, type ImportSummary } from '@cold-storage/contracts';
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

  const parsedRows = dataRows.map((cols, idx) => ({
    rowNumber: idx + 1,
    name: cols[nameIdx]?.trim() ?? '',
  }));

  // Name is the sole identity, so duplicates are detected case-insensitively within the file
  // and against customers already registered for this facility — in one batched query.
  const validNames = Array.from(
    new Set(parsedRows.map((r) => r.name).filter((n) => n.length > 0)),
  );
  const escapedNames = validNames.map((n) => new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'));

  const existingDocs =
    escapedNames.length > 0
      ? await CustomerModel.find(
          { name: { $in: escapedNames }, facilityIds: facilityId },
          { id: 1, name: 1 },
        )
          .lean()
          .exec()
      : [];

  const existingNames = new Set(existingDocs.map((doc) => doc.name.toLowerCase()));

  const seenFileNames = new Set<string>();
  const seenNameFirstRow = new Map<string, number>();
  const results: ImportRowResult[] = [];

  for (const row of parsedRows) {
    const rowErrors: string[] = [];

    const parsedName = customerNameSchema.safeParse(row.name);
    if (!parsedName.success) {
      rowErrors.push(...parsedName.error.issues.map((i) => i.message));
    }

    const nameKey = row.name.toLowerCase();
    if (row.name && seenFileNames.has(nameKey)) {
      const firstRow = seenNameFirstRow.get(nameKey);
      rowErrors.push(
        `Duplicate record within import file: name '${row.name}' already specified at row ${firstRow}`,
      );
    }

    if (row.name && existingNames.has(nameKey)) {
      rowErrors.push(`Customer with name '${row.name}' is already registered for this facility`);
    }

    if (rowErrors.length > 0) {
      results.push({
        row: row.rowNumber,
        status: 'rejected',
        errors: rowErrors,
      });
      continue;
    }

    seenFileNames.add(nameKey);
    seenNameFirstRow.set(nameKey, row.rowNumber);

    try {
      const customer = await customerServiceInstance.createCustomer(
        { name: row.name, isActive: true },
        [facilityId],
      );
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
