import { describe, expect, it } from 'vitest';
import {
  challanDocumentDtoSchema,
  grnDocumentDtoSchema,
  receiptDocumentDtoSchema,
  rentReceiptDocumentDtoSchema,
  rentReceiptPreviewDtoSchema,
} from '@cold-storage/contracts';
import { renderChallanTemplate } from '../modules/documents/templates/challan.template.js';
import { renderGrnTemplate } from '../modules/documents/templates/grn.template.js';
import { renderReceiptTemplate } from '../modules/documents/templates/receipt.template.js';
import { renderRentReceiptTemplate } from '../modules/documents/templates/rent-receipt.template.js';
import {
  makeChallanDto,
  makeGrnDto,
  makeReceiptDto,
  makeRentReceiptDto,
} from './helpers/document-fixtures.js';

/**
 * P9 Document Templates Pure Rendering & Print Styling Tests.
 *
 * Chamber is a single free-text label rendered verbatim on every document; the rack/level/position
 * tree it replaced is gone, and so is every customer contact field (`customerMobile`,
 * `chamberNumber`). The rent receipt is one schema flagged by `isPreview`.
 */
describe('P9 Document Templates Pure Rendering & Print Styling', () => {
  // 1. Template purity invariant: identical input DTO produces bitwise identical HTML output.
  it('template purity invariant: identical input DTO produces bitwise identical HTML output with zero side effects', () => {
    const dto = makeGrnDto();
    const output1 = renderGrnTemplate(dto);
    const output2 = renderGrnTemplate(dto);

    expect(output1).toBe(output2);
    expect(typeof output1).toBe('string');
    expect(output1.length).toBeGreaterThan(500);
  });

  // 2. GRN structure: organization, facility sub-header, numbers, free-text chamber, weights.
  it('renders complete GRN template structure with organization, facility and chamber label', () => {
    const html = renderGrnTemplate(makeGrnDto());

    expect(html).toContain('National Cold Chain Enterprise');
    expect(html).toContain('Sonipat Mega Terminal (SNP-01)');
    expect(html).toContain('GRN-2026-1001');
    expect(html).toContain('GOODS RECEIPT NOTE (STORAGE RECORD)');
    expect(html).toContain('Sardar Singh');
    expect(html).toContain('300');
    expect(html).toContain('50 kg per bag');
    expect(html).toContain('HR-10-XY-9999');
  });

  it('renders the GRN chamber as free text and escapes it', () => {
    expect(renderGrnTemplate(makeGrnDto({ chamber: 'Block B' }))).toContain('Block B');

    const injected = renderGrnTemplate(makeGrnDto({ chamber: '<script>x</script>' }));
    expect(injected).toContain('&lt;script&gt;');
    expect(injected).not.toContain('<script>x</script>');
  });

  it('renders no customer mobile on the GRN — the field no longer exists', () => {
    const html = renderGrnTemplate(makeGrnDto());

    expect(html).not.toMatch(/mobile/i);
    expect(html).not.toContain('9812300001');
    // The document schemas strip unknown keys, so a removed field can never reach a template.
    expect(grnDocumentDtoSchema.parse(makeGrnDto()).chamber).toBe('CH-03');
    for (const removed of [
      { customerMobile: '9812300001' },
      { chamberNumber: 'CH-03' },
      { positions: [{ positionCode: 'P1', bags: 300 }] },
    ]) {
      expect(grnDocumentDtoSchema.parse({ ...makeGrnDto(), ...removed })).not.toHaveProperty(
        Object.keys(removed)[0],
      );
    }
  });

  // 3. Inward Receipt: acknowledgement terms, chamber label, no farmer mobile.
  it('renders complete Inward Receipt template with farmer acknowledgement and terms', () => {
    const html = renderReceiptTemplate(makeReceiptDto());

    expect(html).toContain('FARMER INWARD ACKNOWLEDGEMENT RECEIPT');
    expect(html).toContain('RCPT-2026-1001');
    expect(html).toContain('Sardar Singh');
    expect(html).toContain('300 Bags (S)');
    expect(html).toContain('₹45000');
    expect(html).toContain('Terms &amp; Conditions of Storage');
  });

  it('renders the allocated chamber on the receipt and rejects the removed farmer mobile', () => {
    const html = renderReceiptTemplate(makeReceiptDto({ chamber: 'Shed C2' }));

    expect(html).toContain('Shed C2');
    expect(html).not.toMatch(/mobile/i);
    const parsed = receiptDocumentDtoSchema.parse({
      ...makeReceiptDto({ chamber: 'Shed C2' }),
      customerMobile: '9812300001',
    });
    expect(parsed.chamber).toBe('Shed C2');
    expect(parsed).not.toHaveProperty('customerMobile');
  });

  // 4. Delivery Challan: whole-lot bags out of a chamber, no per-position item breakdown.
  it('renders complete Delivery Challan template with the gate pass declaration', () => {
    const html = renderChallanTemplate(makeChallanDto());

    expect(html).toContain('OUTWARD DELIVERY CHALLAN (GATE PASS)');
    expect(html).toContain('CHL-2026-5001');
    expect(html).toContain('CH-03');
    expect(html).toContain('DL-01-AA-4321');
    expect(html).toContain('Karamjit Singh');
    expect(html).toContain('Officer Verma');
    expect(html).toContain('Gate Pass Declaration');
    // The gate-pass document a driver signs against must state the dispatched quantity. It
    // previously carried a declaration referring to a bag count it never printed.
    expect(html).toContain('Dispatched Bags by Type');
    expect(html).toContain('Small Bags');
    expect(html).toContain('Big Bags');
    expect(html).toContain('Total Bags Dispatched');
    expect(html).toContain('60 small, 40 big');
    expect(html).not.toContain('Storage Position');
  });

  it('rejects the removed challan item breakdown and chamberNumber', () => {
    const parsed = challanDocumentDtoSchema.parse({
      ...makeChallanDto(),
      items: [{ positionCode: 'C3-R1-L1-P01', bags: 100 }],
      totalBags: 100,
      chamberNumber: 'CH-03',
    });

    expect(parsed.chamber).toBe('CH-03');
    expect(parsed.smallBags).toBe(60);
    expect(parsed.bigBags).toBe(40);
    expect(parsed.totalBags).toBe(100);
    expect(parsed).not.toHaveProperty('items');
    expect(parsed).not.toHaveProperty('chamberNumber');
  });

  // 5. Rent Receipt: one schema, isPreview drives the watermark and the notice banner.
  it('renders the authoritative rent receipt with isPreview false and no watermark', () => {
    const html = renderRentReceiptTemplate(makeRentReceiptDto({ isPreview: false }));

    expect(html).toContain('RENT PAYMENT RECEIPT');
    expect(html).not.toContain('RENT PAYMENT RECEIPT [PREVIEW]');
    expect(html).not.toContain('PREVIEW ONLY');
    expect(html).not.toContain('Phase 12');
    expect(html).toContain('₹20000.00');
    expect(html).toContain('₹25000.00');
    expect(html).not.toMatch(/mobile/i);
    expect(rentReceiptDocumentDtoSchema.safeParse(makeRentReceiptDto()).success).toBe(true);
  });

  it('renders the preview rent receipt with the explicit uncommitted watermark notice', () => {
    const html = renderRentReceiptTemplate(
      makeRentReceiptDto({ receiptNumber: 'PREVIEW-RRCPT-901', isPreview: true }),
    );

    expect(html).toContain('RENT PAYMENT RECEIPT [PREVIEW]');
    expect(html).toContain('PREVIEW ONLY — UNCOMMITTED');
    expect(html).toContain('PREVIEW-RRCPT-901');
    expect(html).toContain('₹20000.00');
    expect(html).toContain('₹25000.00');
    expect(html).toContain('Phase 12 (Rent Collection &amp; Payment Management)');
    expect(
      rentReceiptPreviewDtoSchema.safeParse(makeRentReceiptDto({ isPreview: true })).success,
    ).toBe(true);
    expect(
      rentReceiptPreviewDtoSchema.safeParse(makeRentReceiptDto({ isPreview: false })).success,
    ).toBe(false);
  });

  it('rejects the removed rent receipt chamberNumber field', () => {
    const parsed = rentReceiptDocumentDtoSchema.parse({
      ...makeRentReceiptDto(),
      chamberNumber: 'CH-03',
      customerMobile: '9812300001',
    });

    expect(parsed.chamber).toBe('CH-03');
    expect(parsed).not.toHaveProperty('chamberNumber');
    expect(parsed).not.toHaveProperty('customerMobile');
  });

  // 6. Print CSS & CSP compliance.
  it('complies with print CSS rules, A4 page sizing, and same-origin logo resolution', () => {
    const html = renderGrnTemplate(makeGrnDto());

    expect(html).toContain('@media print');
    expect(html).toContain('size: A4 portrait');
    expect(html).toContain('.no-print');
    expect(html).toContain('page-break-inside: avoid');

    expect(html).toContain('src="/api/assets/logo_ncc_01"');
    expect(html).not.toContain('http://');
    expect(html).not.toContain('https://');
  });
});
