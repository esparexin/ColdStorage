import type { Response } from 'express';
import { DeliveryChallanModel } from '../../../database/models/delivery-challan.model.js';
import { GrnModel } from '../../../database/models/grn.model.js';
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

  const hasInwardPutAway = await InventoryTransactionModel.countDocuments({
    facilityId,
    transactionType: 'INWARD_PUTAWAY',
  }).exec();

  let stockByChamber: Array<{ _id: string; totalBags: number }>;

  if (hasInwardPutAway > 0) {
    stockByChamber = await InventoryTransactionModel.aggregate<{
      _id: string;
      totalBags: number;
    }>([
      { $match: { facilityId } },
      { $group: { _id: '$chamber', totalBags: { $sum: ledgerSignedQuantity } } },
      { $match: { totalBags: { $gt: 0 } } },
      { $sort: { totalBags: -1 } },
    ]);
  } else {
    const [inwardAgg, deliveryAgg] = await Promise.all([
      GrnModel.aggregate<{ _id: string; totalBags: number }>([
        { $match: { facilityId } },
        { $group: { _id: '$chamber', totalBags: { $sum: '$bags' } } },
      ]),
      DeliveryChallanModel.aggregate<{ _id: string; totalBags: number }>([
        { $match: { facilityId, status: 'ISSUED' } },
        { $group: { _id: '$chamber', totalBags: { $sum: '$bags' } } },
      ]),
    ]);

    const chamberStockMap = new Map<string, number>();
    for (const row of inwardAgg) {
      chamberStockMap.set(row._id, (chamberStockMap.get(row._id) ?? 0) + row.totalBags);
    }
    for (const row of deliveryAgg) {
      chamberStockMap.set(row._id, (chamberStockMap.get(row._id) ?? 0) - row.totalBags);
    }

    stockByChamber = [...chamberStockMap.entries()]
      .filter(([, totalBags]) => totalBags > 0)
      .map(([chamber, totalBags]) => ({ _id: chamber, totalBags }))
      .sort((a, b) => b.totalBags - a.totalBags);
  }

  const headers = ['chamber', 'totalBags'];

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="stock-summary-${facilityId}.csv"`);

  res.write(CsvSerializer.serializeRow(headers));

  for (const row of stockByChamber) {
    res.write(CsvSerializer.serializeRow([row._id, row.totalBags]));
  }

  res.end();
}