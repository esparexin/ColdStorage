import type { CreateDeliveryDTO, DeliveryChallan, DeliverySummary } from '@cold-storage/contracts';
import { DeliveryChallanModel } from '../../../database/models/delivery-challan.model.js';
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

/** Pre-transaction retry shortcut: returns original delivery when key replays same payload. */
export async function resolveIdempotentDelivery(facilityId: string, key: string, input: CreateDeliveryDTO): Promise<{ delivery: DeliveryChallan; summary: DeliverySummary } | null> {
  const existing = await findIdempotentDelivery(facilityId, key);
  if (!existing) return null;
  assertSameDeliveryPayload(existing as unknown as Record<string, unknown>, input);
  return { delivery: toChallanEntity(existing), summary: await getDeliverySummary(facilityId, input.grnId) };
}
