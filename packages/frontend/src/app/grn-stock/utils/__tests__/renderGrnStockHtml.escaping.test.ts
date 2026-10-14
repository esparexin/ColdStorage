import { describe, expect, it } from 'vitest';
import type { GrnMovementHistory } from '@cold-storage/contracts';
import { escapeHtml } from '../../../../lib/escape-html';
import { renderGrnStockHtml } from '../renderGrnStockHtml';

/**
 * Regression guard for the stored-XSS finding in the GRN stock-movement print
 * surface.
 *
 * `renderGrnStockHtml` output is written into a same-origin `about:blank`
 * window by `printHtmlString` in lib/print-document.ts. That window inherits
 * the application origin, so any unescaped operator-entered value (customer
 * name, chamber, remarks, gate-pass/challan number, org name) executes as
 * script in the app's origin rather than merely defacing the printout.
 *
 * Every interpolated value must therefore be escaped. `rowBg` is exempt: it is
 * one of four internal colour constants selected by a closed union and never
 * derives from user input.
 */
describe('renderGrnStockHtml XSS escaping', () => {
  const PAYLOAD = '<img src=x onerror="fetch(\'/api/users\')">';

  const hostile: GrnMovementHistory = {
    grnId: 'grn-1',
    facilityId: 'fac-1',
    grnNumber: PAYLOAD,
    customerId: 'cust-1',
    customerName: `Evil ${PAYLOAD}`,
    commodityId: 'comm-1',
    commodityName: `Wheat ${PAYLOAD}`,
    chamber: `CH<script src=//evil.example/x.js></script>`,
    inwardDate: new Date('2026-10-11T00:00:00.000Z'),
    totalInwardBags: 300,
    netDeliveredBags: 100,
    currentClosingBags: 200,
    status: 'OPEN',
    entries: [
      {
        date: new Date('2026-10-11T00:00:00.000Z'),
        grnId: 'grn-1',
        grnNumber: PAYLOAD,
        type: 'PARTIAL_OUTWARD',
        openingBags: 300,
        receivedBags: 0,
        deliveredBags: 100,
        closingBags: 200,
        smallBags: 60,
        bigBags: 40,
        gpNumber: `GP-${PAYLOAD}`,
        remarks: `Dispatch ${PAYLOAD}`,
      },
      {
        date: new Date('2026-10-12T00:00:00.000Z'),
        grnId: 'grn-1',
        grnNumber: PAYLOAD,
        type: 'INTERNAL_MERGE_IN',
        openingBags: 200,
        receivedBags: 10,
        deliveredBags: 0,
        closingBags: 210,
        remarks: `Merged from GRNs ${PAYLOAD}: ${PAYLOAD}`,
      },
    ],
  };

  it('never emits a raw script tag or live event-handler attribute', () => {
    const html = renderGrnStockHtml(hostile, `Org ${PAYLOAD}`);

    // Escaping turns `<img ... onerror="...">` into visible text. The bare
    // substring "onerror=" therefore still appears, but it is inert: the
    // angle brackets and the quote are encoded. Assert on the structural
    // danger (an actual tag or a real quoted handler), not the substring.
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('onerror="');
    expect(html).not.toContain("onerror='");
  });

  it('escapes the HTML metacharacters in every operator-entered field', () => {
    const html = renderGrnStockHtml(hostile, `Org ${PAYLOAD}`);

    // & is encoded first, so the escaped payload appears in its final form.
    expect(html).toContain(escapeHtml(PAYLOAD));
    expect(html).toContain('&lt;script src=//evil.example/x.js&gt;');
    expect(html).not.toContain('<dd>' + PAYLOAD);
  });

  it('escapes remarks lifted into the ref column by the merge regex', () => {
    const html = renderGrnStockHtml(hostile, 'Org');

    // INTERNAL_MERGE_IN splits remarks into refNumber + notes via
    // /Merged from GRNs? ([^:]+)/. Both captures must be escaped.
    expect(html).toContain('From GRN &lt;img');
    expect(html).not.toMatch(/From GRN <img/);
  });

  it('leaves the internal row background constants unescaped', () => {
    const html = renderGrnStockHtml(hostile, 'Org');

    // INTERNAL_MERGE_IN -> #eff6ff, PARTIAL_OUTWARD -> transparent.
    // These come from a closed set keyed on a typed union, never from input.
    expect(html).toContain('background: #eff6ff');
    expect(html).toContain('background: transparent');
  });

  it('escapeHtml encodes null and undefined as an empty string', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(0)).toBe('0');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
    expect(escapeHtml(`"'`)).toBe('&quot;&#039;');
  });
});