import type { GrnDocumentDto } from '@cold-storage/contracts';
import { escapeHtml, renderBaseLayout } from './base.layout.js';

export function renderGrnTemplate(dto: GrnDocumentDto): string {
  const partyMark = dto.partyMark || dto.marks || '—';

  const bodyContent = `
    <table class="data-table">
      <tr>
        <th style="width: 25%;">Customer Name</th>
        <td style="width: 25%;"><strong>${escapeHtml(dto.customerName)}</strong></td>
        <th style="width: 25%;">Chamber</th>
        <td style="width: 25%;"><strong>${escapeHtml(dto.chamber)}</strong></td>
      </tr>
      <tr>
        <th>Commodity</th>
        <td><strong>${escapeHtml(dto.commodityName)}</strong></td>
        <th>Total Bags</th>
        <td><strong>${escapeHtml(dto.bags)}</strong></td>
      </tr>
      <tr>
        <th>Rent Agreement</th>
        <td>${escapeHtml(dto.rentType)} @ ${dto.rentType === 'Monthly' && dto.rentAmount === 0 ? 'Dynamic (Cycle Billing)' : `₹${escapeHtml(String(dto.rentAmount))}`}${dto.rentMonths ? ` (${dto.rentMonths} mos)` : ''}</td>
        <th>Status</th>
        <td><strong>${escapeHtml(dto.status)}</strong></td>
      </tr>
      <tr>
        <th>Vehicle Number</th>
        <td>${escapeHtml(dto.vehicleNumber ?? '—')}</td>
        <th>Party Mark</th>
        <td>${escapeHtml(partyMark)}</td>
      </tr>
    </table>
  `;

  return renderBaseLayout({
    title: `GRN - ${dto.grnNumber}`,
    organization: dto.organization,
    facility: dto.facility,
    documentTitle: 'GOODS RECEIPT NOTE (GRN)',
    documentNumber: dto.grnNumber,
    documentNumberLabel: 'GRN #',
    documentDate:
      dto.date instanceof Date ? dto.date.toISOString().split('T')[0] : String(dto.date),
    generatedAt:
      dto.generatedAt instanceof Date ? dto.generatedAt.toISOString() : String(dto.generatedAt),
    generatedBy: dto.generatedBy,
    bodyContent,
  });
}
