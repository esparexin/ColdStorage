import { describe, expect, it } from 'vitest';
import { validateMergePaymentDecision, validateTransferPayment } from '../internalMovementPayload.helper';

describe('validateTransferPayment', () => {
  it('permits transfer when there is zero pending balance', () => {
    expect(validateTransferPayment('AGREED_PENDING', 0, 0)).toBeNull();
    expect(validateTransferPayment('SETTLE_NOW', 0, 0)).toBeNull();
  });

  it('permits AGREED_PENDING when there are outstanding dues to carry forward', () => {
    expect(validateTransferPayment('AGREED_PENDING', 0, 1500)).toBeNull();
  });

  it('rejects zero or negative payment amount under SETTLE_NOW', () => {
    expect(validateTransferPayment('SETTLE_NOW', 0, 1500)).toBe('Payment amount must be greater than zero.');
    expect(validateTransferPayment('SETTLE_NOW', -100, 1500)).toBe('Payment amount must be greater than zero.');
  });

  it('rejects partial payment because SETTLE_NOW requires full settlement', () => {
    const error = validateTransferPayment('SETTLE_NOW', 1000, 1500);
    expect(error).toContain('Outstanding rent must be settled in full (₹1,500) before ownership transfer under SETTLE_NOW, or choose AGREED_PENDING to carry forward.');
  });

  it('rejects payment amount exceeding pending balance', () => {
    const error = validateTransferPayment('SETTLE_NOW', 2000, 1500);
    expect(error).toContain('Payment cannot exceed pending balance of ₹1,500.');
  });

  it('accepts exact full settlement under SETTLE_NOW', () => {
    expect(validateTransferPayment('SETTLE_NOW', 1500, 1500)).toBeNull();
  });
});

describe('validateMergePaymentDecision', () => {
  it('permits AGREED_PENDING for single and multi-source merges', () => {
    expect(validateMergePaymentDecision({
      decision: 'AGREED_PENDING', sourceCount: 1, amount: 0, pending: 500,
    })).toBeNull();
    expect(validateMergePaymentDecision({
      decision: 'AGREED_PENDING', sourceCount: 3, amount: 0, pending: 1500,
    })).toBeNull();
  });

  it('rejects SETTLE_NOW when more than one source lot is selected', () => {
    const error = validateMergePaymentDecision({
      decision: 'SETTLE_NOW', sourceCount: 2, amount: 500, pending: 500, paymentMode: 'Cash',
    });
    expect(error).toBe('Inline settlement requires a single source GRN. Choose Option A to carry forward.');
  });

  it('permits SETTLE_NOW when a single source lot is selected and valid', () => {
    expect(validateMergePaymentDecision({
      decision: 'SETTLE_NOW', sourceCount: 1, amount: 500, pending: 500, paymentMode: 'Cash',
    })).toBeNull();
  });

  it('rejects non-positive settlement amounts', () => {
    expect(validateMergePaymentDecision({
      decision: 'SETTLE_NOW', sourceCount: 1, amount: 0, pending: 500, paymentMode: 'Cash',
    })).toBe('Enter a settlement amount greater than zero.');
  });

  it('rejects settlement amount exceeding pending rent', () => {
    expect(validateMergePaymentDecision({
      decision: 'SETTLE_NOW', sourceCount: 1, amount: 600, pending: 500, paymentMode: 'Cash',
    })).toBe('Settlement amount cannot exceed outstanding rent of ₹500.');
  });

  it('rejects missing payment mode', () => {
    expect(validateMergePaymentDecision({
      decision: 'SETTLE_NOW', sourceCount: 1, amount: 500, pending: 500, paymentMode: '',
    })).toBe('Please select a payment mode.');
  });
});

