'use client';

import { useEffect } from 'react';

export interface NumberInputLike {
  getAttribute: (name: string) => string | null;
  value: string;
}

/**
 * Calculates the next numerical value based on step, min, and max attributes.
 */
export function calculateNextNumberValue(
  input: HTMLInputElement | NumberInputLike,
  direction: 'up' | 'down',
): string | null {
  const isUp = direction === 'up';
  const stepAttr = input.getAttribute('step');
  const step = stepAttr && stepAttr !== 'any' ? parseFloat(stepAttr) : 1;
  if (isNaN(step) || step <= 0) return null;

  const minAttr = input.getAttribute('min');
  const min = minAttr !== null && minAttr !== '' ? parseFloat(minAttr) : null;
  const maxAttr = input.getAttribute('max');
  const max = maxAttr !== null && maxAttr !== '' ? parseFloat(maxAttr) : null;

  const raw = input.value.trim();
  let current: number;

  if (raw === '') {
    const base = min !== null ? min : 0;
    const initial = isUp ? (min !== null && min > 0 ? min : base + step) : base;
    const clamped = clampValue(initial, min, max);
    return formatWithPrecision(clamped, step);
  }

  current = parseFloat(raw);
  if (isNaN(current)) return null;

  const rawNext = isUp ? current + step : current - step;
  const clamped = clampValue(rawNext, min, max);

  if (clamped === current) {
    return null;
  }

  return formatWithPrecision(clamped, step);
}

function clampValue(val: number, min: number | null, max: number | null): number {
  if (min !== null && val < min) return min;
  if (max !== null && val > max) return max;
  return val;
}

function formatWithPrecision(val: number, step: number): string {
  const stepStr = step.toString();
  const precision = stepStr.includes('.') ? stepStr.split('.')[1].length : 0;
  return Number(val.toFixed(precision)).toString();
}

/**
 * Programmatically applies an input value so React controlled inputs and synthetic
 * onChange listeners reliably detect the state change.
 */
export function applyInputValue(input: HTMLInputElement, nextValueStr: string): void {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set;

  // Sync React's internal valueTracker so synthetic onChange triggers
  const tracker = (input as unknown as { _valueTracker?: { setValue: (v: string) => void } })
    ._valueTracker;
  if (tracker) {
    tracker.setValue(input.value);
  }

  if (nativeSetter) {
    nativeSetter.call(input, nextValueStr);
  } else {
    input.value = nextValueStr;
  }

  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Hook to prevent accidental increment/decrement of numeric input fields
 * during mouse-wheel or trackpad scrolling across the entire application.
 *
 * Requirements:
 * - Scrolling the page or modal must not accidentally change a numeric field's value.
 * - Preserve normal page and modal scrolling (never call preventDefault).
 * - Preserve direct keyboard entry and existing validation.
 */
export function useNumberInputWheel(): void {
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      const target = e.target;
      if (!(target instanceof HTMLInputElement) || target.type !== 'number') {
        return;
      }

      // If a number input is focused while the user scrolls, blur it immediately.
      // This suppresses native browser step modification and allows container
      // scroll to proceed smoothly without preventing default.
      if (document.activeElement === target) {
        target.blur();
      }
    };

    document.addEventListener('wheel', handleWheel, { capture: true, passive: true });

    return () => {
      document.removeEventListener('wheel', handleWheel, { capture: true });
    };
  }, []);
}
