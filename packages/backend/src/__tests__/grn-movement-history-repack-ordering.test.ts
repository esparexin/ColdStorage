import { describe, expect, it, vi } from 'vitest';
import { DeliveryChallanModel } from '../database/models/delivery-challan.model.js';
import { DeliveryReversalModel } from '../database/models/delivery-reversal.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { InternalMovementModel } from '../database/models/internal-movement.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { getGrnMovementHistory } from '../modules/common/grn-movement-history.js';

describe('GRN Movement History Repack Ordering (Unit)', () => {
  it('correctly sequences same-day merge-in and subsequent repack decant to prevent premature clamping', async () => {
    const facilityId = 'fac-test-1';
    const grnId = 'grn-0007';

    const grnDoc = {
      id: grnId,
      facilityId,
      grnNumber: '0007',
      customerId: 'cust-1',
      customerName: 'Kalyan',
      commodityId: 'comm-1',
      commodityName: 'Mirchi',
      chamber: 'CH-01',
      date: new Date('2026-11-02T03:17:41.340Z'),
      bags: 140,
      smallBags: 70,
      bigBags: 70,
      isCompositionVerified: true,
      bagType: 'S/B',
      status: 'OPEN',
      createdBy: 'usr-1',
    };

    const mov0008 = {
      id: 'mov-0008-merge',
      facilityId,
      movementType: 'MERGE',
      movementDate: new Date('2026-11-02T00:00:00.000Z'),
      createdAt: new Date('2026-11-02T10:10:10.773Z'),
      targetGrnId: grnId,
      sourceGrnIds: ['grn-0008'],
      totalBagsMoved: 18,
      smallBagsMoved: 4,
      bigBagsMoved: 14,
      performedBy: 'usr-1',
      remarks: 'user requested',
    };

    const mov0011 = {
      id: 'mov-0011-repack',
      facilityId,
      movementType: 'MERGE',
      movementDate: new Date('2026-11-02T00:00:00.000Z'),
      createdAt: new Date('2026-11-02T14:52:32.420Z'),
      targetGrnId: grnId,
      sourceGrnIds: ['grn-0011'],
      totalBagsMoved: 140,
      smallBagsMoved: 70,
      bigBagsMoved: 70,
      performedBy: 'usr-1',
      remarks: 'user requested',
    };

    const txGenesis = {
      id: 'tx-genesis',
      facilityId,
      grnId,
      grnNumber: '0007',
      chamber: 'CH-01',
      commodityId: 'comm-1',
      bagType: 'S/B',
      transactionType: 'INWARD_PUTAWAY',
      smallQuantity: 12,
      bigQuantity: 0,
      referenceType: 'PUT_AWAY',
      referenceId: grnId,
      notes: null,
      createdBy: 'usr-1',
      createdAt: new Date('2026-11-02T03:17:41.340Z'),
    };

    const txMerge0008 = {
      id: 'tx-merge-0008',
      facilityId,
      grnId,
      grnNumber: '0007',
      chamber: 'CH-01',
      commodityId: 'comm-1',
      bagType: 'S/B',
      transactionType: 'INWARD_PUTAWAY',
      smallQuantity: 4,
      bigQuantity: 14,
      referenceType: 'PUT_AWAY',
      referenceId: mov0008.id,
      notes: 'Merged from GRNs 0008: user requested',
      createdBy: 'usr-1',
      createdAt: new Date('2026-11-02T00:00:00.000Z'),
    };

    const txRepackDecant = {
      id: 'tx-repack-decant',
      facilityId,
      grnId,
      grnNumber: '0007',
      chamber: 'CH-01',
      commodityId: 'comm-1',
      bagType: 'S/B',
      transactionType: 'OUTWARD_DELIVERY',
      smallQuantity: 16,
      bigQuantity: 14,
      referenceType: 'DELIVERY',
      referenceId: mov0011.id,
      notes: 'Stock adjustment for repacking (Lot 0007)',
      createdBy: 'usr-1',
      createdAt: new Date('2026-11-02T00:00:00.000Z'),
    };

    const txRepackPutaway = {
      id: 'tx-repack-putaway',
      facilityId,
      grnId,
      grnNumber: '0007',
      chamber: 'CH-01',
      commodityId: 'comm-1',
      bagType: 'S/B',
      transactionType: 'INWARD_PUTAWAY',
      smallQuantity: 70,
      bigQuantity: 70,
      referenceType: 'PUT_AWAY',
      referenceId: mov0011.id,
      notes: 'Merged and repacked from GRNs 0011: user requested',
      createdBy: 'usr-1',
      createdAt: new Date('2026-11-02T00:00:00.000Z'),
    };

    const txList = [txGenesis, txMerge0008, txRepackDecant, txRepackPutaway];

    vi.spyOn(GrnModel, 'findOne').mockReturnValue({
      lean: () => ({ exec: async () => grnDoc }),
    } as any);

    vi.spyOn(InventoryTransactionModel, 'find').mockReturnValue({
      sort: () => ({ lean: () => ({ exec: async () => txList }) }),
    } as any);

    vi.spyOn(InternalMovementModel, 'find').mockImplementation(((filter: any) => ({
      lean: () => ({
        exec: async () => {
          if (filter?.movementType === 'TRANSFER_OWNERSHIP') return [];
          return [mov0008, mov0011];
        },
      }),
    })) as any);

    vi.spyOn(DeliveryChallanModel, 'find').mockReturnValue({
      lean: () => ({ exec: async () => [] }),
    } as any);

    vi.spyOn(DeliveryReversalModel, 'find').mockReturnValue({
      lean: () => ({ exec: async () => [] }),
    } as any);

    const history = await getGrnMovementHistory(facilityId, grnId);
    expect(history).not.toBeNull();
    expect(history!.currentClosingBags).toBe(140);
    expect(history!.currentClosingSmallBags).toBe(70);
    expect(history!.currentClosingBigBags).toBe(70);
    expect(history!.status).toBe('OPEN');
    expect(history!.entries).toHaveLength(4);

    expect(history!.entries[0].type).toBe('INWARD');
    expect(history!.entries[0].closingBags).toBe(12);

    expect(history!.entries[1].type).toBe('INTERNAL_MERGE_IN');
    expect(history!.entries[1].openingBags).toBe(12);
    expect(history!.entries[1].receivedBags).toBe(18);
    expect(history!.entries[1].closingBags).toBe(30);

    expect(history!.entries[2].type).toBe('INTERNAL_REPACK');
    expect(history!.entries[2].openingBags).toBe(30);
    expect(history!.entries[2].deliveredBags).toBe(30);
    expect(history!.entries[2].closingBags).toBe(0);

    expect(history!.entries[3].type).toBe('INTERNAL_MERGE_IN');
    expect(history!.entries[3].openingBags).toBe(0);
    expect(history!.entries[3].receivedBags).toBe(140);
    expect(history!.entries[3].closingBags).toBe(140);

    vi.restoreAllMocks();
  });
});
