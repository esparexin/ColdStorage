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
  getAvailableComposition,
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

  /** Available stock as a bag composition, so callers can reason per bag type. */
  public async getAvailableBags(
    facilityId: string,
    grnId: string,
  ): Promise<{ bags: number; smallBags: number; bigBags: number }> {
    return getAvailableComposition(facilityId, grnId);
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
