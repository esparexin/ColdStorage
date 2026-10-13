import type { OutwardBagCategory } from '@cold-storage/contracts';

export interface DeliveryPayloadInput {
  grnId: string;
  createDate: string;
  smallBags: number;
  bigBags: number;
  quantity?: number;
  bagCategory?: OutwardBagCategory;
  bagPrice?: number;
  rentCharge?: number;
  paymentAmount?: number;
  paymentMode?: 'Cash' | 'UPI';
  paymentReference?: string;
  createVehicleNumber: string;
  createDriverName: string;
  createWeight: number | '';
  createGpNumber: string;
  createRemarks: string;
}

/**
 * Builds the POST /deliveries payload. The composition ({smallBags, bigBags}) is what the
 * delivery API requires; the single-quantity UI maps onto it before this point, so this
 * builder stays a straight pass-through with optional transport fields.
 */
export function buildDeliveryPayload(input: DeliveryPayloadInput): Record<string, unknown> {
  const isModern = input.bagCategory === 'Modern Size' || input.bagCategory === 'Mixed';
  const totalQuantity = isModern && typeof input.quantity === 'number' && input.quantity > 0
    ? input.quantity
    : input.smallBags + input.bigBags;
  const payload: Record<string, unknown> = {
    grnId: input.grnId,
    date: new Date(input.createDate),
    quantity: totalQuantity,
    smallBags: isModern ? 0 : input.smallBags,
    bigBags: isModern ? 0 : input.bigBags,
  };

  if (input.bagCategory) {
    payload.bagCategory = input.bagCategory;
  }
  if (isModern && typeof input.bagPrice === 'number' && input.bagPrice > 0) {
    payload.bagPrice = input.bagPrice;
  }
  if (typeof input.rentCharge === 'number' && input.rentCharge >= 0) {
    payload.rentCharge = input.rentCharge;
  }
  if (typeof input.paymentAmount === 'number' && input.paymentAmount >= 0) {
    payload.paymentAmount = input.paymentAmount;
    if (input.paymentMode) payload.paymentMode = input.paymentMode;
    if (input.paymentReference?.trim()) payload.paymentReference = input.paymentReference.trim();
  }
  if (input.createVehicleNumber.trim()) {
    payload.vehicleNumber = input.createVehicleNumber.trim().toUpperCase();
  }
  if (input.createDriverName.trim()) {
    payload.driverName = input.createDriverName.trim();
  }
  if (input.createWeight !== '' && typeof input.createWeight === 'number' && input.createWeight > 0) {
    payload.weight = input.createWeight;
  }
  if (input.createGpNumber.trim()) {
    payload.gpNumber = input.createGpNumber.trim();
  }
  if (input.createRemarks.trim()) {
    payload.remarks = input.createRemarks.trim();
  }

  return payload;
}
