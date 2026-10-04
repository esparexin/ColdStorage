import type { Response } from 'express';
import type { ExportDateRangeQuery } from '@cold-storage/contracts';
import { CustomerModel } from '../../database/models/customer.model.js';
import { DeliveryChallanModel } from '../../database/models/delivery-challan.model.js';
import { GrnModel } from '../../database/models/grn.model.js';
import { InventoryTransactionModel } from '../../database/models/inventory-transaction.model.js';
import { auditService } from '../audit/audit.service.js';
import { buildDateFilter, streamCursor } from './csv-stream.helper.js';
import {
  DELIVERY_EXPORT_HEADERS,
  GRN_EXPORT_HEADERS,
  LEDGER_EXPORT_HEADERS,
  mapDeliveryToCells,
  mapGrnToCells,
  mapLedgerToCells,
} from './export-columns.js';
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
    await streamCursor(
      cursor,
      [...GRN_EXPORT_HEADERS],
      mapGrnToCells,
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
    await streamCursor(
      cursor,
      [...DELIVERY_EXPORT_HEADERS],
      mapDeliveryToCells,
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
    await streamCursor(
      cursor,
      [...LEDGER_EXPORT_HEADERS],
      mapLedgerToCells,
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
    const headers = ['name', 'isActive', 'createdAt'];

    await streamCursor(
      cursor,
      headers,
      (doc) => [doc.name, doc.isActive, doc.createdAt],
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
