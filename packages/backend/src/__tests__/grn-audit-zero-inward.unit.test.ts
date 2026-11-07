import { describe, expect, it, vi } from 'vitest';
import { DeliveryChallanModel } from '../database/models/delivery-challan.model.js';
import { DeliveryReversalModel } from '../database/models/delivery-reversal.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { InternalMovementModel } from '../database/models/internal-movement.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { getGrnMovementHistory } from '../modules/common/grn-movement-history.js';

describe('GRN Audit: Zero Old Inward Rule Reconciled Movement History (Unit)', () => {
  it('reconciles multi-movement sequence without carrying forward old inward quantities into subsequent IN movements', async () => {
    const facilityId = 'fac-audit-test', grnId = 'grn-audit-0012';
    const grnDoc = {
      id: grnId, facilityId, grnNumber: '0012', customerId: 'cust-1', customerName: 'Customer One',
      commodityId: 'comm-1', commodityName: 'Potatoes', chamber: 'CH-01', date: new Date('2026-11-01T08:00:00.000Z'),
      bags: 120, smallBags: 0, bigBags: 0, isCompositionVerified: true, bagType: 'Hybrid', status: 'CLOSED', createdBy: 'usr-1',
    };

    // Reconcile Audit Sequence: INWARD 67 -> MERGE_OUT 67 -> MERGE_IN 333 -> MERGE_OUT 333 -> MERGE_IN 412 -> MERGE_OUT 412 -> MERGE_IN 200 -> SORT_OUT 200 -> SORT_IN 120 -> OUTWARD 60 -> OUTWARD 60
    const m1 = { id: 'mov-1', facilityId, movementType: 'MERGE', movementDate: new Date('2026-11-02T10:00:00Z'), createdAt: new Date('2026-11-02T10:00:00Z') };
    const m2 = { id: 'mov-2', facilityId, movementType: 'MERGE', movementDate: new Date('2026-11-03T10:00:00Z'), createdAt: new Date('2026-11-03T10:00:00Z') };
    const m3 = { id: 'mov-3', facilityId, movementType: 'MERGE', movementDate: new Date('2026-11-04T10:00:00Z'), createdAt: new Date('2026-11-04T10:00:00Z') };
    const mRepack = { id: 'mov-repack', facilityId, movementType: 'REPACK', movementDate: new Date('2026-11-05T10:00:00Z'), createdAt: new Date('2026-11-05T10:00:00Z') };
    const ch1 = { id: 'ch-1', challanNumber: 'CH-001', date: new Date('2026-11-06T10:00:00Z'), status: 'ISSUED' };
    const ch2 = { id: 'ch-2', challanNumber: 'CH-002', date: new Date('2026-11-07T10:00:00Z'), status: 'ISSUED' };

    const mkTx = (id: string, tt: 'INWARD_PUTAWAY' | 'OUTWARD_DELIVERY', sq: number, bq: number, rt: 'PUT_AWAY' | 'DELIVERY', rid: string, notes: string | null, dt: string) => ({
      id, facilityId, grnId, grnNumber: '0012', chamber: 'CH-01', commodityId: 'comm-1', bagType: 'S/B' as const,
      transactionType: tt, smallQuantity: sq, bigQuantity: bq, referenceType: rt, referenceId: rid, notes, createdBy: 'usr-1', createdAt: new Date(dt),
    });

    const txList = [
      mkTx('tx-1', 'INWARD_PUTAWAY', 67, 0, 'PUT_AWAY', grnId, null, '2026-11-01T08:00:00Z'),
      mkTx('tx-2', 'OUTWARD_DELIVERY', 30, 37, 'DELIVERY', m1.id, 'Merged into GRN 0007', '2026-11-02T10:00:00Z'),
      mkTx('tx-3', 'INWARD_PUTAWAY', 0, 333, 'PUT_AWAY', m1.id, 'Merged and repacked: Re Bagging', '2026-11-02T10:00:01Z'),
      mkTx('tx-4', 'OUTWARD_DELIVERY', 200, 133, 'DELIVERY', m2.id, 'Merged into GRN 0007', '2026-11-03T10:00:00Z'),
      mkTx('tx-5', 'INWARD_PUTAWAY', 4, 408, 'PUT_AWAY', m2.id, 'Merged and repacked from GRNs 0001', '2026-11-03T10:00:01Z'),
      mkTx('tx-6', 'OUTWARD_DELIVERY', 4, 408, 'DELIVERY', m3.id, 'Merged into GRN 0007', '2026-11-04T10:00:00Z'),
      mkTx('tx-7', 'INWARD_PUTAWAY', 80, 120, 'PUT_AWAY', m3.id, 'Merged and repacked from GRNs 0006', '2026-11-04T10:00:01Z'),
      mkTx('tx-8', 'OUTWARD_DELIVERY', 80, 120, 'DELIVERY', mRepack.id, 'Stock adjustment for repacking (Lot 0012)', '2026-11-05T10:00:00Z'),
      mkTx('tx-9', 'INWARD_PUTAWAY', 120, 0, 'PUT_AWAY', mRepack.id, 'Repacked stock putaway (Lot 0012)', '2026-11-05T10:00:01Z'),
      mkTx('tx-10', 'OUTWARD_DELIVERY', 60, 0, 'DELIVERY', ch1.id, 'Outward Delivery 1', '2026-11-06T10:00:00Z'),
      mkTx('tx-11', 'OUTWARD_DELIVERY', 60, 0, 'DELIVERY', ch2.id, 'Outward Delivery 2', '2026-11-07T10:00:00Z'),
    ];

    vi.spyOn(GrnModel, 'findOne').mockReturnValue({ lean: () => ({ exec: async () => grnDoc }) } as never);
    vi.spyOn(InventoryTransactionModel, 'find').mockReturnValue({ sort: () => ({ lean: () => ({ exec: async () => txList }) }) } as never);
    vi.spyOn(InternalMovementModel, 'find').mockImplementation(((filter?: { id?: { $in?: string[] } }) => ({
      lean: () => ({ exec: async () => [m1, m2, m3, mRepack].filter((m) => filter?.id?.$in?.includes(m.id)) }),
    })) as never);
    vi.spyOn(DeliveryChallanModel, 'find').mockReturnValue({ lean: () => ({ exec: async () => [ch1, ch2] }) } as never);
    vi.spyOn(DeliveryReversalModel, 'find').mockReturnValue({ lean: () => ({ exec: async () => [] }) } as never);

    const history = await getGrnMovementHistory(facilityId, grnId);
    expect(history).not.toBeNull();
    const e = history!.entries;

    // Entry 0: Genesis Inward (67 bags, balance 67)
    expect(e[0].type).toBe('INWARD');
    expect(e[0].receivedBags).toBe(67);
    expect(e[0].closingBags).toBe(67);
    // Entry 1: MERGE_OUT (67 bags, balance becomes 0)
    expect(e[1].type).toBe('INTERNAL_MERGE_OUT');
    expect(e[1].deliveredBags).toBe(67);
    expect(e[1].closingBags).toBe(0);
    // Entry 2: MERGE_IN (333 bags, balance becomes 333, opening is 0)
    expect(e[2].type).toBe('INTERNAL_MERGE_IN');
    expect(e[2].openingBags).toBe(0);
    expect(e[2].receivedBags).toBe(333);
    expect(e[2].closingBags).toBe(333);
    // Entry 3: MERGE_OUT (333 bags, balance becomes 0)
    expect(e[3].type).toBe('INTERNAL_MERGE_OUT');
    expect(e[3].deliveredBags).toBe(333);
    expect(e[3].closingBags).toBe(0);
    // Entry 4: MERGE_IN (412 bags, balance becomes 412, opening is 0)
    expect(e[4].type).toBe('INTERNAL_MERGE_IN');
    expect(e[4].openingBags).toBe(0);
    expect(e[4].receivedBags).toBe(412);
    expect(e[4].closingBags).toBe(412);
    // Entry 5: MERGE_OUT (412 bags, balance becomes 0)
    expect(e[5].type).toBe('INTERNAL_MERGE_OUT');
    expect(e[5].deliveredBags).toBe(412);
    expect(e[5].closingBags).toBe(0);
    // Entry 6: MERGE_IN (200 bags, balance becomes 200, opening is 0)
    expect(e[6].type).toBe('INTERNAL_MERGE_IN');
    expect(e[6].openingBags).toBe(0);
    expect(e[6].receivedBags).toBe(200);
    expect(e[6].closingBags).toBe(200);
    // Entry 7: SORT_OUT (200 bags, balance becomes 0)
    expect(e[7].type).toBe('INTERNAL_REPACK');
    expect(e[7].deliveredBags).toBe(200);
    expect(e[7].closingBags).toBe(0);
    // Entry 8: SORT_IN (120 bags, balance becomes 120, opening is 0)
    expect(e[8].type).toBe('INTERNAL_REPACK');
    expect(e[8].openingBags).toBe(0);
    expect(e[8].receivedBags).toBe(120);
    expect(e[8].closingBags).toBe(120);
    // Entry 9: OUTWARD 1 (60 bags, balance becomes 60)
    expect(e[9].type).toBe('PARTIAL_OUTWARD');
    expect(e[9].deliveredBags).toBe(60);
    expect(e[9].closingBags).toBe(60);
    // Entry 10: OUTWARD 2 (60 bags, balance becomes 0)
    expect(e[10].type).toBe('FINAL_OUTWARD');
    expect(e[10].deliveredBags).toBe(60);
    expect(e[10].closingBags).toBe(0);

    vi.restoreAllMocks();
  });

  it('verifies Source GRN-005: Genesis Inward 80 -> MERGE_INTO_OUT 80 results in ZERO remaining balance', async () => {
    const facilityId = 'fac-audit-test', grnId = 'grn-source-005';
    const grnDoc = {
      id: grnId, facilityId, grnNumber: '0005', customerId: 'cust-source', customerName: 'Source Farmer',
      commodityId: 'comm-1', commodityName: 'Potatoes', chamber: 'CH-01', date: new Date('2026-11-01T08:00:00Z'),
      bags: 80, smallBags: 80, bigBags: 0, isCompositionVerified: true, bagType: 'S/B', status: 'CLOSED', createdBy: 'usr-1',
    };
    const mov1 = { id: 'mov-merge-src', facilityId, movementType: 'MERGE', movementDate: new Date('2026-11-02T10:00:00Z'), createdAt: new Date('2026-11-02T10:00:00Z') };
    const txList = [
      { id: 'tx-src-1', facilityId, grnId, grnNumber: '0005', chamber: 'CH-01', commodityId: 'comm-1', bagType: 'S/B' as const, transactionType: 'INWARD_PUTAWAY' as const, smallQuantity: 80, bigQuantity: 0, referenceType: 'PUT_AWAY' as const, referenceId: grnId, notes: null, createdBy: 'usr-1', createdAt: new Date('2026-11-01T08:00:00Z') },
      { id: 'tx-src-2', facilityId, grnId, grnNumber: '0005', chamber: 'CH-01', commodityId: 'comm-1', bagType: 'S/B' as const, transactionType: 'OUTWARD_DELIVERY' as const, smallQuantity: 40, bigQuantity: 40, referenceType: 'DELIVERY' as const, referenceId: mov1.id, notes: 'Merged into GRN 0007: full merge', createdBy: 'usr-1', createdAt: new Date('2026-11-02T10:00:00Z') },
    ];

    vi.spyOn(GrnModel, 'findOne').mockReturnValue({ lean: () => ({ exec: async () => grnDoc }) } as never);
    vi.spyOn(InventoryTransactionModel, 'find').mockReturnValue({ sort: () => ({ lean: () => ({ exec: async () => txList }) }) } as never);
    vi.spyOn(InternalMovementModel, 'find').mockReturnValue({ lean: () => ({ exec: async () => [mov1] }) } as never);
    vi.spyOn(DeliveryChallanModel, 'find').mockReturnValue({ lean: () => ({ exec: async () => [] }) } as never);
    vi.spyOn(DeliveryReversalModel, 'find').mockReturnValue({ lean: () => ({ exec: async () => [] }) } as never);

    const history = await getGrnMovementHistory(facilityId, grnId);
    expect(history).not.toBeNull();
    expect(history!.currentClosingBags).toBe(0);
    expect(history!.entries).toHaveLength(2);
    expect(history!.entries[0].type).toBe('INWARD');
    expect(history!.entries[0].closingBags).toBe(80);
    expect(history!.entries[1].type).toBe('INTERNAL_MERGE_OUT');
    expect(history!.entries[1].deliveredBags).toBe(80);
    expect(history!.entries[1].closingBags).toBe(0);

    vi.restoreAllMocks();
  });
});

