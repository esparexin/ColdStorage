import { describe, expect, it } from 'vitest';
import type { TransferDeedDocumentDto } from '@cold-storage/contracts';
import { formatTransferAuditNote } from '../modules/internal-movement/handlers/transfer-ownership.helper.js';
import { renderTransferDeedTemplate } from '../modules/documents/templates/transfer-deed.template.js';

describe('Transfer Ownership Deed & Invoice (Unit)', () => {
  describe('formatTransferAuditNote', () => {
    it('serializes explicit bag breakdown, transfer invoice number, and transfer fee with payer', () => {
      const note = formatTransferAuditNote({
        transferDateStr: '2026-11-05',
        fromName: 'Ramu Patel',
        fromId: 'cust-ramu',
        toName: 'Somu Agro',
        toId: 'cust-somu',
        totalBags: 100,
        smallBags: 60,
        bigBags: 40,
        bagType: 'S/B',
        transferInvoiceNumber: 'TRF-INV-2026-0001',
        transferFeeCharged: 500,
        feePayer: 'BUYER',
        paymentRecord: undefined,
        effectiveRentBal: {
          rentAmount: 15000,
          totalPaid: 15000,
          remainingBalance: 0,
          paymentStatus: 'Settled',
          isPartial: false,
          rentState: 'SETTLED',
        },
        remarks: 'Sale deed executed between parties',
      });

      expect(note).toContain('[OWNERSHIP TRANSFERRED on 2026-11-05: +100 bags (S: 60 • B: 40, BagType: S/B) Invoice: #TRF-INV-2026-0001 Transfer Fee: ₹500 (Paid by BUYER)');
      expect(note).toContain('from Ramu Patel (ID: cust-ramu) to Somu Agro (ID: cust-somu)');
      expect(note).toContain('Rent obligation: ₹15000 previously settled');
      expect(note).toContain('Reason: Sale deed executed between parties]');
    });

    it('formats hybrid bag type cleanly without small/big breakdown', () => {
      const note = formatTransferAuditNote({
        transferDateStr: '2026-11-05',
        fromName: 'Ramu Patel',
        fromId: 'cust-ramu',
        toName: 'Somu Agro',
        toId: 'cust-somu',
        totalBags: 80,
        smallBags: 0,
        bigBags: 0,
        bagType: 'Hybrid',
        transferInvoiceNumber: 'TRF-INV-2026-0002',
        transferFeeCharged: 0,
        feePayer: null,
        paymentRecord: undefined,
        effectiveRentBal: {
          rentAmount: 8000,
          totalPaid: 0,
          remainingBalance: 8000,
          paymentStatus: 'Not Settled',
          isPartial: false,
          rentState: 'PENDING',
        },
        remarks: 'Agreed pending transfer',
      });

      expect(note).toContain('[OWNERSHIP TRANSFERRED on 2026-11-05: +80 bags (Hybrid) Invoice: #TRF-INV-2026-0002');
      expect(note).not.toContain('Transfer Fee:');
      expect(note).toContain('Pending rent obligation: ₹8000 carried forward under agreed pending terms');
    });
  });

  describe('renderTransferDeedTemplate', () => {
    it('renders complete legal tripartite deed HTML with invoice number, seller, buyer, fees, and signatures', () => {
      const dto: TransferDeedDocumentDto = {
        organization: {
          orgName: 'Apex Cold Chain Systems',
          address: 'Main Road, Market Yard, Guntur, AP',
          contact: '+91 98480 12345',
          gstin: '37AAAAA0000A1Z5',
          printFooter: 'Cold Storage Management System',
          timezone: 'Asia/Kolkata',
        },
        facility: {
          facilityId: 'fac-001',
          facilityName: 'Sri Krishna Cold Storage',
          facilityCode: 'SKCS-01',
          facilityAddress: 'NH-16, Guntur, AP',
        },
        transferInvoiceNumber: 'TRF-INV-2026-0042',
        movementDate: new Date('2026-11-05T10:00:00.000Z'),
        grnNumber: 'GRN-007',
        commodityName: 'Dry Red Chilli',
        chamber: 'Chamber 2',
        storageMark: 'LOT-A1',
        partyMark: 'PM-99',
        sellerId: 'cust-seller',
        sellerName: 'Venkata Ramana',
        buyerId: 'cust-buyer',
        buyerName: 'Narayana Traders',
        transferredBags: 100,
        smallBags: 60,
        bigBags: 40,
        bagType: 'S/B',
        isHybrid: false,
        transferFeeCharged: 500,
        feePayer: 'BUYER',
        paymentDecision: 'SETTLE_NOW',
        settledAmount: 12000,
        rentReceiptNumber: 'RCPT-2026-0088',
        carriedRentAmount: 0,
        totalRentObligation: 12000,
        remarks: 'Transferred all title and rights',
        generatedAt: new Date('2026-11-05T12:00:00.000Z'),
        generatedBy: 'Manager Rao',
      };

      const html = renderTransferDeedTemplate(dto);

      expect(html).toContain('TRF-INV-2026-0042');
      expect(html).toContain('Apex Cold Chain Systems');
      expect(html).toContain('Venkata Ramana');
      expect(html).toContain('Narayana Traders');
      expect(html).toContain('Dry Red Chilli');
      expect(html).toContain('GRN-007');
      expect(html).toContain('Small: 60 · Big: 40');
      expect(html).toContain('₹500.00 (Paid by BUYER)');
      expect(html).toContain('RCPT-2026-0088');
      expect(html).toContain('Transferor (Seller) Signature');
      expect(html).toContain('Transferee (Buyer) Signature');
      expect(html).toContain('Authorized Cold Storage Signatory');
    });
  });
});
