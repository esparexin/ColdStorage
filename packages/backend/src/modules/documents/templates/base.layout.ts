import type { FacilitySubHeader, OrganizationHeader } from '@cold-storage/contracts';

export interface BaseLayoutOptions {
  title: string;
  organization: OrganizationHeader;
  facility: FacilitySubHeader;
  documentTitle: string;
  documentNumber?: string | null;
  documentNumberLabel?: string | null;
  customerSignatureLabel?: string | null;
  documentDate: string;
  generatedAt: string;
  generatedBy: string;
  bodyContent: string;
  watermarkNotice?: string | null;
  orientation?: 'portrait' | 'landscape';
}

export function escapeHtml(str: string | number | null | undefined): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function renderBaseLayout(opts: BaseLayoutOptions): string {
  const logoHtml = opts.organization.logoAssetId
    ? `<img src="/api/assets/${encodeURIComponent(opts.organization.logoAssetId)}" alt="Organization Logo" class="org-logo" />`
    : '';

  const gstinHtml = opts.organization.gstin
    ? `<div class="org-detail"><strong>GSTIN:</strong> ${escapeHtml(opts.organization.gstin)}</div>`
    : '';

  const watermarkHtml = opts.watermarkNotice
    ? `<div class="watermark-banner">${escapeHtml(opts.watermarkNotice)}</div>`
    : '';

  const orientation = opts.orientation || 'portrait';
  const pageSize = orientation === 'landscape' ? '148mm 105mm landscape' : '105mm 148mm portrait';
  const sheetWidth = orientation === 'landscape' ? '148mm' : '105mm';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(opts.title)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 10px;
      color: #111;
      background: #f1f5f9;
      padding: 12px;
      line-height: 1.35;
    }
    .sheet {
      max-width: ${sheetWidth};
      width: 100%;
      margin: 0 auto;
      background: #fff;
      padding: 6mm;
      border: 1px solid #ddd;
    }
    .header-table {
      width: 100%;
      border-bottom: 1.5px solid #222;
      padding-bottom: 4px;
      margin-bottom: 5px;
    }
    .org-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.2px;
      line-height: 1.2;
    }
    .org-detail {
      font-size: 8px;
      color: #333;
      line-height: 1.25;
    }
    .org-logo {
      max-height: 32px;
      max-width: 72px;
      object-fit: contain;
    }
    .facility-box {
      background: #f7f7f7;
      padding: 3px 5px;
      border-radius: 3px;
      font-size: 8px;
      margin-top: 3px;
    }
    .doc-banner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #eee;
      border: 1px solid #ccc;
      padding: 3px 6px;
      margin: 5px 0;
    }
    .doc-title {
      font-size: 8.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.2px;
      white-space: nowrap;
    }
    .doc-meta {
      text-align: right;
      font-size: 8px;
      line-height: 1.25;
    }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      margin: 5px 0;
      font-size: 8px;
    }
    .data-table th, .data-table td { border: 1px solid #aaa; padding: 2.5px 4px; text-align: left; vertical-align: middle; }
    .data-table th { background: #f0f0f0; font-weight: 600; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .footer-section { margin-top: 10px; padding-top: 4px; border-top: 1px solid #ccc; }
    .signatures { display: flex; justify-content: space-between; margin-top: 16px; padding-top: 2px; gap: 8px; }
    .sig-box { border-top: 1px solid #444; flex: 1; max-width: 48%; text-align: center; font-size: 8px; padding-top: 2px; }
    .watermark-banner {
      background: #fff3cd; color: #856404; border: 1px solid #ffeeba; padding: 3px 5px;
      text-align: center; font-weight: bold; font-size: 8px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;
    }
    .print-controls { max-width: ${sheetWidth}; margin: 0 auto 8px auto; text-align: right; }
    .btn-print { background: #0056b3; color: #fff; border: none; padding: 6px 12px; font-size: 11px; border-radius: 4px; cursor: pointer; }
    @media print {
      body { padding: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .sheet { border: none; padding: 0; max-width: 100%; }
      .no-print { display: none !important; }
      .page-break { page-break-after: always; break-after: page; }
      tr, table, .avoid-break { page-break-inside: avoid; break-inside: avoid; }
      @page { size: ${pageSize}; margin: 6mm; }
    }
  </style>
</head>
<body>
  <div class="print-controls no-print">
    <button class="btn-print" onclick="window.print()">Print Document</button>
  </div>

  <div class="sheet">
    ${watermarkHtml}
    <table class="header-table">
      <tr>
        <td style="vertical-align: top;">
          <div class="org-title">${escapeHtml(opts.organization.orgName)}</div>
          <div class="org-detail">${escapeHtml(opts.organization.address)}</div>
          <div class="org-detail"><strong>Contact:</strong> ${escapeHtml(opts.organization.contact)}</div>
          ${gstinHtml}
        </td>
        <td style="vertical-align: top; text-align: right; width: 150px;">
          ${logoHtml}
        </td>
      </tr>
    </table>

    <div class="doc-banner">
      <div class="doc-title">${escapeHtml(opts.documentTitle)}</div>
      <div class="doc-meta">
        ${opts.documentNumber ? `<div><strong>${escapeHtml(opts.documentNumberLabel || 'Doc #')}:</strong> ${escapeHtml(opts.documentNumber)}</div>` : ''}
        <div><strong>Date:</strong> ${escapeHtml(opts.documentDate)}</div>
      </div>
    </div>

    <div class="doc-body">
      ${opts.bodyContent}
    </div>

    <div class="footer-section">
      ${opts.organization.printFooter ? `<div class="org-detail text-center" style="margin-bottom: 12px;">${escapeHtml(opts.organization.printFooter)}</div>` : ''}
      <div class="signatures avoid-break">
        <div class="sig-box">${escapeHtml(opts.customerSignatureLabel || 'Customer / Driver Signature')}</div>
        <div class="sig-box">Authorized Signatory</div>
      </div>
      <div style="margin-top: 16px; font-size: 10px; color: #777; text-align: right;">
        Generated: ${escapeHtml(opts.generatedAt)} | User: ${escapeHtml(opts.generatedBy)}
      </div>
    </div>
  </div>
</body>
</html>`;
}
