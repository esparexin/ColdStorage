import type {
  CreateDeliveryInput,
  DeliveryChallan,
  DeliveryQuery,
  DeliveryReversal,
  DeliverySummary,
  ReverseDeliveryInput,
} from '@cold-storage/contracts';
import { createDeliveryWithRetry } from './handlers/create-delivery.handler.js';
import { reverseDeliveryWithRetry } from './handlers/reverse-delivery.handler.js';
import {
  getDeliveryById,
  getDeliverySummary,
  listDeliveries,
  listDeliveriesForGrn,
  resolveFacilityIdForDelivery,
} from './queries/delivery.queries.js';

export class DeliveryService {
  public async createDelivery(
    facilityId: string,
    input: CreateDeliveryInput,
    userId: string,
  ): Promise<{ delivery: DeliveryChallan; summary: DeliverySummary }> {
    return createDeliveryWithRetry(facilityId, input, userId);
  }

  public async reverseDelivery(
    facilityId: string,
    deliveryId: string,
    input: ReverseDeliveryInput,
    userId: string,
  ): Promise<{ reversal: DeliveryReversal; challan: DeliveryChallan; summary: DeliverySummary }> {
    return reverseDeliveryWithRetry(facilityId, deliveryId, input, userId);
  }

  public async getDeliveryById(
    facilityId: string,
    deliveryId: string,
  ): Promise<DeliveryChallan | null> {
    return getDeliveryById(facilityId, deliveryId);
  }

  public async listDeliveries(
    facilityId: string,
    query: DeliveryQuery,
  ): Promise<{ items: DeliveryChallan[]; total: number; page: number; limit: number }> {
    return listDeliveries(facilityId, query);
  }

  public async listDeliveriesForGrn(facilityId: string, grnId: string): Promise<DeliveryChallan[]> {
    return listDeliveriesForGrn(facilityId, grnId);
  }

  public async getDeliverySummary(facilityId: string, grnId: string): Promise<DeliverySummary> {
    return getDeliverySummary(facilityId, grnId);
  }

  public async resolveFacilityIdForDelivery(deliveryId: string): Promise<string | null> {
    return resolveFacilityIdForDelivery(deliveryId);
  }
}

export const deliveryService = new DeliveryService();
