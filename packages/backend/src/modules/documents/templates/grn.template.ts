import type { GrnDocumentDto } from '@cold-storage/contracts';
import { escapeHtml, renderBaseLayout } from './base.layout.js';

export function renderGrnTemplate(dto: GrnDocumentDto): string {
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
        <th>S/B Category</th>
        <td>${escapeHtml(dto.bagType)}</td>
      </tr>
      <tr>
        <th>Total S/B Bags</th>
        <td><strong>${escapeHtml(dto.bags)} (${escapeHtml(dto.bagType)})</strong></td>
        <th>Inward Receipt #</th>
        <td>${escapeHtml(dto.inwardReceiptNumber)}</td>
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
        <th>Gate Pass (GP) #</th>
        <td>${escapeHtml(dto.gpNumber ?? '—')}</td>
      </tr>
      <tr>
        <th>Small Bag Weight</th>
        <td>${dto.smallBagWeight ? `<strong>${escapeHtml(dto.smallBagWeight)} kg per bag</strong>` : '—'}</td>
        <th>Big Bag Weight</th>
        <td>${dto.bigBagWeight ? `<strong>${escapeHtml(dto.bigBagWeight)} kg per bag</strong>` : '—'}</td>
      </tr>
      ${dto.marks ? `<tr><th>Lot / Identification Marks</th><td colspan="3">${escapeHtml(dto.marks)}</td></tr>` : ''}
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
