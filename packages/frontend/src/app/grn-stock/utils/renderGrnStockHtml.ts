import type { GrnMovementHistory } from '@cold-storage/contracts';

export function renderGrnStockHtml(history: GrnMovementHistory): string {
  const inwardStr = new Date(history.inwardDate).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const rowsHtml = history.entries
    .map((e) => {
      const isInward = e.type === 'INWARD';
      const isReversal = e.type === 'DELIVERY_REVERSAL';
      const dStr = new Date(e.date).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
      });

      const typeLabel = isInward ? 'INWARD' : isReversal ? 'REVERSAL' : 'OUTWARD';
      const gpNo = e.gpNumber || e.challanNumber || '—';
      const smallDisplay = e.smallBags != null ? e.smallBags.toLocaleString('en-IN') : '—';
      const bigDisplay = e.bigBags != null ? e.bigBags.toLocaleString('en-IN') : '—';
      const totalBags = isInward
        ? e.closingBags
        : isReversal
          ? (e.receivedBags ?? 0)
          : e.deliveredBags;
      const closing = `${e.closingBags.toLocaleString('en-IN')}${e.closingBags === 0 ? ' (CLOSED)' : ''}`;

      const rowBg = isInward ? '#f0fdf4' : isReversal ? '#fffbeb' : 'transparent';

      return `<tr style="background: ${rowBg};">
        <td>${dStr}</td>
        <td style="font-weight: 600;">${typeLabel}</td>
        <td>${gpNo}</td>
        <td style="text-align: right;">${smallDisplay}</td>
        <td style="text-align: right;">${bigDisplay}</td>
        <td style="text-align: right; font-weight: bold; ${isInward ? 'color: #059669;' : ''}">${totalBags.toLocaleString('en-IN')}</td>
        <td style="text-align: right; font-weight: bold;">${closing}</td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>GRN #${history.grnNumber} — Stock Movement</title>
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 11px; color: #111; padding: 20px; line-height: 1.5; }
    .org { font-size: 14px; font-weight: bold; text-align: center; margin-bottom: 2px; }
    .title { font-size: 11px; text-align: center; color: #555; margin-bottom: 16px; letter-spacing: 0.05em; text-transform: uppercase; }
    .grn-header { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; background: #f8fafc; border: 1px solid #cbd5e1; padding: 10px 12px; margin-bottom: 12px; font-size: 11px; }
    .grn-header dt { color: #64748b; }
    .grn-header dd { font-weight: 600; margin: 0; }
    .summary { display: flex; gap: 0; border: 1px solid #cbd5e1; margin-bottom: 12px; }
    .summary-box { flex: 1; text-align: center; padding: 8px; border-right: 1px solid #cbd5e1; }
    .summary-box:last-child { border-right: none; }
    .summary-box .sl { font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; }
    .summary-box .sv { font-size: 14px; font-weight: bold; color: #111; }
    hr { border: none; border-top: 1px solid #cbd5e1; margin: 8px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    th, td { border: 1px solid #cbd5e1; padding: 5px 7px; text-align: left; }
    th { background: #f1f5f9; font-weight: 700; text-transform: uppercase; font-size: 9px; letter-spacing: 0.04em; }
    .signatures { display: flex; justify-content: space-between; margin-top: 36px; }
    .sig-box { border-top: 1px solid #333; width: 180px; text-align: center; font-size: 10px; padding-top: 4px; }
    @media print {
      body { padding: 0; }
      @page { size: A4 landscape; margin: 10mm; }
    }
  </style>
</head>
<body>
  <div class="org">SRI SAI BALA COLD STORAGE</div>
  <div class="title">GRN Stock / Customer Bag Movement</div>

  <dl class="grn-header">
    <dt>GRN No:</dt><dd>${history.grnNumber}</dd>
    <dt>Customer:</dt><dd>${history.customerName}</dd>
    <dt>Commodity:</dt><dd>${history.commodityName}</dd>
    <dt>Chamber:</dt><dd>${history.chamber}</dd>
    <dt>Inward Date:</dt><dd>${inwardStr}</dd>
    <dt>Status:</dt><dd>${history.status}</dd>
  </dl>

  <div class="summary">
    <div class="summary-box">
      <div class="sl">Opening Stock</div>
      <div class="sv">${history.totalInwardBags.toLocaleString('en-IN')} Bags</div>
    </div>
    <div class="summary-box">
      <div class="sl">Total Outward</div>
      <div class="sv">${history.netDeliveredBags.toLocaleString('en-IN')} Bags</div>
    </div>
    <div class="summary-box">
      <div class="sl">Current Stock</div>
      <div class="sv">${history.currentClosingBags.toLocaleString('en-IN')} Bags</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Type</th>
        <th>GP No.</th>
        <th style="text-align: right;">Small</th>
        <th style="text-align: right;">Big</th>
        <th style="text-align: right;">Total</th>
        <th style="text-align: right;">Balance</th>
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
