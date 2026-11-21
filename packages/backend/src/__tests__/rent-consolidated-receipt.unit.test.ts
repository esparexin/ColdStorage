import { describe, expect, it } from 'vitest';
import type { RentReceiptDocumentDto } from '@cold-storage/contracts';
import { renderRentReceiptTemplate } from '../modules/documents/templates/rent-receipt.template.js';

describe('Consolidated Rent Payment Receipt for Multiple Partial Outwards (Unit)', () => {
  const baseOrg = {
    orgName: 'Sri Venkateswara Cold Storage',
    address: 'Market Yard Road, Guntur, AP - 522001',
    contact: '+91 863 2345678',
    gstin: '37AAAAA0000A1Z5',
    logoAssetId: null,
    printFooter: 'Authoritative Rent Settlement Document',
    timezone: 'Asia/Kolkata',
  };

  const baseFacility = {
    facilityId: 'fac-1',
    facilityName: 'Guntur Central Cold Hub',
    facilityCode: 'GCCH',
    facilityAddress: 'NH-16, Guntur',
  };

  it('renders consolidated rent receipt with itemized breakdown table for multiple partial outwards', () => {
    const dto: RentReceiptDocumentDto = {
      organization: baseOrg,
      facility: baseFacility,
      receiptNumber: 'RRCPT-2026-0099',
      grnNumber: 'GRN-2026-0042',
      inwardReceiptNumber: 'INW-2026-0042',
      inwardDate: new Date('2026-04-01T10:00:00.000Z'),
      date: new Date('2026-11-21T10:00:00.000Z'),
      customerName: 'Chalasani Sambasiva Rao',
      commodityName: 'Teja Dry Chilli',
      chamber: 'Chamber 3',
      bagType: 'S',
      inwardBags: 500,
      deliveredBags: 400,
      remainingBags: 100,
      bagPrice: null,
      smallBagPrice: 15,
      bigBagPrice: 20,
      rentType: 'Seasonal',
      billingCyclePeriod: 'Seasonal 2026',
      totalRentObligation: 6000,
      previousPaidAmount: 0,
      amountPaid: 6000,
      paymentMode: 'Cash',
      remainingBalance: 0,
      paymentStatus: 'Settled',
      isPreview: false,
      notes: 'Final settlement across 3 partial outward deliveries',
      traceDetails: 'Consolidated Settlement: 3 Gate Passes',
      creditedChallans: [
        {
          challanNumber: 'CHL-2026-0010',
          gpNumber: 'GP-001',
          date: new Date('2026-06-15T09:00:00.000Z'),
          bags: 100,
          rentCharge: 1500,
          amountCredited: 1500,
          status: 'Settled',
        },
        {
          challanNumber: 'CHL-2026-0018',
          gpNumber: 'GP-002',
          date: new Date('2026-08-20T09:00:00.000Z'),
          bags: 150,
          rentCharge: 2250,
          amountCredited: 2250,
          status: 'Settled',
        },
        {
          challanNumber: 'CHL-2026-0029',
          gpNumber: 'GP-003',
          date: new Date('2026-10-10T09:00:00.000Z'),
          bags: 150,
          rentCharge: 2250,
          amountCredited: 2250,
          status: 'Settled',
        },
      ],
      generatedAt: new Date('2026-11-21T10:30:00.000Z'),
      generatedBy: 'Accountant Subbarao',
    };

    const html = renderRentReceiptTemplate(dto);

    // Consolidated Title Header
    expect(html).toContain('CONSOLIDATED RENT PAYMENT RECEIPT');
    expect(html).toContain('RRCPT-2026-0099');
    expect(html).toContain('Chalasani Sambasiva Rao');
    expect(html).toContain('GRN-2026-0042');
    expect(html).toContain('Teja Dry Chilli');

    // Section header
    expect(html).toContain('Settled Outward Deliveries Breakdown (విడతల వారీ డెలివరీల వివరాలు):');

    // Itemized partial outward challans
    expect(html).toContain('CHL-2026-0010');
    expect(html).toContain('GP: GP-001');
    expect(html).toContain('100');
    expect(html).toContain('₹1500.00');

    expect(html).toContain('CHL-2026-0018');
    expect(html).toContain('GP: GP-002');
    expect(html).toContain('150');
    expect(html).toContain('₹2250.00');

    expect(html).toContain('CHL-2026-0029');
    expect(html).toContain('GP: GP-003');

    // Settlement figures
    expect(html).toContain('₹6000.00');
    expect(html).toContain('Settled');
    expect(html).toContain('₹0.00');
  });

  it('renders standard cash memo layout for single delivery payment', () => {
    const dto: RentReceiptDocumentDto = {
      organization: baseOrg,
      facility: baseFacility,
      receiptNumber: 'RRCPT-2026-0001',
      grnNumber: 'GRN-2026-0005',
      inwardDate: new Date('2026-04-01T10:00:00.000Z'),
      date: new Date('2026-05-10T10:00:00.000Z'),
      customerName: 'Koteswara Rao',
      commodityName: 'Potato',
      chamber: 'Chamber 1',
      bagType: 'B',
      inwardBags: 200,
      deliveredBags: 50,
      remainingBags: 150,
      smallBagPrice: 10,
      bigBagPrice: 15,
      rentType: 'Seasonal',
      totalRentObligation: 750,
      amountPaid: 750,
      paymentMode: 'Cash',
      remainingBalance: 0,
      paymentStatus: 'Settled',
      isPreview: false,
      creditedChallans: [
        {
          challanNumber: 'CHL-2026-0001',
          gpNumber: 'GP-101',
          date: new Date('2026-05-10T09:00:00.000Z'),
          bags: 50,
          rentCharge: 750,
          amountCredited: 750,
          status: 'Settled',
        },
      ],
      generatedAt: new Date('2026-05-10T10:30:00.000Z'),
      generatedBy: 'Clerk Ramu',
    };

    const html = renderRentReceiptTemplate(dto);

    expect(html).toContain('CASH MEMO / RENT PAYMENT RECEIPT');
    expect(html).toContain('Outward Delivery Details:');
    expect(html).toContain('CHL-2026-0001');
    expect(html).toContain('GP: GP-101');
  });
});
