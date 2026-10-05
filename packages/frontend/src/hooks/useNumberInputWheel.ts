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
 * Hook to normalize mouse wheel / trackpad scrolling on number fields across the application.
 *
 * Requirements:
 * - Scroll up -> increase value.
 * - Scroll down -> decrease value.
 * - Normal page scrolling does not change number values (only adjusts when actively focused).
 * - Prevents container/modal from scrolling while adjusting a focused number input.
 */
export function useNumberInputWheel(): void {
  useEffect(() => {
    let accumulatedDelta = 0;
    let lastTarget: HTMLInputElement | null = null;
    let resetTimer: ReturnType<typeof setTimeout> | null = null;

    const TRACKPAD_THRESHOLD = 35;

    const handleWheel = (e: WheelEvent) => {
      const target = e.target;
      if (!(target instanceof HTMLInputElement) || target.type !== 'number') {
        return;
      }

      // Ensure normal page scrolling does not accidentally change value.
      // Only adjust value if the input is actively focused by the user.
      if (document.activeElement !== target) {
        return;
      }

      // Do not alter read-only or disabled fields
      if (target.readOnly || target.disabled) {
        return;
      }

      // Prevent container / page from scrolling while user is scrolling the focused number input
      e.preventDefault();

      if (target !== lastTarget) {
        accumulatedDelta = 0;
        lastTarget = target;
      }

      if (resetTimer) clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        accumulatedDelta = 0;
      }, 200);

      const isDiscreteTick = Math.abs(e.deltaY) >= 50;
      let direction: 'up' | 'down' | null = null;

      if (isDiscreteTick) {
        direction = e.deltaY < 0 ? 'up' : 'down';
        accumulatedDelta = 0;
      } else {
        accumulatedDelta += e.deltaY;
        if (accumulatedDelta <= -TRACKPAD_THRESHOLD) {
          direction = 'up';
          accumulatedDelta += TRACKPAD_THRESHOLD;
        } else if (accumulatedDelta >= TRACKPAD_THRESHOLD) {
          direction = 'down';
          accumulatedDelta -= TRACKPAD_THRESHOLD;
        }
      }

      if (direction) {
        const nextValue = calculateNextNumberValue(target, direction);
        if (nextValue !== null) {
          applyInputValue(target, nextValue);
        }
      }
    };

    const handleBlur = () => {
      accumulatedDelta = 0;
      lastTarget = null;
      if (resetTimer) clearTimeout(resetTimer);
    };

    document.addEventListener('wheel', handleWheel, { capture: true, passive: false });
    document.addEventListener('focusout', handleBlur, { capture: true });

    return () => {
      document.removeEventListener('wheel', handleWheel, { capture: true });
      document.removeEventListener('focusout', handleBlur, { capture: true });
      if (resetTimer) clearTimeout(resetTimer);
    };
  }, []);
}
