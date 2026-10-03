import type { Response } from 'express';
import { ChamberModel } from '../../../database/models/chamber.model.js';
import { InventoryTransactionModel } from '../../../database/models/inventory-transaction.model.js';
import { PositionModel } from '../../../database/models/position.model.js';
import { auditService } from '../../audit/audit.service.js';
import { ledgerSignedQuantity } from '../../inventory/ledger-polarity.js';
import { CsvSerializer } from '../csv.serializer.js';

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

  const [positionCapacities, chambers, stockBreakdown] = await Promise.all([
    PositionModel.aggregate<{ _id: string; capacityBags: number }>([
      { $match: { facilityId } },
      { $group: { _id: '$chamberId', capacityBags: { $sum: '$capacityBags' } } },
    ]),
    ChamberModel.find({ facilityId }).select('id chamberNumber isActive').lean().exec(),
    InventoryTransactionModel.aggregate<{ _id: string; occupiedBags: number }>([
      { $match: { facilityId } },
      { $group: { _id: '$chamberId', occupiedBags: { $sum: ledgerSignedQuantity } } },
    ]),
  ]);

  const capacityMap = new Map<string, number>(
    positionCapacities.map((p) => [p._id, p.capacityBags]),
  );
  const stockMap = new Map<string, number>(stockBreakdown.map((s) => [s._id, s.occupiedBags]));

  const headers = [
    'chamberNumber',
    'isActive',
    'capacityBags',
    'occupiedBags',
    'availableBags',
    'utilizationRate',
  ];

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="stock-summary-${facilityId}.csv"`);

  res.write(CsvSerializer.serializeRow(headers));

  for (const ch of chambers) {
    const cap = capacityMap.get(ch.id) ?? 0;
    const occ = stockMap.get(ch.id) ?? 0;
    const avail = Math.max(0, cap - occ);
    const rate = cap === 0 ? 0 : Math.min(100, Math.round((occ / cap) * 10000) / 100);

    res.write(CsvSerializer.serializeRow([ch.chamberNumber, ch.isActive, cap, occ, avail, rate]));
  }

  res.end();
}
