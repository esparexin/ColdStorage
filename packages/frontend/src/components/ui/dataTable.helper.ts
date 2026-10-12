/**
 * Shared DataTable interaction and accessibility helpers.
 */

/**
 * Determines whether an event target is an interactive child control inside a table cell.
 * When true, clicking or triggering keyboard events on this element must NOT activate
 * the containing table row's onRowClick handler.
 */
export function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).closest !== 'function') {
    return false;
  }
  return Boolean(
    (target as HTMLElement).closest(
      'button, a, input, select, textarea, [role="button"], [role="menuitem"], [data-prevent-row-click]',
    ),
  );
}

/**
 * Determines whether a keyboard event on a clickable row should trigger the row click action.
 */
export function shouldTriggerRowClickOnKey(key: string): boolean {
  return key === 'Enter' || key === ' ';
}
