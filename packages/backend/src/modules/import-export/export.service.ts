import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Response } from 'express';
import type { ExportDateRangeQuery } from '@cold-storage/contracts';
import { ChamberModel } from '../../database/models/chamber.model.js';
import { CustomerModel } from '../../database/models/customer.model.js';
import { DeliveryChallanModel } from '../../database/models/delivery-challan.model.js';
import { GrnModel } from '../../database/models/grn.model.js';
import { InventoryTransactionModel } from '../../database/models/inventory-transaction.model.js';
import { PositionModel } from '../../database/models/position.model.js';
import { CsvSerializer } from './csv.serializer.js';
import { auditService } from '../audit/audit.service.js';

export function buildDateFilter(
  dateField: string,
  query: ExportDateRangeQuery,
): Record<string, unknown> {
  const from = query.from;
  const to = query.to;

  if (!from && !to) {
    return {};
  }

  const fromDate = from ? new Date(`${from}T00:00:00.000+05:30`) : undefined;
  const toDate = to ? new Date(`${to}T00:00:00.000+05:30`) : undefined;

  if (fromDate && toDate) {
    if (fromDate >= toDate) {
      throw new Error("INVALID_DATE_RANGE: 'from' date must be strictly earlier than 'to' date");
    }
    return { [dateField]: { $gte: fromDate, $lt: toDate } };
  }

  if (fromDate) {
    return { [dateField]: { $gte: fromDate } };
  }

  if (toDate) {
    return { [dateField]: { $lt: toDate } };
  }

  return {};
}

// Canonical P7 ledger signed quantity scalar
const ledgerSignedQuantity = {
  $cond: [
    { $eq: ['$transactionType', 'INWARD_PUTAWAY'] },
    '$quantity',
    {
      $cond: [
        { $eq: ['$transactionType', 'DELIVERY_REVERSAL'] },
        '$quantity',
        {
          $cond: [
            { $eq: ['$transactionType', 'OUTWARD_DELIVERY'] },
            { $multiply: ['$quantity', -1] },
            0,
          ],
        },
      ],
    },
  ],
};

export class ExportService {
  /**
   * Pipes a Mongoose cursor through CsvSerializer to Express response with backpressure,
   * client-disconnect cleanup, and error handling without buffering.
   */
  public async streamCursor<T>(
    cursor: AsyncIterable<T> & { close: () => Promise<void> },
    headers: string[],
    mapDocToCells: (doc: T) => unknown[],
    res: Response,
    filename: string,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Transfer-Encoding', 'chunked');

    let headerWritten = false;
    const transform = new Transform({
      objectMode: true,
      transform(doc: T, _encoding, callback) {
        let chunk = '';
        if (!headerWritten) {
          chunk += CsvSerializer.serializeRow(headers);
          headerWritten = true;
        }
        chunk += CsvSerializer.serializeRow(mapDocToCells(doc));
        callback(null, chunk);
      },
      flush(callback) {
        if (!headerWritten) {
          this.push(CsvSerializer.serializeRow(headers));
        }
        callback();
      },
    });

    res.on('close', () => {
      if (!res.writableEnded) {
        cursor.close().catch(() => {});
        transform.destroy();
      }
    });

    try {
      await pipeline(cursor, transform, res);
    } catch (err: unknown) {
      if (!res.headersSent) {
        throw err;
      }
      res.destroy();
    }
  }

  public async exportGrns(
    facilityId: string,
    query: ExportDateRangeQuery,
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
      details: { entityType: 'grn', filter: query },
    });
    const filter = { facilityId, ...buildDateFilter('date', query) };
    const cursor = GrnModel.find(filter).sort({ createdAt: -1 }).lean().cursor({ batchSize: 500 });
    const headers = [
      'grnNumber',
      'inwardReceiptNumber',
      'date',
      'customerName',
      'commodityName',
      'chamberNumber',
      'bags',
      'bagType',
      'rentType',
      'rentMonths',
      'rentAmount',
      'gpNumber',
      'vehicleNumber',
      'remarks',
      'status',
      'createdAt',
    ];

    await this.streamCursor(
      cursor,
      headers,
      (doc) => [
        doc.grnNumber,
        doc.inwardReceiptNumber,
        doc.date instanceof Date ? doc.date.toISOString().split('T')[0] : doc.date,
        doc.customerName,
        doc.commodityName,
        doc.chamberNumber,
        doc.bags,
        doc.bagType,
        doc.rentType,
        doc.rentMonths ?? '',
        doc.rentAmount,
        doc.gpNumber ?? '',
        doc.vehicleNumber ?? '',
        doc.remarks ?? '',
        doc.status,
        doc.createdAt,
      ],
      res,
      `grns-${facilityId}.csv`,
    );
  }

  public async exportDeliveries(
    facilityId: string,
    query: ExportDateRangeQuery,
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
      details: { entityType: 'delivery', filter: query },
    });
    const filter = { facilityId, ...buildDateFilter('date', query) };
    const cursor = DeliveryChallanModel.find(filter)
      .sort({ createdAt: -1 })
      .lean()
      .cursor({ batchSize: 500 });
    const headers = [
      'challanNumber',
      'date',
      'grnNumber',
      'customerName',
      'commodityName',
      'chamberNumber',
      'totalBags',
      'vehicleNumber',
      'driverName',
      'weight',
      'remarks',
      'status',
      'createdAt',
    ];

    await this.streamCursor(
      cursor,
      headers,
      (doc) => [
        doc.challanNumber,
        doc.date instanceof Date ? doc.date.toISOString().split('T')[0] : doc.date,
        doc.grnNumber,
        doc.customerName,
        doc.commodityName,
        doc.chamberNumber,
        doc.totalBags,
        doc.vehicleNumber ?? '',
        doc.driverName ?? '',
        doc.weight ?? '',
        doc.remarks ?? '',
        doc.status,
        doc.createdAt,
      ],
      res,
      `deliveries-${facilityId}.csv`,
    );
  }

  public async exportInventoryLedger(
    facilityId: string,
    query: ExportDateRangeQuery,
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
      details: { entityType: 'inventory_ledger', filter: query },
    });
    const filter = { facilityId, ...buildDateFilter('createdAt', query) };
    const cursor = InventoryTransactionModel.find(filter)
      .sort({ createdAt: -1 })
      .lean()
      .cursor({ batchSize: 500 });
    const headers = [
      'createdAt',
      'transactionType',
      'grnNumber',
      'positionCode',
      'commodityId',
      'bagType',
      'quantity',
      'referenceType',
      'referenceId',
      'createdBy',
    ];

    await this.streamCursor(
      cursor,
      headers,
      (doc) => [
        doc.createdAt,
        doc.transactionType,
        doc.grnNumber,
        doc.positionCode,
        doc.commodityId,
        doc.bagType,
        doc.quantity,
        doc.referenceType,
        doc.referenceId,
        doc.createdBy,
      ],
      res,
      `inventory-ledger-${facilityId}.csv`,
    );
  }

  public async exportCustomers(
    facilityId: string,
    query: ExportDateRangeQuery,
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
      details: { entityType: 'customer', filter: query },
    });
    const filter = { facilityIds: facilityId, ...buildDateFilter('createdAt', query) };
    const cursor = CustomerModel.find(filter)
      .sort({ createdAt: -1 })
      .lean()
      .cursor({ batchSize: 500 });
    const headers = ['name', 'mobile', 'address', 'gstin', 'isActive', 'createdAt'];

    await this.streamCursor(
      cursor,
      headers,
      (doc) => [
        doc.name,
        doc.mobile,
        doc.address ?? '',
        doc.gstin ?? '',
        doc.isActive,
        doc.createdAt,
      ],
      res,
      `customers-${facilityId}.csv`,
    );
  }

  public async exportStockSummary(
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
    // Phase A: Canonical P7 queries
    const [positionCapacities, chambers, stockBreakdown] = await Promise.all([
      // Installed capacity from PositionModel (without isActive filter, exactly matching P7 Query 1)
      PositionModel.aggregate<{ _id: string; capacityBags: number }>([
        { $match: { facilityId } },
        { $group: { _id: '$chamberId', capacityBags: { $sum: '$capacityBags' } } },
      ]),
      // Chambers metadata (includes all chambers, active and inactive, matching P7 Query 2)
      ChamberModel.find({ facilityId }).select('id chamberNumber isActive').lean().exec(),
      // Chamber occupied bags from InventoryTransactionModel using canonical ledgerSignedQuantity (P7 Query 4)
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
}

export const exportService = new ExportService();
