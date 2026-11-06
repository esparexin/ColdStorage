import { describe, expect, it, vi } from 'vitest';
import { DeliveryChallanModel } from '../database/models/delivery-challan.model.js';
import { DeliveryReversalModel } from '../database/models/delivery-reversal.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { InternalMovementModel } from '../database/models/internal-movement.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { getGrnMovementHistory } from '../modules/common/grn-movement-history.js';

describe('Repack (Sorting) Movement History (Unit)', () => {
  it('records repack decant setting remaining bags to zero and repacked inward putaway with new composition', async () => {
    const facilityId = 'fac-repack-test';
    const grnId = 'grn-repack-001';

    const grnDoc = {
      id: grnId, facilityId, grnNumber: '0088', customerId: 'cust-farmer-1',
      customerName: 'Farmer One', commodityId: 'comm-1', commodityName: 'Potatoes',
      chamber: 'CH-02', date: new Date('2026-11-01T08:00:00.000Z'),
      bags: 90, smallBags: 50, bigBags: 40, isCompositionVerified: true, bagType: 'S/B',
      status: 'OPEN', createdBy: 'usr-1',
    };

    const movRepack = {
      id: 'mov-repack-001', facilityId, movementType: 'REPACK',
      movementDate: new Date('2026-11-05T12:00:00.000Z'), createdAt: new Date('2026-11-05T12:00:00.000Z'),
      grnId, targetGrnId: grnId, grnNumber: '0088',
      totalBagsMoved: 90, smallBagsMoved: 50, bigBagsMoved: 40,
      repackVariance: -10, repackSourceBags: 100, performedBy: 'usr-1',
      remarks: 'Repacked into smaller bags with culling',
    };

    const txGenesis = {
      id: 'tx-genesis', facilityId, grnId, grnNumber: '0088', chamber: 'CH-01',
      commodityId: 'comm-1', bagType: 'S/B', transactionType: 'INWARD_PUTAWAY',
      smallQuantity: 100, bigQuantity: 0, referenceType: 'PUT_AWAY', referenceId: grnId,
      notes: null, createdBy: 'usr-1', createdAt: new Date('2026-11-01T08:00:00.000Z'),
    };

    const txRepackDecant = {
      id: 'tx-repack-decant', facilityId, grnId, grnNumber: '0088', chamber: 'CH-01',
      commodityId: 'comm-1', bagType: 'S/B', transactionType: 'OUTWARD_DELIVERY',
      smallQuantity: 100, bigQuantity: 0, referenceType: 'DELIVERY', referenceId: movRepack.id,
      notes: 'Stock adjustment for repacking (Lot 0088)', createdBy: 'usr-1',
      createdAt: new Date('2026-11-05T12:00:00.000Z'),
    };

    const txRepackPutaway = {
      id: 'tx-repack-putaway', facilityId, grnId, grnNumber: '0088', chamber: 'CH-02',
      commodityId: 'comm-1', bagType: 'S/B', transactionType: 'INWARD_PUTAWAY',
      smallQuantity: 50, bigQuantity: 40, referenceType: 'PUT_AWAY', referenceId: movRepack.id,
      notes: 'Repacked stock putaway (Lot 0088)', createdBy: 'usr-1',
      createdAt: new Date('2026-11-05T12:00:00.000Z'),
    };

    const txList = [txGenesis, txRepackDecant, txRepackPutaway];

    vi.spyOn(GrnModel, 'findOne').mockReturnValue({
      lean: () => ({ exec: async () => grnDoc }),
    } as never);

    vi.spyOn(InventoryTransactionModel, 'find').mockReturnValue({
      sort: () => ({ lean: () => ({ exec: async () => txList }) }),
    } as never);

    vi.spyOn(InternalMovementModel, 'find').mockImplementation(((filter?: { id?: { $in?: string[] } }) => ({
      lean: () => ({
        exec: async () => {
          if (filter?.id?.$in?.includes(movRepack.id)) return [movRepack];
          return [];
        },
      }),
    })) as never);

    vi.spyOn(DeliveryChallanModel, 'find').mockReturnValue({
      lean: () => ({ exec: async () => [] }),
    } as never);

    vi.spyOn(DeliveryReversalModel, 'find').mockReturnValue({
      lean: () => ({ exec: async () => [] }),
    } as never);

    const history = await getGrnMovementHistory(facilityId, grnId);
    expect(history).not.toBeNull();
    expect(history!.totalInwardBags).toBe(100);
    expect(history!.netDeliveredBags).toBe(0);
    expect(history!.currentClosingBags).toBe(90);
    expect(history!.currentClosingSmallBags).toBe(50);
    expect(history!.currentClosingBigBags).toBe(40);

    expect(history!.entries).toHaveLength(3);

    // Entry 0: Initial Inward
    expect(history!.entries[0].type).toBe('INWARD');
    expect(history!.entries[0].closingBags).toBe(100);

    // Entry 1: Repack Outward Decant (old stock remaining balance must be zero)
    expect(history!.entries[1].type).toBe('INTERNAL_REPACK');
    expect(history!.entries[1].openingBags).toBe(100);
    expect(history!.entries[1].deliveredBags).toBe(100);
    expect(history!.entries[1].closingBags).toBe(0);
    expect(history!.entries[1].remainingSmallBags).toBe(0);
    expect(history!.entries[1].remainingBigBags).toBe(0);

    // Entry 2: Repack Inward Putaway (newly confirmed repacked composition)
    expect(history!.entries[2].type).toBe('INTERNAL_REPACK');
    expect(history!.entries[2].openingBags).toBe(0);
    expect(history!.entries[2].receivedBags).toBe(90);
    expect(history!.entries[2].closingBags).toBe(90);
    expect(history!.entries[2].smallBags).toBe(50);
    expect(history!.entries[2].bigBags).toBe(40);
    expect(history!.entries[2].remainingSmallBags).toBe(50);
    expect(history!.entries[2].remainingBigBags).toBe(40);

    vi.restoreAllMocks();
  });
});
