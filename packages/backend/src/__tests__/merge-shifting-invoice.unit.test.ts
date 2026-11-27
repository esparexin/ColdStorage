import { describe, expect, it } from 'vitest';
import type { MergeShiftingInvoiceDocumentDto } from '@cold-storage/contracts';
import { buildMergeTargetUpdates } from '../modules/internal-movement/handlers/merge-grn-remarks.helper.js';
import { renderMergeShiftingInvoiceTemplate } from '../modules/documents/templates/merge-shifting-invoice.template.js';

describe('Consignment Merge & Internal Shifting Invoice (Unit)', () => {
  describe('buildMergeTargetUpdates', () => {
    it('serializes authoritative remarks with invoice number, repacked count, and source summaries', () => {
      const result = buildMergeTargetUpdates({
        destinationChamber: 'CH-03',
        resultingBagType: 'S/B',
        newBags: 250,
        newSmall: 150,
        newBig: 100,
        newIsCompositionVerified: true,
        newRentAmount: 37500,
        moveDate: new Date('2026-11-21T06:00:00.000Z'),
        actualMovedBags: 100,
        totalMovedBags: 100,
        totalMovedSmall: 60,
        totalMovedBig: 40,
        repackVariance: 0,
        repackHamaliCharge: 500,
        repackHamaliBags: 100,
        repackHamaliRate: 5,
        finalCarriedRent: 1200,
        totalSourcePendingRent: 0,
        sourceSummaries: ['GRN 1001 (100 bags from CH-01)'],
        mergeInvoiceNumber: 'MSH-INV-2026-0001',
        targetGrn: {
          remarks: 'Initial lot inwarded',
          storageMark: 'SM-200',
          partyMark: 'PM-TARGET',
        },
        input: {
          targetGrnId: 'grn-target',
          sourceGrnIds: ['grn-source-1'],
          movementDate: new Date('2026-11-21'),
          additionalRentAmount: 1200,
          remarks: 'Consolidation of remaining chili stock',
          destinationChamber: 'CH-03',
          repackedSmallBags: 60,
          repackedBigBags: 40,
        },
      });

      expect(result.targetNote).toContain('[MERGE RECEIVED on 2026-11-21 (#MSH-INV-2026-0001): +100 bags (Repacked: 60 S + 40 B = 100 bags)');
      expect(result.targetNote).toContain('. Repacking Hamali: ₹500 (100 bags @ ₹5/bag)');
      expect(result.targetNote).toContain('. Additional rent: ₹1200');
      expect(result.targetNote).toContain('from GRN 1001 (100 bags from CH-01)');
      expect(result.targetNote).toContain('Reason: Consolidation of remaining chili stock]');

      expect(result.updatedTargetRemarks).toContain('Initial lot inwarded');
      expect(result.updatedTargetRemarks).toContain(result.targetNote);

      expect(result.targetUpdateFields.chamber).toBe('CH-03');
      expect(result.targetUpdateFields.bagType).toBe('S/B');
      expect(result.targetUpdateFields.bags).toBe(250);
      expect(result.targetUpdateFields.rentAmount).toBe(37500);
      expect(result.targetUpdateFields.isCompositionVerified).toBe(true);
    });

    it('formats Hybrid bag type notes cleanly with repacking variance', () => {
      const result = buildMergeTargetUpdates({
        destinationChamber: 'CH-02',
        resultingBagType: 'Hybrid',
        newBags: 120,
        newSmall: 0,
        newBig: 0,
        newIsCompositionVerified: true,
        newRentAmount: 18000,
        moveDate: new Date('2026-11-21T06:00:00.000Z'),
        actualMovedBags: 80,
        totalMovedBags: 78,
        totalMovedSmall: 0,
        totalMovedBig: 0,
        repackVariance: 2,
        repackHamaliCharge: 0,
        repackHamaliBags: 0,
        repackHamaliRate: 0,
        finalCarriedRent: 0,
        totalSourcePendingRent: 0,
        sourceSummaries: ['GRN 2002 (78 bags)'],
        mergeInvoiceNumber: 'MSH-INV-2026-0002',
        targetGrn: {
          remarks: null,
          storageMark: 'SM-300',
        },
        input: {
          targetGrnId: 'grn-target-2',
          sourceGrnIds: ['grn-source-2'],
          movementDate: new Date('2026-11-21'),
          additionalRentAmount: 0,
          remarks: 'Consolidated hybrid lot',
          sourceBagCategory: 'Hybrid',
        },
      });

      expect(result.targetNote).toContain('[MERGE RECEIVED on 2026-11-21 (#MSH-INV-2026-0002): +80 bags (Confirmed Hybrid: 80 bags; Variance from 78 source bags: +2 bags)');
      expect(result.targetUpdateFields.bagType).toBe('Hybrid');
      expect(result.targetUpdateFields.bags).toBe(120);
    });
  });

  describe('renderMergeShiftingInvoiceTemplate', () => {
    it('renders server-side HTML layout with surviving target lot, extinguished source lots, and certification', () => {
      const dto: MergeShiftingInvoiceDocumentDto = {
        organization: {
          orgName: 'Godavari Cold Storage Ltd',
          address: 'NH-16 Industrial Corridor, Guntur, AP',
          contact: '+91 98480 54321',
          gstin: '37ABCDE1234F1Z5',
          printFooter: 'Cold Storage Operations Management',
          timezone: 'Asia/Kolkata',
        },
        facility: {
          facilityId: 'fac-01',
          facilityName: 'Guntur Central Facility',
          facilityCode: 'GCF-01',
          facilityAddress: 'Plot 4, Mirchi Yard, Guntur, AP',
        },
        mergeInvoiceNumber: 'MSH-INV-2026-0001',
        movementDate: new Date('2026-11-21T10:00:00.000Z'),
        targetGrnId: 'grn-surviving',
        targetGrnNumber: 'GRN-5001',
        customerName: 'Srinivasa Agro Exports',
        customerId: 'cust-5001',
        commodityName: 'Teja Red Chilli',
        destinationChamber: 'Chamber 4',
        storageMark: 'LOT-TGT-01',
        partyMark: 'SAE-RED',
        survivingBags: 300,
        survivingSmallBags: 180,
        survivingBigBags: 120,
        resultingBagType: 'S/B',
        totalMergedBags: 150,
        sourceLots: [
          {
            grnId: 'grn-src-1',
            grnNumber: 'GRN-4001',
            customerName: 'Srinivasa Agro Exports',
            originalChamber: 'Chamber 1',
            movedBags: 100,
            smallBags: 60,
            bigBags: 40,
            bagType: 'S/B',
            pendingRentSettled: 0,
          },
          {
            grnId: 'grn-src-2',
            grnNumber: 'GRN-4002',
            customerName: 'Srinivasa Agro Exports',
            originalChamber: 'Chamber 2',
            movedBags: 50,
            smallBags: 30,
            bigBags: 20,
            bagType: 'S/B',
            pendingRentSettled: 0,
          },
        ],
        repackHamaliCharge: 750,
        repackHamaliRate: 5,
        repackVariance: 0,
        carriedRentAmount: 2500,
        totalDueAtMerge: 45000,
        totalPaidAtMerge: 10000,
        remarks: 'Merged and shifted to Chamber 4 for better humidity management',
        generatedAt: new Date('2026-11-21T10:30:00.000Z'),
        generatedBy: 'admin',
      };

      const html = renderMergeShiftingInvoiceTemplate(dto);

      expect(html).toContain('CONSIGNMENT MERGE &amp; INTERNAL SHIFTING INVOICE');
      expect(html).toContain('MSH-INV-2026-0001');
      expect(html).toContain('GRN-5001');
      expect(html).toContain('Srinivasa Agro Exports');
      expect(html).toContain('Chamber 4');
      expect(html).toContain('GRN-4001');
      expect(html).toContain('GRN-4002');
      expect(html).toContain('₹750.00');
      expect(html).toContain('₹2500.00');
      expect(html).toContain('CERTIFICATE OF CONSIGNMENT MERGE &amp; INTERNAL SHIFTING');
      expect(html).toContain('Warehouse Manager');
      expect(html).toContain('Labor Mukaddam');
      expect(html).not.toContain('Repack Physical Variance');
    });
  });
});
