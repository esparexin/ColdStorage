import type { GrnDocumentDto } from '@cold-storage/contracts';
import { escapeHtml, renderBaseLayout } from './base.layout.js';

export function renderGrnTemplate(dto: GrnDocumentDto): string {
  const positionsRows = dto.positions
    .map(
      (pos, idx) => `
    <tr>
      <td class="text-center">${idx + 1}</td>
      <td><strong>${escapeHtml(pos.positionCode)}</strong></td>
      <td class="text-right">${escapeHtml(pos.bags)}</td>
    </tr>`,
    )
    .join('');

  const bodyContent = `
    <table class="data-table">
      <tr>
        <th style="width: 25%;">Customer Name</th>
        <td style="width: 25%;"><strong>${escapeHtml(dto.customerName)}</strong></td>
        <th style="width: 25%;">Mobile</th>
        <td style="width: 25%;">${escapeHtml(dto.customerMobile)}</td>
      </tr>
      <tr>
        <th>Commodity</th>
        <td><strong>${escapeHtml(dto.commodityName)}</strong></td>
        <th>Chamber</th>
        <td>Chamber ${escapeHtml(dto.chamberNumber)}</td>
      </tr>
      <tr>
        <th>Total Inward Bags</th>
        <td><strong>${escapeHtml(dto.bags)} (${escapeHtml(dto.bagType)})</strong></td>
        <th>Inward Receipt #</th>
        <td>${escapeHtml(dto.inwardReceiptNumber)}</td>
      </tr>
      <tr>
        <th>Rent Agreement</th>
        <td>${escapeHtml(dto.rentType)} @ ₹${escapeHtml(dto.rentAmount)}${dto.rentMonths ? ` (${dto.rentMonths} mos)` : ''}</td>
        <th>Status</th>
        <td><strong>${escapeHtml(dto.status)}</strong></td>
      </tr>
      <tr>
        <th>Vehicle Number</th>
        <td>${escapeHtml(dto.vehicleNumber ?? '—')}</td>
        <th>Gate Pass (GP) #</th>
        <td>${escapeHtml(dto.gpNumber ?? '—')}</td>
      </tr>
      <tr>
        <th>Nominal Unit / Total Wt</th>
        <td>${dto.nominalUnitWeight ? `${escapeHtml(dto.nominalUnitWeight)} kg / unit` : '—'} (${dto.nominalTotalWeight ? `${escapeHtml(dto.nominalTotalWeight)} kg` : '—'})</td>
        <th>Actual Net Weight</th>
        <td>${dto.actualWeight ? `<strong>${escapeHtml(dto.actualWeight)} kg</strong>` : '—'}</td>
      </tr>
      ${dto.marks ? `<tr><th>Lot / Identification Marks</th><td colspan="3">${escapeHtml(dto.marks)}</td></tr>` : ''}
    </table>

    <div style="margin-top: 16px; margin-bottom: 6px; font-weight: 600; font-size: 13px;">
      Storage Position Allocation (Put-Away Record)
    </div>
    <table class="data-table">
      <thead>
        <tr>
          <th style="width: 10%;" class="text-center">#</th>
          <th>Position Code</th>
          <th style="width: 25%;" class="text-right">Bags Allocated</th>
        </tr>
      </thead>
      <tbody>
        ${positionsRows || '<tr><td colspan="3" class="text-center">No position allocation recorded</td></tr>'}
      </tbody>
      <tfoot>
        <tr>
          <th colspan="2" class="text-right">Total Allocated Bags:</th>
          <th class="text-right">${escapeHtml(dto.bags)}</th>
        </tr>
      </tfoot>
    </table>
  `;

  return renderBaseLayout({
    title: `GRN - ${dto.grnNumber}`,
    organization: dto.organization,
    facility: dto.facility,
    documentTitle: 'GOODS RECEIPT NOTE (STORAGE RECORD)',
    documentNumber: dto.grnNumber,
    documentDate:
      dto.date instanceof Date ? dto.date.toISOString().split('T')[0] : String(dto.date),
    generatedAt:
      dto.generatedAt instanceof Date ? dto.generatedAt.toISOString() : String(dto.generatedAt),
    generatedBy: dto.generatedBy,
    bodyContent,
  });
}
