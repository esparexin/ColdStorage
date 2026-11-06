import { describe, expect, it, vi } from 'vitest';
import { DeliveryChallanModel } from '../database/models/delivery-challan.model.js';
import { DeliveryReversalModel } from '../database/models/delivery-reversal.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { InternalMovementModel } from '../database/models/internal-movement.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { getGrnMovementHistory } from '../modules/common/grn-movement-history.js';

describe('Transfer Ownership Movement History (Unit)', () => {
  it('correctly records ownership transfer decant and inward putaway without inflating netDeliveredBags', async () => {
    const facilityId = 'fac-trf-test';
    const grnId = 'grn-trf-001';

    const grnDoc = {
      id: grnId,
      facilityId,
      grnNumber: '0099',
      customerId: 'cust-transferee',
      customerName: 'New Owner Agro',
      commodityId: 'comm-1',
      commodityName: 'Potatoes',
      chamber: 'CH-03',
      date: new Date('2026-11-01T08:00:00.000Z'),
      bags: 100,
      smallBags: 60,
      bigBags: 40,
      isCompositionVerified: true,
      bagType: 'S/B',
      status: 'OPEN',
      createdBy: 'usr-1',
    };

    const movTransfer = {
      id: 'mov-trf-001',
      facilityId,
      movementType: 'TRANSFER_OWNERSHIP',
      movementDate: new Date('2026-11-05T10:00:00.000Z'),
      createdAt: new Date('2026-11-05T10:00:00.000Z'),
      grnId,
      grnNumber: '0099',
      fromCustomerId: 'cust-original',
      fromCustomerName: 'Farmer Original',
      toCustomerId: 'cust-transferee',
      toCustomerName: 'New Owner Agro',
      totalBagsMoved: 100,
      smallBagsMoved: 60,
      bigBagsMoved: 40,
      performedBy: 'usr-1',
      remarks: 'Ownership transfer with confirmed composition',
    };

    const txGenesis = {
      id: 'tx-genesis',
      facilityId,
      grnId,
      grnNumber: '0099',
      chamber: 'CH-03',
      commodityId: 'comm-1',
      bagType: 'S/B',
      transactionType: 'INWARD_PUTAWAY',
      smallQuantity: 100,
      bigQuantity: 0,
      referenceType: 'PUT_AWAY',
      referenceId: grnId,
      notes: null,
      createdBy: 'usr-1',
      createdAt: new Date('2026-11-01T08:00:00.000Z'),
    };

    const txTransferDecant = {
      id: 'tx-trf-decant',
      facilityId,
      grnId,
      grnNumber: '0099',
      chamber: 'CH-03',
      commodityId: 'comm-1',
      bagType: 'S/B',
      transactionType: 'OUTWARD_DELIVERY',
      smallQuantity: 100,
      bigQuantity: 0,
      referenceType: 'DELIVERY',
      referenceId: movTransfer.id,
      notes: 'Stock adjustment for ownership transfer (Lot 0099)',
      createdBy: 'usr-1',
      createdAt: new Date('2026-11-05T10:00:00.000Z'),
    };

    const txTransferPutaway = {
      id: 'tx-trf-putaway',
      facilityId,
      grnId,
      grnNumber: '0099',
      chamber: 'CH-03',
      commodityId: 'comm-1',
      bagType: 'S/B',
      transactionType: 'INWARD_PUTAWAY',
      smallQuantity: 60,
      bigQuantity: 40,
      referenceType: 'PUT_AWAY',
      referenceId: movTransfer.id,
      notes: 'Confirmed stock putaway for ownership transfer (Lot 0099)',
      createdBy: 'usr-1',
      createdAt: new Date('2026-11-05T10:00:00.000Z'),
    };

    const txList = [txGenesis, txTransferDecant, txTransferPutaway];

    vi.spyOn(GrnModel, 'findOne').mockReturnValue({
      lean: () => ({ exec: async () => grnDoc }),
    } as never);

    vi.spyOn(InventoryTransactionModel, 'find').mockReturnValue({
      sort: () => ({ lean: () => ({ exec: async () => txList }) }),
    } as never);

    vi.spyOn(InternalMovementModel, 'find').mockImplementation(((filter?: { movementType?: string }) => ({
      lean: () => ({
        exec: async () => {
          if (filter?.movementType === 'TRANSFER_OWNERSHIP') return [movTransfer];
          return [movTransfer];
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
    // Inward was 100, transfer decant 100, transfer putaway 100
    expect(history!.totalInwardBags).toBe(100);
    // netDeliveredBags MUST BE 0 (internal transfer is not customer delivery)
    expect(history!.netDeliveredBags).toBe(0);
    expect(history!.currentClosingBags).toBe(100);
    expect(history!.currentClosingSmallBags).toBe(60);
    expect(history!.currentClosingBigBags).toBe(40);
    expect(history!.status).toBe('OPEN');

    // Exactly 3 entries: Inward -> Transfer Out (Decant) -> Transfer In (Putaway)
    expect(history!.entries).toHaveLength(3);

    // Entry 0: INWARD
    expect(history!.entries[0].type).toBe('INWARD');
    expect(history!.entries[0].openingBags).toBe(0);
    expect(history!.entries[0].receivedBags).toBe(100);
    expect(history!.entries[0].closingBags).toBe(100);

    // Entry 1: Transfer Outward (Decant old stock to 0)
    expect(history!.entries[1].type).toBe('OWNERSHIP_TRANSFER');
    expect(history!.entries[1].openingBags).toBe(100);
    expect(history!.entries[1].deliveredBags).toBe(100);
    expect(history!.entries[1].closingBags).toBe(0);
    expect(history!.entries[1].remainingSmallBags).toBe(0);
    expect(history!.entries[1].remainingBigBags).toBe(0);

    // Entry 2: Transfer Inward (Confirmed composition to new owner)
    expect(history!.entries[2].type).toBe('OWNERSHIP_TRANSFER');
    expect(history!.entries[2].openingBags).toBe(0);
    expect(history!.entries[2].receivedBags).toBe(100);
    expect(history!.entries[2].closingBags).toBe(100);
    expect(history!.entries[2].smallBags).toBe(60);
    expect(history!.entries[2].bigBags).toBe(40);
    expect(history!.entries[2].remainingSmallBags).toBe(60);
    expect(history!.entries[2].remainingBigBags).toBe(40);

    vi.restoreAllMocks();
  });
});
