import type { ChallanDocumentDto } from '@cold-storage/contracts';
import { escapeHtml, renderBaseLayout } from './base.layout.js';

export function renderChallanTemplate(dto: ChallanDocumentDto): string {
  const bodyContent = `
    <table class="data-table">
      <tr>
        <th style="width: 25%;">Customer Name</th>
        <td style="width: 25%;"><strong>${escapeHtml(dto.customerName)}</strong></td>
        <th style="width: 25%;">GRN Reference</th>
        <td style="width: 25%;">${escapeHtml(dto.grnNumber)}</td>
      </tr>
      <tr>
        <th>Commodity Delivered</th>
        <td><strong>${escapeHtml(dto.commodityName)}</strong></td>
        <th>Origin Chamber</th>
        <td>${escapeHtml(dto.chamber)}</td>
      </tr>
      <tr>
        <th>Dispatch Vehicle #</th>
        <td>${escapeHtml(dto.vehicleNumber ?? '—')}</td>
        <th>Driver Name</th>
        <td>${escapeHtml(dto.driverName ?? '—')}</td>
      </tr>
      <tr>
        <th>Challan Number</th>
        <td><strong>${escapeHtml(dto.challanNumber)}</strong></td>
        <th>Challan Status</th>
        <td><strong>${escapeHtml(dto.status)}</strong></td>
      </tr>
      <tr>
        <th>Party Mark</th>
        <td colspan="${dto.rentCharge != null && dto.rentCharge > 0 ? 1 : 3}"><strong>${escapeHtml(dto.partyMark ?? '—')}</strong></td>
        ${dto.rentCharge != null && dto.rentCharge > 0 ? `<th>Outward Rent Charge</th><td><strong style="color: #0056b3;">₹${escapeHtml(dto.rentCharge.toLocaleString('en-IN'))}</strong></td>` : ''}
      </tr>
      <tr>
        <th>Total Bags Weight</th>
        <td><strong>${dto.totalBagsWeight != null ? `${escapeHtml(dto.totalBagsWeight.toLocaleString('en-IN'))} kg` : '—'}</strong></td>
        <th>Outward Weight</th>
        <td><strong>${dto.weight != null ? `${escapeHtml(dto.weight.toLocaleString('en-IN'))} kg` : '—'}</strong></td>
      </tr>
    </table>

    <div style="margin-top: 16px; margin-bottom: 6px; font-weight: 600; font-size: 13px;">
      Outward Bags Details
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th style="width: 25%; text-align: center;">S/B Category</th>
          <th style="width: 25%; text-align: center;">Small Bags</th>
          <th style="width: 25%; text-align: center;">Big Bags</th>
          <th style="width: 25%; text-align: center;">Total S/B Bags Dispatched</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="text-align: center;"><strong>${escapeHtml(dto.bagType || 'S/B')}</strong></td>
          <td style="text-align: center;"><strong>${dto.smallBags}</strong></td>
          <td style="text-align: center;"><strong>${dto.bigBags}</strong></td>
          <td style="text-align: center;"><strong>${dto.totalBags}</strong></td>
        </tr>
      </tbody>
    </table>

    <div style="margin-top: 20px; font-size: 11px; color: #444; border: 1px dashed #999; padding: 10px;">
      <strong>Gate Pass Declaration:</strong>
      <p style="margin-top: 4px;">
        Certified that the above mentioned goods have been checked, inspected, and released from the cold storage facility in good condition. The driver/transporter acknowledges receipt of the full count of bags as stated above: ${dto.totalBags} Total S/B Bags in total (S/B Category: ${escapeHtml(dto.bagType || 'S/B')}).
      </p>
    </div>
  `;

  return renderBaseLayout({
    title: `Challan - ${dto.challanNumber}`,
    organization: dto.organization,
    facility: dto.facility,
    documentTitle: 'OUTWARD DELIVERY CHALLAN (GATE PASS)',
    documentDate:
      dto.date instanceof Date ? dto.date.toISOString().split('T')[0] : String(dto.date),
    generatedAt:
      dto.generatedAt instanceof Date ? dto.generatedAt.toISOString() : String(dto.generatedAt),
    generatedBy: dto.generatedBy,
    bodyContent,
  });
}
