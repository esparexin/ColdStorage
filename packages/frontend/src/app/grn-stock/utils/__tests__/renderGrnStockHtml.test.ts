import { describe, expect, it } from 'vitest';
import type { GrnMovementHistory } from '@cold-storage/contracts';
import { renderGrnStockHtml } from '../renderGrnStockHtml';

describe('renderGrnStockHtml A6 print layout', () => {
  const mockHistory: GrnMovementHistory = {
    grnId: 'grn-1',
    facilityId: 'fac-1',
    grnNumber: 'GRN-2026-1001',
    customerId: 'cust-1',
    customerName: 'Sardar Singh',
    commodityId: 'comm-1',
    commodityName: 'Potatoes (Kufri Jyoti)',
    chamber: 'CH-03',
    inwardDate: new Date('2026-10-11T00:00:00.000Z'),
    totalInwardBags: 300,
    netDeliveredBags: 100,
    currentClosingBags: 200,
    status: 'OPEN',
    entries: [
      {
        date: new Date('2026-10-11T00:00:00.000Z'),
        grnId: 'grn-1',
        grnNumber: 'GRN-2026-1001',
        type: 'INWARD',
        openingBags: 0,
        receivedBags: 300,
        deliveredBags: 0,
        closingBags: 300,
        smallBags: 180,
        bigBags: 120,
        remarks: 'Initial deposit',
      },
      {
        date: new Date('2026-10-12T00:00:00.000Z'),
        grnId: 'grn-1',
        grnNumber: 'GRN-2026-1001',
        type: 'PARTIAL_OUTWARD',
        openingBags: 300,
        receivedBags: 0,
        deliveredBags: 100,
        closingBags: 200,
        smallBags: 60,
        bigBags: 40,
        remarks: 'Partial dispatch to mandi',
      },
    ],
  };

  it('renders valid HTML with A6 landscape dimensions and margin', () => {
    const html = renderGrnStockHtml(mockHistory, 'National Cold Storage');

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('@media print');
    expect(html).toContain('size: 148mm 105mm landscape');
    expect(html).toContain('margin: 5mm');
    expect(html).not.toContain('A4 landscape');
    expect(html).not.toContain('A4 portrait');
    expect(html).not.toContain('Letter');
  });

  it('renders header, customer, summary cards and movement rows accurately', () => {
    const html = renderGrnStockHtml(mockHistory, 'National Cold Storage');

    expect(html).toContain('National Cold Storage');
    expect(html).toContain('GRN-2026-1001');
    expect(html).toContain('Sardar Singh');
    expect(html).toContain('CH-03');
    expect(html).toContain('300 Bags');
    expect(html).toContain('100 Bags');
    expect(html).toContain('200 Bags');
    expect(html).toContain('Initial deposit');
    expect(html).toContain('Partial dispatch to mandi');
  });
});
