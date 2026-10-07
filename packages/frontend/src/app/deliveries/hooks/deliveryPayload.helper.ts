export interface DeliveryPayloadInput {
  grnId: string;
  createDate: string;
  smallBags: number;
  bigBags: number;
  bagCategory?: 'Small' | 'Big' | 'Small & Big';
  rentCharge?: number;
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
  const totalQuantity = input.smallBags + input.bigBags;
  const payload: Record<string, unknown> = {
    grnId: input.grnId,
    date: new Date(input.createDate),
    quantity: totalQuantity,
    smallBags: input.smallBags,
    bigBags: input.bigBags,
  };

  if (input.bagCategory) {
    payload.bagCategory = input.bagCategory;
  }
  if (typeof input.rentCharge === 'number' && input.rentCharge >= 0) {
    payload.rentCharge = input.rentCharge;
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
