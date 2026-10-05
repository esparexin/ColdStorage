import type { GrnMovementHistory, RentSummaryDto } from '@cold-storage/contracts';

export function renderPassbookHtml(
  history: GrnMovementHistory,
  rentSummary: RentSummaryDto | null,
): string {
  const inwardStr = new Date(history.inwardDate).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const rowsHtml = history.entries
    .map((e) => {
      const isEntryInward = e.type === 'INWARD';
      const isEntryReversal = e.type === 'DELIVERY_REVERSAL';
      const dStr = new Date(e.date).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      const rec = isEntryInward
        ? (e.receivedBags ?? e.closingBags).toLocaleString('en-IN')
        : isEntryReversal
          ? `+${(e.receivedBags ?? e.deliveredBags).toLocaleString('en-IN')} (Reversed)`
          : '—';
      const del = isEntryInward
        ? '—'
        : isEntryReversal
          ? `Reversal of ${e.challanNumber || 'Challan'}`
          : `${e.deliveredBags.toLocaleString('en-IN')}${e.challanNumber ? ` (${e.challanNumber})` : ''}`;
      const closing = `${e.closingBags.toLocaleString('en-IN')}${e.closingBags === 0 ? ' (CLOSED)' : ''}`;
      return `<tr>
        <td>${dStr}</td>
        <td style="text-align: right; ${isEntryInward ? 'font-weight: bold; color: #059669;' : ''}">${rec}</td>
        <td style="text-align: right;">${del}</td>
        <td style="text-align: right; font-weight: bold;">${closing}</td>
        <td>${e.gpNumber || '—'}</td>
        <td>${e.marks || '—'}</td>
        <td style="text-align: right;">${e.smallBags != null ? e.smallBags.toLocaleString('en-IN') : '—'}</td>
        <td style="text-align: right;">${e.bigBags != null ? e.bigBags.toLocaleString('en-IN') : '—'}</td>
        <td>${e.remarks || e.vehicleNumber || '—'}</td>
      </tr>`;
    })
    .join('');

  const loanStatusStr = history.loanStatus === 'TAKEN'
    ? `LOAN ACTIVE / PLEDGED (${history.loanBankName || 'Bank'}${history.loanReferenceNumber ? ` - Ref: ${history.loanReferenceNumber}` : ''})`
    : history.loanStatus === 'CLEARED'
      ? 'LOAN CLEARED (LIEN RELEASED)'
      : history.loanStatus === 'NOT_TAKEN'
        ? 'BOND PLEDGED (LOAN NOT TAKEN)'
        : 'STANDARD STORAGE (NO LIEN)';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${history.bondNumber ? `Bond #${history.bondNumber} (GRN #${history.grnNumber})` : `GRN #${history.grnNumber}`} Movement Ledger</title>
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 12px; color: #111; padding: 24px; line-height: 1.4; }
    h2 { margin: 0 0 8px 0; font-size: 16px; font-weight: bold; }
    .meta { display: flex; flex-wrap: wrap; gap: 14px; font-size: 11px; margin-bottom: 16px; padding: 10px; background: #f8fafc; border: 1px solid #cbd5e1; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 8px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
    th { background: #f1f5f9; font-weight: 600; text-transform: uppercase; font-size: 10px; }
    .signatures { display: flex; justify-content: space-between; margin-top: 48px; }
    .sig-box { border-top: 1px solid #333; width: 200px; text-align: center; font-size: 11px; padding-top: 4px; }
    @media print {
      body { padding: 0; }
      @page { size: A4 landscape; margin: 10mm; }
    }
  </style>
</head>
<body>
  <h2>${history.customerName} — ${history.bondNumber ? `Bond #${history.bondNumber} • ` : ''}GRN #${history.grnNumber} (${history.commodityName})</h2>
  <div class="meta">
    ${history.bondNumber ? `<span><strong>Bond #:</strong> ${history.bondNumber}</span>` : ''}
    <span><strong>GRN #:</strong> ${history.grnNumber}</span>
    <span><strong>Inward Date:</strong> ${inwardStr}</span>
    <span><strong>Chamber:</strong> Chamber ${history.chamber}</span>
    <span><strong>Initial Received:</strong> ${history.totalInwardBags.toLocaleString('en-IN')} Bags</span>
    <span><strong>Current Stored:</strong> ${history.currentClosingBags.toLocaleString('en-IN')} Bags</span>
    <span><strong>Physical Status:</strong> ${history.status}</span>
    <span><strong>Bond Loan:</strong> ${loanStatusStr}</span>
    ${rentSummary ? `<span><strong>Rent:</strong> ${rentSummary.paymentStatus}</span>` : ''}
  </div>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Received</th>
        <th>Delivery</th>
        <th>Closing</th>
        <th>G.P.No.</th>
        <th>Mark</th>
        <th>Small Bags</th>
        <th>Big Bags</th>
        <th>Remarks</th>
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
