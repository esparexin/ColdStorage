import type { GrnMovementHistory } from '@cold-storage/contracts';
import { ORG_NAME_FALLBACK } from '../../../lib/branding';
import { escapeHtml } from '../../../lib/escape-html';
import { parseMovementRow } from './grnMovementView.helper';

export function renderGrnStockHtml(history: GrnMovementHistory, orgName?: string): string {
  const displayOrg = orgName?.trim() || ORG_NAME_FALLBACK;
  const inwardStr = new Date(history.inwardDate).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const rowsHtml = history.entries
    .map((e) => {
      const p = parseMovementRow(e);
      const dStr = new Date(e.date).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
      });
      const closing = `${e.closingBags.toLocaleString('en-IN')}${e.closingBags === 0 ? ' (CLOSED)' : ''}`;
      const rowBg =
        p.badgeType === 'inward'
          ? '#f0fdf4'
          : p.badgeType === 'mergeIn'
            ? '#eff6ff'
            : p.badgeType === 'reversal'
              ? '#fffbeb'
              : 'transparent';

      return `<tr style="background: ${rowBg};">
        <td>${escapeHtml(dStr)}</td>
        <td style="font-weight: 600;">${escapeHtml(p.typeLabel)}</td>
        <td>${escapeHtml(p.refNumber)}</td>
        <td style="text-align: right;">${escapeHtml(p.smallDisplay)}</td>
        <td style="text-align: right;">${escapeHtml(p.bigDisplay)}</td>
        <td style="text-align: right; font-weight: bold; ${p.isReceived ? 'color: #059669;' : ''}">${escapeHtml(p.totalDisplay)}</td>
        <td style="text-align: right; font-weight: bold;">${escapeHtml(closing)}</td>
        <td style="color: #475569; font-size: 9px;">${escapeHtml(p.notes)}</td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>GRN #${escapeHtml(history.grnNumber)} — Stock Movement</title>
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 8.5px; color: #111; padding: 5mm; max-width: 148mm; margin: 0 auto; line-height: 1.3; }
    .org { font-size: 11px; font-weight: bold; text-align: center; margin-bottom: 2px; }
    .title { font-size: 9px; text-align: center; color: #555; margin-bottom: 6px; letter-spacing: 0.04em; text-transform: uppercase; }
    .grn-header { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 10px; background: #f8fafc; border: 1px solid #cbd5e1; padding: 4px 6px; margin-bottom: 6px; font-size: 8.5px; }
    .grn-header dt { color: #64748b; }
    .grn-header dd { font-weight: 600; margin: 0; }
    .summary { display: flex; gap: 0; border: 1px solid #cbd5e1; margin-bottom: 6px; }
    .summary-box { flex: 1; text-align: center; padding: 4px; border-right: 1px solid #cbd5e1; }
    .summary-box:last-child { border-right: none; }
    .summary-box .sl { font-size: 7.5px; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; }
    .summary-box .sv { font-size: 10px; font-weight: bold; color: #111; }
    hr { border: none; border-top: 1px solid #cbd5e1; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 8px; }
    th, td { border: 1px solid #cbd5e1; padding: 2px 4px; text-align: left; }
    th { background: #f1f5f9; font-weight: 700; text-transform: uppercase; font-size: 7.5px; letter-spacing: 0.03em; }
    .signatures { display: flex; justify-content: space-between; margin-top: 14px; }
    .sig-box { border-top: 1px solid #333; width: 130px; text-align: center; font-size: 8px; padding-top: 2px; }
    @media print {
      body { padding: 0; }
      @page { size: 148mm 105mm landscape; margin: 5mm; }
    }
  </style>
</head>
<body>
  <div class="org">${escapeHtml(displayOrg)}</div>
  <div class="title">GRN Stock / Customer Bag Movement</div>

  <dl class="grn-header">
    <dt>GRN No:</dt><dd>${escapeHtml(history.grnNumber)}</dd>
    <dt>Customer:</dt><dd>${escapeHtml(history.customerName)}</dd>
    <dt>Commodity:</dt><dd>${escapeHtml(history.commodityName)}</dd>
    <dt>Chamber:</dt><dd>${escapeHtml(history.chamber)}</dd>
    <dt>Inward Date:</dt><dd>${escapeHtml(inwardStr)}</dd>
    <dt>Status:</dt><dd>${escapeHtml(history.status)}</dd>
  </dl>

  <div class="summary">
    <div class="summary-box">
      <div class="sl">Opening Stock</div>
      <div class="sv">${escapeHtml(history.totalInwardBags.toLocaleString('en-IN'))} Bags</div>
    </div>
    <div class="summary-box">
      <div class="sl">Total Outward</div>
      <div class="sv">${escapeHtml(history.netDeliveredBags.toLocaleString('en-IN'))} Bags</div>
    </div>
    <div class="summary-box">
      <div class="sl">Current Stock</div>
      <div class="sv">${escapeHtml(history.currentClosingBags.toLocaleString('en-IN'))} Bags</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Type</th>
        <th>GP / Ref #</th>
        <th style="text-align: right;">Small</th>
        <th style="text-align: right;">Big</th>
        <th style="text-align: right;">Total</th>
        <th style="text-align: right;">Balance</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="signatures">
    <div class="sig-box">Customer / Transporter</div>
    <div class="sig-box">Authorized Signatory</div>
  </div>
</body>
</html>`;
}
