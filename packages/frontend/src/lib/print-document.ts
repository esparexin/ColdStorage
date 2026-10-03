import { requestWithAuth } from './api-client';

export interface PrintDocumentOptions {
  /** Endpoint returning server-rendered HTML, e.g. `/api/facilities/x/documents/grn/y`. */
  url: string;
  /** Message reported when the browser blocks the pop-up. */
  popupBlockedMessage: string;
  /** Message used when the request itself fails. */
  failureMessage: string;
  /** Invoke the browser print dialog once the document has settled. Defaults to true. */
  autoPrint?: boolean;
}

/**
 * Canonical server-rendered document print flow.
 *
 * The fetch, pop-up handling, `document.write` and print invocation were previously copied
 * into four feature surfaces (GRN documents, delivery challan, rent receipt, rent receipt
 * preview), which let the pop-up-blocked and error messaging drift apart. They now share one
 * implementation; callers only supply their endpoint and their user-facing wording.
 *
 * Throws on failure so the calling surface can surface the message through its own state.
 */
export async function printHtmlDocument(options: PrintDocumentOptions): Promise<void> {
  const { url, popupBlockedMessage, failureMessage, autoPrint = true } = options;

  const res = await requestWithAuth(url);
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new Error(err.error ?? err.message ?? `${failureMessage} (HTTP ${res.status})`);
  }
  const html = await res.text();

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    throw new Error(popupBlockedMessage);
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();

  if (autoPrint) {
    setTimeout(() => printWindow.print(), 300);
  }
}