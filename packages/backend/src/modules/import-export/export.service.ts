import type { Response } from 'express';
import type { ExportDateRangeQuery } from '@cold-storage/contracts';
import { CustomerModel } from '../../database/models/customer.model.js';
import { DeliveryChallanModel } from '../../database/models/delivery-challan.model.js';
import { GrnModel } from '../../database/models/grn.model.js';
import { InventoryTransactionModel } from '../../database/models/inventory-transaction.model.js';
import { auditService } from '../audit/audit.service.js';
import { buildDateFilter, streamCursor } from './csv-stream.helper.js';
import { exportStockSummary } from './handlers/stock-summary-export.handler.js';

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
    return streamCursor(cursor, headers, mapDocToCells, res, filename);
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

    await streamCursor(
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

    await streamCursor(
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

    await streamCursor(
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

    await streamCursor(
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
    return exportStockSummary(facilityId, res, userId);
  }
}

export const exportService = new ExportService();
