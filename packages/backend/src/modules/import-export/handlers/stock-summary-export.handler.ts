import type { Response } from 'express';
import { InventoryTransactionModel } from '../../../database/models/inventory-transaction.model.js';
import { auditService } from '../../audit/audit.service.js';
import { ledgerSignedQuantity } from '../../inventory/ledger-polarity.js';
import { CsvSerializer } from '../csv.serializer.js';

/**
 * Stock summary reports stock held per free-text chamber label. There is no capacity,
 * availability or utilization column because chamber is a label, not a capacity-managed slot.
 */
export async function exportStockSummary(
  facilityId: string,
  res: Response,
  userId?: string,
): Promise<void> {
  await auditService.log({
    eventType: 'EXPORT_EXECUTED',
    severity: 'INFO',
    userId: userId ?? 'SYSTEM',
    facilityId,
    resource: 'export',
    resourceId: null,
    details: { entityType: 'stock_summary' },
  });

  const stockByChamber = await InventoryTransactionModel.aggregate<{
    _id: string;
    totalBags: number;
  }>([
    { $match: { facilityId } },
    { $group: { _id: '$chamber', totalBags: { $sum: ledgerSignedQuantity } } },
    { $match: { totalBags: { $gt: 0 } } },
    { $sort: { totalBags: -1 } },
  ]);

  const headers = ['chamber', 'totalBags'];

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="stock-summary-${facilityId}.csv"`);

  res.write(CsvSerializer.serializeRow(headers));

  for (const row of stockByChamber) {
    res.write(CsvSerializer.serializeRow([row._id, row.totalBags]));
  }

  res.end();
}