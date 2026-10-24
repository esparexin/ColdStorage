import { describe, expect, it } from 'vitest';
import { buildDeliveryPayload, type DeliveryPayloadInput } from '../deliveryPayload.helper';

describe('buildDeliveryPayload', () => {
  const baseInput: DeliveryPayloadInput = {
    grnId: 'grn-1',
    createDate: '2026-10-24T10:00:00.000Z',
    smallBags: 20,
    bigBags: 30,
    createVehicleNumber: 'UP32AA1111',
    createDriverName: 'Ramesh',
    createWeight: 2500,
    createGpNumber: 'GP-0001',
    createRemarks: 'Delivering goods',
  };

  it('builds standard Small & Big payload with bagType S/B by default', () => {
    const payload = buildDeliveryPayload({
      ...baseInput,
      bagCategory: 'S/B',
    });

    expect(payload.grnId).toBe('grn-1');
    expect(payload.bagType).toBe('S/B');
    expect(payload.bagCategory).toBe('S/B');
    expect(payload.smallBags).toBe(20);
    expect(payload.bigBags).toBe(30);
    expect(payload.quantity).toBe(50);
    expect(payload.seasonalBagPrice).toBeUndefined();
    expect(payload.monthlyBagPrice).toBeUndefined();
  });

  it('builds Hybrid payload with bagType Hybrid, quantity, and rates', () => {
    const payload = buildDeliveryPayload({
      ...baseInput,
      bagCategory: 'Hybrid',
      quantity: 50,
      smallBags: 0,
      bigBags: 0,
      seasonalBagPrice: 12.5,
      monthlyBagPrice: 2.5,
    });

    expect(payload.bagType).toBe('Hybrid');
    expect(payload.bagCategory).toBe('Hybrid');
    expect(payload.quantity).toBe(50);
    expect(payload.smallBags).toBe(0);
    expect(payload.bigBags).toBe(0);
    expect(payload.seasonalBagPrice).toBe(12.5);
    expect(payload.monthlyBagPrice).toBe(2.5);
  });

  it('normalizes vehicle registration in payload', () => {
    const payload = buildDeliveryPayload({
      ...baseInput,
      createVehicleNumber: 'up-32 aa 1111',
    });

    expect(payload.vehicleNumber).toBe('UP32AA1111');
  });

  it('includes unclassifiedDispatch and confirmedDispatch when provided', () => {
    const payload = buildDeliveryPayload({
      ...baseInput,
      unclassifiedDispatch: {
        bagType: 'S/B',
        smallBags: 10,
        bigBags: 4,
        seasonalBagPrice: 110,
      },
      confirmedDispatch: {
        bagType: 'S/B',
        smallBags: 15,
        bigBags: 15,
        seasonalBagPrice: 110,
      },
    });

    expect(payload.unclassifiedDispatch).toEqual({
      bagType: 'S/B',
      smallBags: 10,
      bigBags: 4,
      seasonalBagPrice: 110,
    });
    expect(payload.confirmedDispatch).toEqual({
      bagType: 'S/B',
      smallBags: 15,
      bigBags: 15,
      seasonalBagPrice: 110,
    });
  });

  it('includes Hybrid unclassifiedDispatch and confirmedDispatch with monthly and seasonal rates', () => {
    const payload = buildDeliveryPayload({
      ...baseInput,
      unclassifiedDispatch: {
        bagType: 'Hybrid',
        quantity: 14,
        seasonalBagPrice: 110,
        monthlyBagPrice: 20,
      },
      confirmedDispatch: {
        bagType: 'Hybrid',
        quantity: 30,
        seasonalBagPrice: 110,
        monthlyBagPrice: 20,
      },
    });

    expect(payload.unclassifiedDispatch).toEqual({
      bagType: 'Hybrid',
      quantity: 14,
      seasonalBagPrice: 110,
      monthlyBagPrice: 20,
    });
    expect(payload.confirmedDispatch).toEqual({
      bagType: 'Hybrid',
      quantity: 30,
      seasonalBagPrice: 110,
      monthlyBagPrice: 20,
    });
  });
});
