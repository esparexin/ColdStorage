import type { CreateDeliveryDTO, DeliveryChallan, DeliverySummary } from '@cold-storage/contracts';
import { DeliveryChallanModel } from '../../../database/models/delivery-challan.model.js';
import { ConcurrencyConflictError } from '../../inventory/inventory.mappers.js';
import { toChallanEntity } from '../delivery.mappers.js';
import { getDeliverySummary } from '../queries/delivery.queries.js';

/** Stable payload fingerprint for idempotency comparison (M5). */
export function fingerprintDeliveryInput(input: CreateDeliveryDTO): string {
  return JSON.stringify({
    grnId: input.grnId,
    quantity: input.quantity ?? null,
    smallBags: input.smallBags ?? 0,
    bigBags: input.bigBags ?? 0,
    bagCategory: input.bagCategory ?? null,
    bagPrice: input.bagPrice ?? null,
    seasonalBagPrice: input.seasonalBagPrice ?? null,
    monthlyBagPrice: input.monthlyBagPrice ?? null,
    vehicleNumber: input.vehicleNumber ?? null,
    driverName: input.driverName ?? null,
  });
}

export async function findIdempotentDelivery(facilityId: string, key: string) {
  return DeliveryChallanModel.findOne({ facilityId, idempotencyKey: key }).lean().exec();
}

export function assertSameDeliveryPayload(stored: Record<string, unknown>, input: CreateDeliveryDTO): void {
  const same =
    String(stored.grnId) === String(input.grnId) &&
    Number(stored.smallBags ?? 0) === Number(input.smallBags ?? 0) &&
    Number(stored.bigBags ?? 0) === Number(input.bigBags ?? 0) &&
    (stored.bagCategory ?? null) === (input.bagCategory ?? null);
  if (!same) throw new Error(`Idempotency key already used for a different delivery payload`);
}

/** Pre-transaction replay check for the retry-loop entry (race layer 1). */
export async function checkPreTransactionReplay(facilityId: string, input: CreateDeliveryDTO): Promise<{ delivery: DeliveryChallan; summary: DeliverySummary } | null> {
  const key = (input as unknown as Record<string, unknown>).idempotencyKey;
  if (typeof key !== 'string' || key.length === 0) return null;
  return resolveIdempotentDelivery(facilityId, key, input);
}

/** Pre-transaction retry shortcut: returns original delivery when key replays same payload. */
export async function resolveIdempotentDelivery(facilityId: string, key: string, input: CreateDeliveryDTO): Promise<{ delivery: DeliveryChallan; summary: DeliverySummary } | null> {
  const existing = await findIdempotentDelivery(facilityId, key);
  if (!existing) return null;
  assertSameDeliveryPayload(existing as unknown as Record<string, unknown>, input);
  return { delivery: toChallanEntity(existing), summary: await getDeliverySummary(facilityId, input.grnId) };
}

/** Session-bound replay check for inside the write transaction (race layer 2). */
export async function resolveIdempotentDeliveryTx(facilityId: string, key: string, input: CreateDeliveryDTO, session: import('mongoose').ClientSession): Promise<{ delivery: DeliveryChallan; summary: DeliverySummary } | null> {
  const existing = await DeliveryChallanModel.findOne({ facilityId, idempotencyKey: key }, null, { session }).lean().exec();
  if (!existing) return null;
  assertSameDeliveryPayload(existing as unknown as Record<string, unknown>, input);
  return { delivery: toChallanEntity(existing), summary: await getDeliverySummary(facilityId, input.grnId) };
}

/** True for any MongoDB duplicate-key error (code 11000), without echoing its details. */
export function isDuplicateKeyError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { code?: number }).code === 11000;
}

/** True when the duplicate key is the delivery idempotency constraint. */
export function isIdempotencyDuplicateKey(err: unknown): boolean {
  if (!isDuplicateKeyError(err)) return false;
  const e = err as { message?: string; keyPattern?: Record<string, unknown> };
  if (e.keyPattern && 'idempotencyKey' in e.keyPattern) return true;
  return typeof e.message === 'string' && e.message.includes('idempotencyKey');
}

/**
 * Commit-race recovery: both requests passed the pre-check, one won the unique
 * index. Returns the winner for a matching retry (safe conflict otherwise),
 * so concurrent duplicates never leak raw duplicate-key details nor double-post.
 */
export async function resolveIdempotentRaceResult(facilityId: string, key: string, input: CreateDeliveryDTO): Promise<{ delivery: DeliveryChallan; summary: DeliverySummary }> {
  const existing = await findIdempotentDelivery(facilityId, key);
  if (!existing) throw new ConcurrencyConflictError();
  assertSameDeliveryPayload(existing as unknown as Record<string, unknown>, input);
  return { delivery: toChallanEntity(existing), summary: await getDeliverySummary(facilityId, input.grnId) };
}

/**
 * Duplicate-key funnel for the delivery retry loop: idempotency races resolve
 * to the winner, all other uniqueness races become a safe retryable conflict.
 * Returns null when the error is not a duplicate key. Never rethrows internals.
 */
export async function resolveDeliveryConflict(facilityId: string, input: CreateDeliveryDTO, err: unknown): Promise<{ delivery: DeliveryChallan; summary: DeliverySummary } | null> {
  const key = (input as unknown as Record<string, unknown>).idempotencyKey;
  if (typeof key === 'string' && key.length > 0 && isIdempotencyDuplicateKey(err)) {
    return resolveIdempotentRaceResult(facilityId, key, input);
  }
  if (isDuplicateKeyError(err)) throw new ConcurrencyConflictError();
  return null;
}
