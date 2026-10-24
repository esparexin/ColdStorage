import { describe, expect, it } from 'vitest';
import { parseMergedConsignmentBreakdown } from '../mergedConsignmentBilling.helper';

describe('mergedConsignmentBilling.helper', () => {
  it('returns null for empty or non-merge remarks', () => {
    expect(parseMergedConsignmentBreakdown(null, 50, 'Balaji')).toBeNull();
    expect(parseMergedConsignmentBreakdown('', 50, 'Balaji')).toBeNull();
    expect(
      parseMergedConsignmentBreakdown(
        'Inward entry for dry chilli batch A',
        50,
        'Balaji',
      ),
    ).toBeNull();
  });

  it('accurately parses multi-source repacked merge remarks (e.g. GRN 0013 with 0010 & 0012)', () => {
    const liveRemarks =
      '[MERGE RECEIVED on 2026-10-23: +60 bags (Repacked: 30 S + 30 B = 60 bags). Repacking Hamali: ₹1500 (60 bags @ ₹25/bag) from GRN 0010 (Receipt #RCPT-24-25-0010, Date: 2024-06-10, Customer: Kalyan, Bags: 10, Rent: ₹26100, Paid: ₹0, Balance: ₹26350, Status: Not Settled); GRN 0012 (Receipt #RCPT-25-26-0012, Date: 2025-07-16, Customer: Kalyan, Bags: 12, Rent: ₹13050, Paid: ₹0, Balance: ₹13350, Status: Not Settled). Carried pending rent: ₹39700. Reason: Rebagging as per customer request 2024]';

    const result = parseMergedConsignmentBreakdown(liveRemarks, 74, 'Balaji');
    expect(result).not.toBeNull();
    if (!result) return;

    expect(result.isMergedTarget).toBe(true);
    expect(result.totalMergedAddedBags).toBe(60);
    expect(result.genesisBags).toBe(14);
    expect(result.genesisCustomerName).toBe('Balaji');
    expect(result.totalCarriedRent).toBe(39700);

    // Repack hamali labor
    expect(result.repackHamali).not.toBeNull();
    expect(result.repackHamali?.amount).toBe(1500);
    expect(result.repackHamali?.repackBags).toBe(60);
    expect(result.repackHamali?.ratePerBag).toBe(25);

    // Multi-season sources
    expect(result.sources).toHaveLength(2);

    const s1 = result.sources[0];
    expect(s1.grnNumber).toBe('0010');
    expect(s1.receiptNumber).toBe('RCPT-24-25-0010');
    expect(s1.seasonYear).toBe(2024);
    expect(s1.customerName).toBe('Kalyan');
    expect(s1.bags).toBe(10);
    expect(s1.rentAmount).toBe(26100);
    expect(s1.amountPaid).toBe(0);
    expect(s1.remainingBalance).toBe(26350);
    expect(s1.status).toBe('Not Settled');

    const s2 = result.sources[1];
    expect(s2.grnNumber).toBe('0012');
    expect(s2.receiptNumber).toBe('RCPT-25-26-0012');
    expect(s2.seasonYear).toBe(2025);
    expect(s2.customerName).toBe('Kalyan');
    expect(s2.bags).toBe(12);
    expect(s2.rentAmount).toBe(13050);
    expect(s2.amountPaid).toBe(0);
    expect(s2.remainingBalance).toBe(13350);
    expect(s2.status).toBe('Not Settled');
  });

  it('handles single-source merge without repacking labor', () => {
    const singleRemarks =
      '[MERGE RECEIVED on 2026-10-23: +50 bags from GRN 0005 (Receipt #RCPT-25-26-0005, Date: 2025-05-10, Customer: Ramesh, Bags: 50, Rent: ₹5000, Paid: ₹1000, Balance: ₹4000, Status: Partially Paid). Carried pending rent: ₹4000. Reason: Transfer to warehouse chamber]';

    const result = parseMergedConsignmentBreakdown(singleRemarks, 150, 'Suresh');
    expect(result).not.toBeNull();
    if (!result) return;

    expect(result.totalMergedAddedBags).toBe(50);
    expect(result.genesisBags).toBe(100);
    expect(result.repackHamali).toBeNull();
    expect(result.totalCarriedRent).toBe(4000);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].grnNumber).toBe('0005');
    expect(result.sources[0].seasonYear).toBe(2025);
    expect(result.sources[0].customerName).toBe('Ramesh');
    expect(result.sources[0].remainingBalance).toBe(4000);
  });

  it('accurately parses remarks where source rent is kept as separate pending bills', () => {
    const separateRemarks =
      '[MERGE RECEIVED on 2026-10-23: +60 bags (Repacked: 30 S + 30 B = 60 bags). Repacking Hamali: ₹1500 (60 bags @ ₹25/bag) from GRN 0010 (Receipt #RCPT-24-25-0010, Date: 2024-06-10, Customer: Kalyan, Bags: 10, Rent: ₹26100, Paid: ₹0, Balance: ₹26350, Status: Not Settled); GRN 0012 (Receipt #RCPT-25-26-0012, Date: 2025-07-16, Customer: Kalyan, Bags: 12, Rent: ₹13050, Paid: ₹0, Balance: ₹13350, Status: Not Settled). Source pending rent: ₹39700 kept as separate pending bills. Reason: Rebagging as per customer request 2024]';

    const result = parseMergedConsignmentBreakdown(separateRemarks, 74, 'Balaji');
    expect(result).not.toBeNull();
    if (!result) return;

    expect(result.totalMergedAddedBags).toBe(60);
    expect(result.genesisBags).toBe(14);
    expect(result.totalCarriedRent).toBe(0);
    expect(result.totalSeparateSourceRent).toBe(39700);
    expect(result.sources).toHaveLength(2);
  });
});
