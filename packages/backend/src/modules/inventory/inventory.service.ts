import type {
  FacilityInventorySummary,
  GrnInventorySummary,
  InventoryTransaction,
  StockLedgerQuery,
} from '@cold-storage/contracts';
import { ConcurrencyConflictError } from './inventory.mappers.js';
import {
  getFacilityInventorySummary,
  queryStockLedger,
} from './queries/facility-stock.queries.js';
import {
  getAvailableBags,
  getGrnInventorySummary,
} from './queries/stock-summary.queries.js';

export { ConcurrencyConflictError };

export class InventoryService {

  public async getGrnInventorySummary(
    facilityId: string,
    grnId: string,
  ): Promise<GrnInventorySummary> {
    return getGrnInventorySummary(facilityId, grnId);
  }

  public async getAvailableBags(facilityId: string, grnId: string): Promise<number> {
    return getAvailableBags(facilityId, grnId);
  }

  public async getFacilityInventorySummary(facilityId: string): Promise<FacilityInventorySummary> {
    return getFacilityInventorySummary(facilityId);
  }

  public async queryStockLedger(
    facilityId: string,
    query: StockLedgerQuery,
  ): Promise<{ items: InventoryTransaction[]; total: number; page: number; limit: number }> {
    return queryStockLedger(facilityId, query);
  }
}

export const inventoryService = new InventoryService();
