import type {
  CreatePutAwayInput,
  FacilityInventorySummary,
  GrnInventorySummary,
  InventoryTransaction,
  PutAwayAllocation,
  StockLedgerQuery,
} from '@cold-storage/contracts';
import { createPutAwayWithRetry } from './handlers/allocate-stock.handler.js';
import { ConcurrencyConflictError } from './inventory.mappers.js';
import {
  getFacilityInventorySummary,
  queryStockLedger,
} from './queries/facility-stock.queries.js';
import {
  getAvailableBags,
  getGrnInventorySummary,
  listPutAwayAllocations,
} from './queries/stock-summary.queries.js';

export { ConcurrencyConflictError };

export class InventoryService {
  public async createPutAway(
    facilityId: string,
    grnId: string,
    input: CreatePutAwayInput,
    userId: string,
  ): Promise<{ putAway: PutAwayAllocation; summary: GrnInventorySummary }> {
    return createPutAwayWithRetry(facilityId, grnId, input, userId);
  }

  public async listPutAwayAllocations(
    facilityId: string,
    grnId: string,
  ): Promise<PutAwayAllocation[]> {
    return listPutAwayAllocations(facilityId, grnId);
  }

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
