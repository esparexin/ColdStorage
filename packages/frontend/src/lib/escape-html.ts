/**
 * HTML-escapes a value for safe interpolation into a markup string.
 *
 * Mirrors the backend helper at
 * `packages/backend/src/modules/documents/templates/base.layout.ts` so that the
 * client-rendered stock-movement document escapes identically to the four
 * server-rendered print templates.
 *
 * Any value that originates from operator-entered free text (customer name,
 * chamber, remarks, gate-pass / challan numbers, organisation name) MUST be
 * passed through this before being interpolated into an HTML document. The
 * stock-movement print surface writes into an `about:blank` window that
 * inherits the application origin, so an unescaped payload would execute as
 * script in the app's origin rather than merely defacing the printout.
 */
export function escapeHtml(str: string | number | null | undefined): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}