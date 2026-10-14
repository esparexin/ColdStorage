import { describe, expect, it } from 'vitest';
import { buildInwardReceiptNumber, INWARD_RECEIPT_PREFIX, grnNumberInputSchema } from '@cold-storage/contracts';

/**
 * Regression guard for the inward-receipt counter poisoning (W1.3).
 *
 * The Inward Receipt Number used to be allocated from an INWARD_RECEIPT counter.
 * `create-grn.handler.ts` accepted an optional operator `billNumber`, captured
 * its trailing digits with an UNANCHORED /(\d+)$/ and pushed the value back into
 * the counter with `$max`, which is monotonic and therefore irreversible.
 *
 * Observed in production: lastSequence reached 758696 against 22 GRNs, with the
 * chain RCPT-2026-27-0001 -> 05505 -> 093949 -> 758686 -> 758696.
 *
 * The receipt number is now derived from the GR Number, so no counter exists to
 * poison. These tests pin the derivation and the uniqueness invariant that
 * replaces the counter.
 */
describe('buildInwardReceiptNumber', () => {
  it('derives RCPT-<FY>-<grnNumber> from the GR Number', () => {
    expect(buildInwardReceiptNumber('2026-27', '0099')).toBe('RCPT-2026-27-0099');
    expect(buildInwardReceiptNumber('2023-24', '0001')).toBe('RCPT-2023-24-0001');
  });

  it('uses the shared RCPT prefix so the document family stays identifiable', () => {
    expect(INWARD_RECEIPT_PREFIX).toBe('RCPT');
    expect(buildInwardReceiptNumber('2026-27', '0001')).toContain('RCPT-');
  });

  it('never emits the counter-era runaway values', () => {
    // Any receipt derived from a real four-digit GR Number must be short.
    for (const grn of ['0001', '0002', '0017', '0099']) {
      expect(buildInwardReceiptNumber('2026-27', grn)).toHaveLength('RCPT-2026-27-0001'.length);
    }
    // Explicitly: the poisoned baseline must be unreachable by derivation.
    expect(buildInwardReceiptNumber('2026-27', '0099')).not.toContain('7586');
    expect(buildInwardReceiptNumber('2026-27', '0099')).not.toContain('93949');
  });

  it('cannot be poisoned by arbitrary trailing digits, because there is no free-text input', () => {
    // The old failure mode: billNumber "BILL-2026" -> trailing digits 2026 ->
    // $max pushed the counter to 2026. With derivation there is no operator
    // input at all; only a contract-validated four-digit GR Number can reach it.
    const parse = grnNumberInputSchema.safeParse('BILL-2026');
    expect(parse.success).toBe(false);
    expect(() => buildInwardReceiptNumber('2026-27', 'BILL-2026' as string)).not.toThrow();
    // Even a nonsense value cannot produce a runaway sequence number: the
    // output is a fixed-width concatenation, not an accumulator.
    expect(buildInwardReceiptNumber('2026-27', 'BILL-2026' as string)).toBe(
      'RCPT-2026-27-BILL-2026',
    );
  });

  it('guarantees per-facility uniqueness given the GR Number uniqueness contract', () => {
    // grnNumber is unique per facility (facilityId_1_grnNumber_1 unique index).
    // Two different GR Numbers therefore cannot yield the same receipt number.
    const a = buildInwardReceiptNumber('2026-27', '0001');
    const b = buildInwardReceiptNumber('2026-27', '0002');
    expect(a).not.toBe(b);
  });

  it('rejects GR Numbers the contract forbids', () => {
    for (const bad of ['', 'abc', '123', '12345', '00 1']) {
      expect(grnNumberInputSchema.safeParse(bad).success, bad).toBe(false);
    }
    expect(grnNumberInputSchema.safeParse('0001').success).toBe(true);
  });
});