import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { validateDeliveryDate } from '../delivery-validation.helper.js';

describe('validateDeliveryDate - Delivery Date & Chronological Invariants', () => {
  const originalEnv = process.env.ALLOW_HISTORICAL_TESTING_DATES;

  beforeEach(() => {
    delete process.env.ALLOW_HISTORICAL_TESTING_DATES;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ALLOW_HISTORICAL_TESTING_DATES = originalEnv;
    } else {
      delete process.env.ALLOW_HISTORICAL_TESTING_DATES;
    }
  });

  it('1. rejects delivery date that precedes inward receipt date', () => {
    process.env.ALLOW_HISTORICAL_TESTING_DATES = 'true';
    const inwardDate = new Date('2024-08-12T00:00:00.000Z');
    const earlierDelivery = new Date('2024-08-01T00:00:00.000Z');

    expect(() => validateDeliveryDate(earlierDelivery, inwardDate)).toThrow(
      'Delivery date cannot be earlier than Inward date',
    );
  });

  it('2. accepts delivery date on the exact same date as inward receipt', () => {
    process.env.ALLOW_HISTORICAL_TESTING_DATES = 'true';
    const sameDate = new Date('2024-08-12T00:00:00.000Z');
    const result = validateDeliveryDate(sameDate, sameDate);
    expect(result.toISOString()).toBe(sameDate.toISOString());
  });

  it('3. accepts delivery date after inward receipt date', () => {
    process.env.ALLOW_HISTORICAL_TESTING_DATES = 'true';
    const inwardDate = new Date('2024-08-12T00:00:00.000Z');
    const laterDelivery = new Date('2024-10-15T00:00:00.000Z');
    const result = validateDeliveryDate(laterDelivery, inwardDate);
    expect(result.toISOString()).toBe(laterDelivery.toISOString());
  });

  it('4. accepts delivery date when inwardDate is omitted', () => {
    process.env.ALLOW_HISTORICAL_TESTING_DATES = 'true';
    const deliveryDate = new Date('2024-10-15T00:00:00.000Z');
    const result = validateDeliveryDate(deliveryDate);
    expect(result.toISOString()).toBe(deliveryDate.toISOString());
  });
});
