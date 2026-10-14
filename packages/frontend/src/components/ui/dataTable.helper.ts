/**
 * Shared DataTable interaction, sorting and accessibility helpers.
 */

export type SortDirection = 'asc' | 'desc';

export type SortType = 'text' | 'number' | 'date';

export interface SortableColumn<T> {
  key: string;
  sortable?: boolean;
  sortAccessor?: (row: T) => string | number | Date | null | undefined;
  sortType?: SortType;
}

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

/**
 * Calculates the next sort direction when toggling a column.
 * Switching to a new column resets direction to 'asc'.
 * Clicking the currently sorted column toggles between 'asc' and 'desc'.
 */
export function getNextSortDirection(
  currentKey: string | null,
  newKey: string,
  currentDirection?: SortDirection,
): SortDirection {
  if (currentKey !== newKey) {
    return 'asc';
  }
  return currentDirection === 'asc' ? 'desc' : 'asc';
}

/**
 * Compares two scalar or date values with type awareness and null-safety.
 * Missing / null / undefined values are placed at the end regardless of collation.
 */
export function compareValues(a: unknown, b: unknown, explicitType?: SortType): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;

  if (explicitType === 'number') {
    const numA = typeof a === 'number' ? a : Number(a);
    const numB = typeof b === 'number' ? b : Number(b);
    const validA = !isNaN(numA);
    const validB = !isNaN(numB);
    if (!validA && !validB) return 0;
    if (!validA) return 1;
    if (!validB) return -1;
    return numA - numB;
  }

  if (explicitType === 'date') {
    const timeA = a instanceof Date ? a.getTime() : new Date(String(a)).getTime();
    const timeB = b instanceof Date ? b.getTime() : new Date(String(b)).getTime();
    const validA = !isNaN(timeA);
    const validB = !isNaN(timeB);
    if (!validA && !validB) return 0;
    if (!validA) return 1;
    if (!validB) return -1;
    return timeA - timeB;
  }

  if (explicitType === 'text') {
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
  }

  // Automatic type inference
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }

  if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime();
  }

  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Returns a new sorted array of rows based on the target column's accessor/key and direction.
 */
export function sortRows<T>(
  rows: readonly T[],
  column: SortableColumn<T>,
  direction: SortDirection,
): T[] {
  if (!rows || rows.length <= 1) return [...rows];

  return [...rows].sort((rowA, rowB) => {
    let valA: unknown;
    let valB: unknown;

    if (column.sortAccessor) {
      valA = column.sortAccessor(rowA);
      valB = column.sortAccessor(rowB);
    } else if (typeof rowA === 'object' && rowA !== null && column.key in rowA) {
      valA = (rowA as Record<string, unknown>)[column.key];
      valB = (rowB as Record<string, unknown>)[column.key];
    } else {
      valA = null;
      valB = null;
    }

    if (valA == null && valB == null) return 0;
    if (valA == null) return 1;
    if (valB == null) return -1;

    const cmp = compareValues(valA, valB, column.sortType);
    if (cmp === 0) return 0;
    return direction === 'asc' ? cmp : -cmp;
  });
}
