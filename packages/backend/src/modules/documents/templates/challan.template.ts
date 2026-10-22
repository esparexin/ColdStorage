import { isHybridBagCategory, type ChallanDocumentDto } from '@cold-storage/contracts';
import { escapeHtml, renderBaseLayout } from './base.layout.js';

export function renderChallanTemplate(dto: ChallanDocumentDto): string {
  const isHybrid = dto.bagType === 'Hybrid' || isHybridBagCategory(dto.bagCategory);
  const bagsTable = isHybrid
    ? `
    <table class="data-table">
      <thead>
        <tr>
          <th style="width: 50%; text-align: center;">Bag Category</th>
          <th style="width: 50%; text-align: center;">Total Hybrid Bags Dispatched</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="text-align: center;"><strong>Hybrid</strong></td>
          <td style="text-align: center;"><strong>${dto.totalBags}</strong></td>
        </tr>
      </tbody>
    </table>
    `
    : `
    <table class="data-table">
      <thead>
        <tr>
          <th style="width: 25%; text-align: center;">S/B Category</th>
          <th style="width: 25%; text-align: center;">Small Bags</th>
          <th style="width: 25%; text-align: center;">Big Bags</th>
          <th style="width: 25%; text-align: center;">Total Bags Dispatched</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="text-align: center;"><strong>${escapeHtml(dto.bagCategory || dto.bagType || 'S/B')}</strong></td>
          <td style="text-align: center;"><strong>${dto.smallBags}</strong></td>
          <td style="text-align: center;"><strong>${dto.bigBags}</strong></td>
          <td style="text-align: center;"><strong>${dto.totalBags}</strong></td>
        </tr>
      </tbody>
    </table>
    `;

  const gatePassText = isHybrid
    ? `Certified that the above mentioned goods have been checked, inspected, and released from the cold storage facility in good condition. The driver/transporter acknowledges receipt of the full count of bags as stated above: ${dto.totalBags} Hybrid Bags in total.`
    : `Certified that the above mentioned goods have been checked, inspected, and released from the cold storage facility in good condition. The driver/transporter acknowledges receipt of the full count of bags as stated above: ${dto.totalBags} Total S/B Bags in total (${dto.bagCategory ? `Category: ${escapeHtml(dto.bagCategory)}` : `S/B Category: ${escapeHtml(dto.bagType || 'S/B')}`}).`;

  const bodyContent = `
    <table class="data-table">
      <tr>
        <th style="width: 25%;">Customer Name</th>
        <td style="width: 25%;"><strong>${escapeHtml(dto.customerName)}</strong></td>
        <th style="width: 25%;">GRN</th>
        <td style="width: 25%;">${escapeHtml(dto.grnNumber)}</td>
      </tr>
      <tr>
        <th>Commodity</th>
        <td><strong>${escapeHtml(dto.commodityName)}</strong></td>
        <th>Gate Pass #</th>
        <td><strong>${escapeHtml(dto.gpNumber || '—')}</strong></td>
      </tr>
      <tr>
        <th>Chamber</th>
        <td>${escapeHtml(dto.chamber)}</td>
        <th>Status</th>
        <td><strong>${escapeHtml(dto.status)}</strong></td>
      </tr>
      <tr>
        <th>Vehicle No.</th>
        <td>${escapeHtml(dto.vehicleNumber ?? '—')}</td>
        <th>Driver Name</th>
        <td>${escapeHtml(dto.driverName ?? '—')}</td>
      </tr>
      <tr>
        <th>Party Mark</th>
        <td><strong>${escapeHtml(dto.partyMark ?? '—')}</strong></td>
        <th>Outward Weight</th>
        <td><strong>${dto.weight != null ? `${escapeHtml(dto.weight.toLocaleString('en-IN'))} kg` : '—'}</strong></td>
      </tr>
      ${dto.rentCharge != null && dto.rentCharge > 0 ? `
      <tr>
        <th>Outward Rent Charge</th>
        <td colspan="3"><strong style="color: #0056b3;">₹${escapeHtml(dto.rentCharge.toLocaleString('en-IN'))}</strong></td>
      </tr>` : ''}
    </table>

    <div style="margin-top: 5px; margin-bottom: 3px; font-weight: 700; font-size: 8.5px;">
      Outward Bags Details
    </div>

    ${bagsTable}

    <div style="margin-top: 6px; font-size: 7.5px; color: #333; border: 1px dashed #888; padding: 4px 6px; line-height: 1.25;">
      <strong style="font-size: 8px;">Gate Pass Declaration:</strong>
      <p style="margin-top: 2px; line-height: 1.25;">
        ${gatePassText}
      </p>
    </div>
  `;

  return renderBaseLayout({
    title: dto.challanNumber ? `Delivery Challan - ${dto.challanNumber}` : 'Delivery Challan',
    organization: dto.organization,
    facility: dto.facility,
    documentTitle: 'OUTWARD DELIVERY CHALLAN (GATE PASS)',
    documentNumber: dto.challanNumber,
    documentNumberLabel: 'Challan #',
    documentDate:
      dto.date instanceof Date ? dto.date.toISOString().split('T')[0] : String(dto.date),
    generatedAt:
      dto.generatedAt instanceof Date ? dto.generatedAt.toISOString() : String(dto.generatedAt),
    generatedBy: dto.generatedBy,
    bodyContent,
  });
}
