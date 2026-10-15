import type mongoose from 'mongoose';
import { DeliveryChallanModel } from '../../../database/models/delivery-challan.model.js';
import { counterService } from '../../common/counter.service.js';

/** Sequential GP numbering with duplicate prevention (extracted for line budget). */
export async function resolveDeliveryGpNumber(facilityId: string, inputGp: unknown, deliveryDate: Date, session: mongoose.ClientSession): Promise<string | null> {
  let gpNumber: string | null = null;
  const raw = typeof inputGp === 'string' ? inputGp.trim() : '';
  if (raw) {
    gpNumber = raw;
    const match = /^GP-(\d+)$/i.exec(gpNumber);
    if (match && !isNaN(parseInt(match[1], 10))) await counterService.syncGatePassSequence(facilityId, deliveryDate, parseInt(match[1], 10), session);
  } else gpNumber = await counterService.generateGatePassNumber(facilityId, deliveryDate, session);
  if (gpNumber) {
    const existingGp = await DeliveryChallanModel.findOne({ facilityId, gpNumber }, { id: 1 }, { session }).lean().exec();
    if (existingGp) throw new Error(`Gate Pass number '${gpNumber}' already exists in this facility`);
  }
  return gpNumber;
}
