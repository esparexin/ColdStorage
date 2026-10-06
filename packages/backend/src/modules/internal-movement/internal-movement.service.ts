import type { MergeGrnInput, TransferOwnershipInput, Grn, InternalMovementRecord } from '@cold-storage/contracts';
import { InternalMovementModel } from '../../database/models/internal-movement.model.js';
import { mergeGrn } from './handlers/merge-grn.handler.js';
import { transferOwnership } from './handlers/transfer-ownership.handler.js';

export class InternalMovementService {
  public async mergeGrn(
    facilityId: string,
    input: MergeGrnInput,
    userId: string,
  ): Promise<{ targetGrn: Grn; movement: InternalMovementRecord }> {
    return mergeGrn(facilityId, input, userId);
  }

  public async transferOwnership(
    facilityId: string,
    input: TransferOwnershipInput,
    userId: string,
  ): Promise<{ grn: Grn; movement: InternalMovementRecord }> {
    return transferOwnership(facilityId, input, userId);
  }

  public async getMovementsForFacility(facilityId: string): Promise<InternalMovementRecord[]> {
    const docs = await InternalMovementModel.find({ facilityId })
      .sort({ movementDate: -1, _id: -1 })
      .lean()
      .exec();
    return docs.map((d) => ({
      ...d,
      id: d.id,
      movementDate: new Date(d.movementDate),
      createdAt: new Date(d.createdAt),
    })) as InternalMovementRecord[];
  }

  public async getMovementsForGrn(facilityId: string, grnId: string): Promise<InternalMovementRecord[]> {
    const docs = await InternalMovementModel.find({
      facilityId,
      $or: [{ targetGrnId: grnId }, { sourceGrnIds: grnId }, { grnId }],
    })
      .sort({ movementDate: -1, _id: -1 })
      .lean()
      .exec();
    return docs.map((d) => ({
      ...d,
      id: d.id,
      movementDate: new Date(d.movementDate),
      createdAt: new Date(d.createdAt),
    })) as InternalMovementRecord[];
  }
}

export const internalMovementService = new InternalMovementService();
