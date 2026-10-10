/**
 * GR Number allocation for test payloads.
 *
 * GR Numbers are entered manually on the Inward form (exactly four digits) and must be unique
 * within a facility. Tests therefore need a value per inward call: a counter that hands out
 * distinct four-digit numbers, so a suite creating several receipts in one facility does not
 * trip the production duplicate check.
 */
let sequence = 1000;

/** Returns the next unique four-digit GR Number for a test payload. */
export function nextTestGrnNumber(): string {
  sequence += 1;
  return String(sequence % 10000).padStart(4, '0');
}

/** Resets the allocator so each suite starts from a known value. */
export function resetTestGrnNumbers(): void {
  sequence = 1000;
}