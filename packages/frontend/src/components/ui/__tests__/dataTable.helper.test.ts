import { describe, expect, it } from 'vitest';
import { isInteractiveTarget, shouldTriggerRowClickOnKey } from '../dataTable.helper';

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
