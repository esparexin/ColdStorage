import { describe, expect, it } from 'vitest';
import { computeRentBalance } from '../modules/common/rent-balance.js';
import { assertSourceMergeable } from '../modules/internal-movement/handlers/merge-source-move.helper.js';
import {
  formatMergeSourceAuditNote,
  formatMergeSourceSummary,
  type MergeSourceGrn,
  type SourceRentResolution,
} from '../modules/internal-movement/handlers/merge-grn.helper.js';
import type { LedgerBalance } from '../modules/inventory/ledger-balance.js';

function makeGrn(overrides: Partial<MergeSourceGrn>): MergeSourceGrn {
  return {
    id: 'grn-default',
    grnNumber: '0001',
    inwardReceiptNumber: 'RCPT-0001',
    date: new Date('2026-03-15'),
    customerName: 'Kalyan',
    chamber: 'CH-01',
    commodityId: 'cmd-mirchi',
    bagType: 'S/B',
    rentType: 'Seasonal',
    rentAmount: 5000,
    bags: 100,
    smallBags: 50,
    bigBags: 50,
    status: 'OPEN',
    loanStatus: 'NONE',
    ...overrides,
  };
}

describe('assertSourceMergeable (Unit)', () => {
  it('allows Monthly lot inwarded in January merging into Seasonal target when merge date is post-March 1', () => {
    const sourceGrn0005 = makeGrn({
      id: 'grn-0005',
      grnNumber: '0005',
      date: new Date('2026-01-01'),
      rentType: 'Monthly',
      commodityId: 'cmd-mirchi',
    });
    const targetGrn0012 = makeGrn({
      id: 'grn-0012',
      grnNumber: '0012',
      date: new Date('2026-04-10'),
      rentType: 'Seasonal',
      commodityId: 'cmd-mirchi',
    });
    const mergeDate = new Date('2026-11-07');

    expect(() => assertSourceMergeable(sourceGrn0005, targetGrn0012, mergeDate)).not.toThrow();
  });

  it('rejects Monthly lot merging into Seasonal target when merge date is before March 1', () => {
    const sourceGrn0005 = makeGrn({
      id: 'grn-0005',
      grnNumber: '0005',
      date: new Date('2026-01-01'),
      rentType: 'Monthly',
      commodityId: 'cmd-mirchi',
    });
    const targetGrn0012 = makeGrn({
      id: 'grn-0012',
      grnNumber: '0012',
      date: new Date('2026-04-10'),
      rentType: 'Seasonal',
      commodityId: 'cmd-mirchi',
    });
    const preSeasonMergeDate = new Date('2026-02-15');

    expect(() => assertSourceMergeable(sourceGrn0005, targetGrn0012, preSeasonMergeDate)).toThrowError(
      /Rent type mismatch: Source GRN '0005' \(Monthly\) cannot merge into Target '0012' \(Seasonal\)/,
    );
  });

  it('rejects Monthly lot inwarded mid-season merging into Seasonal target', () => {
    const sourceGrnJune = makeGrn({
      id: 'grn-june',
      grnNumber: '0030',
      date: new Date('2026-06-15'),
      rentType: 'Monthly',
      commodityId: 'cmd-mirchi',
    });
    const targetGrn0012 = makeGrn({
      id: 'grn-0012',
      grnNumber: '0012',
      date: new Date('2026-04-10'),
      rentType: 'Seasonal',
      commodityId: 'cmd-mirchi',
    });
    const mergeDate = new Date('2026-11-07');

    expect(() => assertSourceMergeable(sourceGrnJune, targetGrn0012, mergeDate)).toThrowError(
      /Rent type mismatch: Source GRN '0030' \(Monthly\) cannot merge into Target '0012' \(Seasonal\)/,
    );
  });

  it('rejects source lot with status CLOSED', () => {
    const closedSource = makeGrn({
      id: 'grn-closed',
      grnNumber: '0002',
      status: 'CLOSED',
    });
    const target = makeGrn({ id: 'grn-target', grnNumber: '0012' });

    expect(() => assertSourceMergeable(closedSource, target)).toThrowError(
      /Source GRN '0002' is already CLOSED/,
    );
  });

  it('rejects commodity mismatch between source and target', () => {
    const source = makeGrn({ id: 'grn-src', grnNumber: '0003', commodityId: 'cmd-tamarind' });
    const target = makeGrn({ id: 'grn-tgt', grnNumber: '0012', commodityId: 'cmd-mirchi' });

    expect(() => assertSourceMergeable(source, target)).toThrowError(
      /Commodity mismatch/,
    );
  });

  it('rejects source lot with active loan hold', () => {
    const source = makeGrn({ id: 'grn-src', grnNumber: '0004', loanStatus: 'TAKEN' });
    const target = makeGrn({ id: 'grn-tgt', grnNumber: '0012' });

    expect(() => assertSourceMergeable(source, target)).toThrowError(
      /active loan hold/,
    );
  });

  it('allows Seasonal source merging into Seasonal target', () => {
    const source = makeGrn({ id: 'grn-src', grnNumber: '0001', rentType: 'Seasonal' });
    const target = makeGrn({ id: 'grn-tgt', grnNumber: '0012', rentType: 'Seasonal' });

    expect(() => assertSourceMergeable(source, target)).not.toThrow();
  });
});

describe('formatMergeSourceAuditNote and formatMergeSourceSummary (SSOT)', () => {
  const mockRentResolution: SourceRentResolution = {
    effectiveRentAmount: 2100,
    totalPaid: 2100,
    sourceTotalDue: 2100,
    rentBal: computeRentBalance(2100, 2100),
    isSameSeason: true,
    isPendingVerification: false,
    paidAmount: 0,
  };

  it('formats merge source audit note and summary with Small and Big bag breakdown (e.g. 4009 into 4005: Small -5, Big -16)', () => {
    const ledgerBalance: LedgerBalance = {
      total: 21,
      smallBags: 5,
      bigBags: 16,
    };

    const auditNote = formatMergeSourceAuditNote({
      targetGrnNumber: '4005',
      movementDate: new Date('2026-11-27'),
      ledgerBalance,
      rentResolution: mockRentResolution,
      customerName: 'Kalyan',
      remarks: 'Consolidation of remaining stock',
      resolvedBagType: 'S/B',
    });

    expect(auditNote).toContain('[MERGED into GRN 4005 on 2026-11-27: 21 bags cleared (Small -5, Big -16, BagType: S/B).');
    expect(auditNote).toContain('Rent Obligation ₹2100, Paid ₹2100, Pending ₹0');
    expect(auditNote).toContain('Reason: Consolidation of remaining stock');

    const summary = formatMergeSourceSummary({
      grnNumber: '4009',
      inwardReceiptNumber: 'IRN-4009',
      inwardDate: new Date('2026-03-01'),
      customerName: 'Kalyan',
      ledgerBalance,
      rentResolution: mockRentResolution,
      resolvedBagType: 'S/B',
    });

    expect(summary).toBe(
      'GRN 4009 (Receipt #IRN-4009, Date: 2026-03-01, Customer: Kalyan, Bags: 21 [Small -5, Big -16], Rent: ₹2100, Paid: ₹2100, Balance: ₹0, Status: Settled)',
    );
  });

  it('formats merge source audit note and summary with Hybrid composition (e.g. 4009 into 4005: Hybrid -21)', () => {
    const ledgerBalance: LedgerBalance = {
      total: 21,
      smallBags: 0,
      bigBags: 0,
    };

    const auditNote = formatMergeSourceAuditNote({
      targetGrnNumber: '4005',
      movementDate: new Date('2026-11-27'),
      ledgerBalance,
      rentResolution: mockRentResolution,
      customerName: 'Kalyan',
      remarks: 'Consolidation of hybrid lot',
      resolvedBagType: 'Hybrid',
    });

    expect(auditNote).toContain('[MERGED into GRN 4005 on 2026-11-27: 21 bags cleared (Hybrid -21).');
    expect(auditNote).toContain('Rent Obligation ₹2100, Paid ₹2100, Pending ₹0');

    const summary = formatMergeSourceSummary({
      grnNumber: '4009',
      inwardReceiptNumber: 'IRN-4009',
      inwardDate: new Date('2026-03-01'),
      customerName: 'Kalyan',
      ledgerBalance,
      rentResolution: mockRentResolution,
      resolvedBagType: 'Hybrid',
    });

    expect(summary).toBe(
      'GRN 4009 (Receipt #IRN-4009, Date: 2026-03-01, Customer: Kalyan, Bags: 21 [Hybrid -21], Rent: ₹2100, Paid: ₹2100, Balance: ₹0, Status: Settled)',
    );
  });
});
