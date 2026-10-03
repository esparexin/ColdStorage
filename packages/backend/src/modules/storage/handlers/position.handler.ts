import { randomUUID } from 'node:crypto';
import type { CreatePositionInput, Position, UpdatePositionInput } from '@cold-storage/contracts';
import { LevelModel } from '../../../database/models/level.model.js';
import { PositionModel } from '../../../database/models/position.model.js';
import { getPositionOccupancy } from '../../inventory/queries/stock-summary.queries.js';

export async function createPosition(
  levelId: string,
  input: CreatePositionInput,
): Promise<Position> {
  const level = await LevelModel.findOne({ id: levelId }).lean().exec();
  if (!level) {
    throw new Error(`Parent level '${levelId}' not found`);
  }
  if (!level.isActive) {
    throw new Error(`Cannot create position under inactive level '${levelId}'`);
  }

  const code = input.code.trim();
  const existing = await PositionModel.findOne({ levelId, code }).lean().exec();
  if (existing) {
    throw new Error(`Position code '${code}' already exists in level '${levelId}'`);
  }

  const id = `pos-${randomUUID()}`;
  const doc = await PositionModel.create({
    id,
    levelId,
    rackId: level.rackId,
    chamberId: level.chamberId,
    facilityId: level.facilityId,
    code,
    capacityBags: input.capacityBags,
    isActive: input.isActive ?? true,
  });

  return {
    id: doc.id,
    levelId: doc.levelId,
    code: doc.code,
    capacityBags: doc.capacityBags,
    isActive: doc.isActive,
  };
}

export async function listPositions(levelId: string): Promise<Position[]> {
  const docs = await PositionModel.find({ levelId }).sort({ code: 1 }).lean().exec();
  return docs.map((d) => ({
    id: d.id,
    levelId: d.levelId,
    code: d.code,
    capacityBags: d.capacityBags,
    isActive: d.isActive,
  }));
}

export async function getPositionById(id: string): Promise<Position | null> {
  const doc = await PositionModel.findOne({ id }).lean().exec();
  if (!doc) return null;
  return {
    id: doc.id,
    levelId: doc.levelId,
    code: doc.code,
    capacityBags: doc.capacityBags,
    isActive: doc.isActive,
  };
}

export async function updatePosition(
  id: string,
  input: UpdatePositionInput,
): Promise<Position | null> {
  const existing = await PositionModel.findOne({ id }).exec();
  if (!existing) return null;

  if (input.code && input.code.trim() !== existing.code) {
    const code = input.code.trim();
    const duplicate = await PositionModel.findOne({
      levelId: existing.levelId,
      code,
      id: { $ne: id },
    })
      .lean()
      .exec();
    if (duplicate) {
      throw new Error(`Position code '${code}' already exists in level '${existing.levelId}'`);
    }
    existing.code = code;
  }

  if (input.capacityBags !== undefined && input.capacityBags !== existing.capacityBags) {
    const occupancy = await getPositionOccupancy(existing.facilityId, id);
    if (input.capacityBags < occupancy.occupiedBags) {
      throw new Error(
        `Cannot reduce capacity to ${input.capacityBags} bags: currently holds ${occupancy.occupiedBags} bags`,
      );
    }
    existing.capacityBags = input.capacityBags;
  }

  if (input.isActive !== undefined && input.isActive !== existing.isActive) {
    if (input.isActive) {
      const level = await LevelModel.findOne({ id: existing.levelId }).lean().exec();
      if (!level || !level.isActive) {
        throw new Error(`Cannot activate position because parent level is inactive`);
      }
    } else {
      const occupancy = await getPositionOccupancy(existing.facilityId, id);
      if (occupancy.occupiedBags > 0) {
        throw new Error(
          `Cannot deactivate rack space while it contains active inventory (${occupancy.occupiedBags} bags stored)`,
        );
      }
    }
    existing.isActive = input.isActive;
  }

  await existing.save();
  return {
    id: existing.id,
    levelId: existing.levelId,
    code: existing.code,
    capacityBags: existing.capacityBags,
    isActive: existing.isActive,
  };
}
