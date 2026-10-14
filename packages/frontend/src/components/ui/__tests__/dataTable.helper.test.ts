import { describe, expect, it } from 'vitest';
import {
  compareValues,
  getNextSortDirection,
  isInteractiveTarget,
  shouldTriggerRowClickOnKey,
  sortRows,
} from '../dataTable.helper';

describe('isInteractiveTarget', () => {
  it('returns false for null or undefined target', () => {
    expect(isInteractiveTarget(null)).toBe(false);
    expect(isInteractiveTarget(undefined as unknown as EventTarget)).toBe(false);
  });

  it('returns false for non-element targets', () => {
    expect(isInteractiveTarget({} as unknown as EventTarget)).toBe(false);
  });

  it('returns true when target is a button or inside a button', () => {
    const button = {
      closest: (sel: string) => (sel.includes('button') ? button : null),
    } as unknown as HTMLElement;
    expect(isInteractiveTarget(button)).toBe(true);
  });

  it('returns true when target is an anchor link', () => {
    const link = {
      closest: (sel: string) => (sel.includes('a') ? link : null),
    } as unknown as HTMLElement;
    expect(isInteractiveTarget(link)).toBe(true);
  });

  it('returns true when target is an input or select or textarea', () => {
    const input = {
      closest: (sel: string) => (sel.includes('input') ? input : null),
    } as unknown as HTMLElement;
    expect(isInteractiveTarget(input)).toBe(true);

    const select = {
      closest: (sel: string) => (sel.includes('select') ? select : null),
    } as unknown as HTMLElement;
    expect(isInteractiveTarget(select)).toBe(true);
  });

  it('returns true when target has role="button" or role="menuitem"', () => {
    const roleBtn = {
      closest: (sel: string) => (sel.includes('[role="button"]') ? roleBtn : null),
    } as unknown as HTMLElement;
    expect(isInteractiveTarget(roleBtn)).toBe(true);
  });

  it('returns true when target has data-prevent-row-click', () => {
    const custom = {
      closest: (sel: string) => (sel.includes('[data-prevent-row-click]') ? custom : null),
    } as unknown as HTMLElement;
    expect(isInteractiveTarget(custom)).toBe(true);
  });

  it('returns false for regular table cell or text span without interactive ancestor', () => {
    const cell = {
      closest: () => null,
    } as unknown as HTMLElement;
    expect(isInteractiveTarget(cell)).toBe(false);
  });
});

describe('shouldTriggerRowClickOnKey', () => {
  it('returns true for Enter and Space', () => {
    expect(shouldTriggerRowClickOnKey('Enter')).toBe(true);
    expect(shouldTriggerRowClickOnKey(' ')).toBe(true);
  });

  it('returns false for other keys', () => {
    expect(shouldTriggerRowClickOnKey('Tab')).toBe(false);
    expect(shouldTriggerRowClickOnKey('ArrowDown')).toBe(false);
    expect(shouldTriggerRowClickOnKey('Escape')).toBe(false);
  });
});

describe('getNextSortDirection', () => {
  it('defaults to asc when changing to a new column', () => {
    expect(getNextSortDirection(null, 'name')).toBe('asc');
    expect(getNextSortDirection('date', 'name', 'asc')).toBe('asc');
    expect(getNextSortDirection('date', 'name', 'desc')).toBe('asc');
  });

  it('toggles direction when clicking the active column', () => {
    expect(getNextSortDirection('name', 'name', 'asc')).toBe('desc');
    expect(getNextSortDirection('name', 'name', 'desc')).toBe('asc');
    expect(getNextSortDirection('name', 'name', undefined)).toBe('asc');
  });
});

describe('compareValues', () => {
  it('handles nulls and undefined by sorting them to the end', () => {
    expect(compareValues(null, null)).toBe(0);
    expect(compareValues(undefined, undefined)).toBe(0);
    expect(compareValues(null, 'apple')).toBe(1);
    expect(compareValues('apple', null)).toBe(-1);
    expect(compareValues(undefined, 42)).toBe(1);
    expect(compareValues(42, undefined)).toBe(-1);
  });

  it('compares numbers correctly', () => {
    expect(compareValues(5, 10, 'number')).toBeLessThan(0);
    expect(compareValues(10, 5, 'number')).toBeGreaterThan(0);
    expect(compareValues(7, 7, 'number')).toBe(0);
    expect(compareValues('50', '100', 'number')).toBeLessThan(0);
    expect(compareValues(0, -10, 'number')).toBeGreaterThan(0);
  });

  it('compares dates correctly', () => {
    const d1 = new Date('2026-01-01');
    const d2 = new Date('2026-06-01');
    expect(compareValues(d1, d2, 'date')).toBeLessThan(0);
    expect(compareValues(d2, d1, 'date')).toBeGreaterThan(0);
    expect(compareValues(d1, new Date('2026-01-01'), 'date')).toBe(0);
    expect(compareValues('2026-01-01T00:00:00Z', '2026-06-01T00:00:00Z', 'date')).toBeLessThan(0);
  });

  it('compares text using natural alphanumeric collation', () => {
    expect(compareValues('Alpha', 'Beta')).toBeLessThan(0);
    expect(compareValues('Beta', 'Alpha')).toBeGreaterThan(0);
    expect(compareValues('Chamber 2', 'Chamber 10')).toBeLessThan(0);
    expect(compareValues('GRN-0005', 'GRN-0010')).toBeLessThan(0);
  });
});

describe('sortRows', () => {
  interface SampleRow {
    id: string;
    name: string;
    bags: number;
    date: string;
    optional?: number | null;
  }

  const sampleData: SampleRow[] = [
    { id: '1', name: 'Zeta', bags: 100, date: '2026-05-10', optional: 5 },
    { id: '2', name: 'Alpha', bags: 20, date: '2026-01-15', optional: null },
    { id: '3', name: 'Gamma', bags: 500, date: '2026-03-20', optional: 10 },
    { id: '4', name: 'Beta', bags: 5, date: '2026-02-01', optional: undefined },
  ];

  it('does not mutate the source array', () => {
    const copy = [...sampleData];
    sortRows(sampleData, { key: 'name', sortable: true }, 'asc');
    expect(sampleData).toEqual(copy);
  });

  it('sorts text ascending and descending', () => {
    const asc = sortRows(sampleData, { key: 'name', sortable: true }, 'asc');
    expect(asc.map((r) => r.name)).toEqual(['Alpha', 'Beta', 'Gamma', 'Zeta']);

    const desc = sortRows(sampleData, { key: 'name', sortable: true }, 'desc');
    expect(desc.map((r) => r.name)).toEqual(['Zeta', 'Gamma', 'Beta', 'Alpha']);
  });

  it('sorts numbers ascending and descending', () => {
    const asc = sortRows(sampleData, { key: 'bags', sortable: true, sortType: 'number' }, 'asc');
    expect(asc.map((r) => r.bags)).toEqual([5, 20, 100, 500]);

    const desc = sortRows(sampleData, { key: 'bags', sortable: true, sortType: 'number' }, 'desc');
    expect(desc.map((r) => r.bags)).toEqual([500, 100, 20, 5]);
  });

  it('sorts dates ascending and descending', () => {
    const asc = sortRows(sampleData, { key: 'date', sortable: true, sortType: 'date' }, 'asc');
    expect(asc.map((r) => r.id)).toEqual(['2', '4', '3', '1']);

    const desc = sortRows(sampleData, { key: 'date', sortable: true, sortType: 'date' }, 'desc');
    expect(desc.map((r) => r.id)).toEqual(['1', '3', '4', '2']);
  });

  it('supports custom sortAccessor function', () => {
    const sorted = sortRows(
      sampleData,
      {
        key: 'custom',
        sortable: true,
        sortAccessor: (r) => r.bags * 2,
        sortType: 'number',
      },
      'asc',
    );
    expect(sorted.map((r) => r.bags)).toEqual([5, 20, 100, 500]);
  });

  it('places null / undefined values at the end regardless of direction', () => {
    const asc = sortRows(
      sampleData,
      { key: 'optional', sortable: true, sortType: 'number' },
      'asc',
    );
    expect(asc.map((r) => r.optional)).toEqual([5, 10, null, undefined]);

    const desc = sortRows(
      sampleData,
      { key: 'optional', sortable: true, sortType: 'number' },
      'desc',
    );
    expect(desc.map((r) => r.optional)).toEqual([10, 5, null, undefined]);
  });
});
