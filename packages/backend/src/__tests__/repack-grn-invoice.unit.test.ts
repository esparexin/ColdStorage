import { describe, expect, it } from 'vitest';
import type { SortingInvoiceDocumentDto } from '@cold-storage/contracts';
import { DOCUMENT_PREFIXES } from '../modules/common/counter.service.js';
import { renderSortingInvoiceTemplate } from '../modules/documents/templates/sorting-invoice.template.js';
import { updateRepackProspectiveRent } from '../modules/internal-movement/handlers/repack-grn.rent.js';
import type { GrnDoc } from '../database/models/grn.model.js';

describe('Sorting, Grading & Repacking Service Invoice (Unit)', () => {
  it('confirms canonical SRT-INV document prefix', () => {
    expect(DOCUMENT_PREFIXES.sortingInvoice).toBe('SRT-INV');
  });

  describe('renderSortingInvoiceTemplate', () => {
    it('renders complete HTML service invoice with labor, bardana, and variance details', () => {
      const dto: SortingInvoiceDocumentDto = {
        organization: {
          orgName: 'Guntur Cold Storage Ltd',
          address: 'Market Yard Road, Guntur, AP - 522001',
          contact: '+91 863 2223344',
          gstin: '37AAAAA0000A1Z5',
          logoAssetId: null,
          printFooter: 'Authorized Warehouse Receipt under AP Cold Storage Regulations',
          timezone: 'Asia/Kolkata',
        },
        facility: {
          facilityId: 'fac-1',
          facilityName: 'Main Storage Unit 1',
          facilityCode: 'MSU1',
          facilityAddress: 'NH-16 Bypass, Guntur',
        },
        sortingInvoiceNumber: 'SRT-INV-2026-0015',
        movementDate: new Date('2026-11-21T06:30:00.000Z'),
        grnNumber: '0012',
        commodityName: 'Teja Mirchi (Red Chilli)',
        chamber: 'CH-02',
        storageMark: 'LOT-0012-A',
        partyMark: 'PM-CHILLI-2026',
        customerId: 'cust-farmer-1',
        customerName: 'Koteswara Rao',
        originalBags: 200,
        originalSmallBags: 80,
        originalBigBags: 120,
        originalBagType: 'S/B',
        repackedBags: 195,
        repackedSmallBags: 75,
        repackedBigBags: 120,
        resultingBagType: 'S/B',
        variance: -5,
        varianceReason: '5 damaged bags culled during quality grading',
        sortingLaborRate: 5,
        sortingLaborCharge: 975,
        newBagsSupplied: 75,
        newBagRate: 40,
        bardanaCharge: 3000,
        totalServiceCharge: 3975,
        remarks: 'Physical sorting, cleaning and rebagging completed',
        generatedAt: new Date('2026-11-21T06:30:00.000Z'),
        generatedBy: 'admin',
      };

      const html = renderSortingInvoiceTemplate(dto);

      expect(html).toContain('SRT-INV-2026-0015');
      expect(html).toContain('SORTING, GRADING &amp; REPACKING SERVICE INVOICE');
      expect(html).toContain('Koteswara Rao');
      expect(html).toContain('Teja Mirchi (Red Chilli)');
      expect(html).toContain('CH-02');
      expect(html).toContain('200 bags (S: 80 · B: 120)');
      expect(html).toContain('195 bags (S: 75 · B: 120)');
      expect(html).toContain('-5 bags');
      expect(html).toContain('5 damaged bags culled during quality grading');
      expect(html).toContain('₹975.00 (@ ₹5/bag)');
      expect(html).toContain('₹3000.00 (75 bags @ ₹40/bag)');
      expect(html).toContain('₹3975.00');
    });

    it('renders clean output for hybrid bag repacking with nil variance', () => {
      const dto: SortingInvoiceDocumentDto = {
        organization: {
          orgName: 'Guntur Cold Storage Ltd',
          address: 'Market Yard Road, Guntur, AP - 522001',
          contact: '+91 863 2223344',
          gstin: '37AAAAA0000A1Z5',
          logoAssetId: null,
          printFooter: 'Authorized Warehouse Receipt',
          timezone: 'Asia/Kolkata',
        },
        facility: {
          facilityId: 'fac-1',
          facilityName: 'Main Storage Unit 1',
          facilityCode: 'MSU1',
          facilityAddress: 'NH-16 Bypass, Guntur',
        },
        sortingInvoiceNumber: 'SRT-INV-2026-0016',
        movementDate: new Date('2026-11-21T07:00:00.000Z'),
        grnNumber: '0015',
        commodityName: 'Bydagi Chilli',
        chamber: 'CH-01',
        storageMark: 'LOT-0015',
        partyMark: null,
        customerId: 'cust-2',
        customerName: 'Suresh Kumar',
        originalBags: 120,
        originalSmallBags: 0,
        originalBigBags: 0,
        originalBagType: 'Hybrid',
        repackedBags: 120,
        repackedSmallBags: 0,
        repackedBigBags: 0,
        resultingBagType: 'Hybrid',
        variance: 0,
        varianceReason: null,
        sortingLaborRate: 6,
        sortingLaborCharge: 720,
        newBagsSupplied: 0,
        newBagRate: 0,
        bardanaCharge: 0,
        totalServiceCharge: 720,
        remarks: null,
        generatedAt: new Date('2026-11-21T07:00:00.000Z'),
        generatedBy: 'admin',
      };

      const html = renderSortingInvoiceTemplate(dto);

      expect(html).toContain('SRT-INV-2026-0016');
      expect(html).toContain('120 bags (Hybrid)');
      expect(html).toContain('Nil (Exact count matched)');
      expect(html).toContain('₹720.00');
      expect(html).toContain('₹0.00 (Own bags supplied)');
    });
  });

  describe('updateRepackProspectiveRent', () => {
    it('adjusts grn.rentAmount proportionally for seasonal subscriptions with new bag counts', () => {
      const mockGrn = {
        date: new Date('2026-03-01'),
        rentType: 'Seasonal',
        bagType: 'S/B',
        bags: 100,
        rentAmount: 10000,
        smallBagPrice: 100,
        bigBagPrice: 100,
      } as unknown as GrnDoc;

      updateRepackProspectiveRent({
        grn: mockGrn,
        previousTotalBags: 100,
        actualRepackedBags: 120,
        inSmall: 60,
        inBig: 60,
        movementDate: new Date('2026-04-01'),
      });

      expect(mockGrn.rentAmount).toBe(12000);
    });

    it('adjusts grn.rentAmount for cross-season repacked lot into running subscription', () => {
      const mockGrn = {
        date: new Date('2024-03-01'),
        rentType: 'Seasonal',
        bagType: 'S/B',
        bags: 100,
        rentAmount: 10000,
        smallBagPrice: 100,
        bigBagPrice: 100,
      } as unknown as GrnDoc;

      updateRepackProspectiveRent({
        grn: mockGrn,
        previousTotalBags: 100,
        actualRepackedBags: 80,
        inSmall: 40,
        inBig: 40,
        movementDate: new Date('2026-05-01'),
      });

      expect(mockGrn.rentAmount).toBe(8000);
    });

    it('preserves rentAmount=0 when lot is unbilled at outward', () => {
      const mockGrn = {
        date: new Date('2026-03-01'),
        rentType: 'Seasonal',
        bagType: 'S/B',
        bags: 100,
        rentAmount: 0,
        smallBagPrice: 100,
        bigBagPrice: 100,
      } as unknown as GrnDoc;

      updateRepackProspectiveRent({
        grn: mockGrn,
        previousTotalBags: 100,
        actualRepackedBags: 120,
        inSmall: 60,
        inBig: 60,
        movementDate: new Date('2026-04-01'),
      });

      expect(mockGrn.rentAmount).toBe(0);
    });
  });
});
