import { randomUUID } from 'node:crypto';
import type { CreateLevelInput, Level, UpdateLevelInput } from '@cold-storage/contracts';
import { LevelModel } from '../../../database/models/level.model.js';
import { PositionModel } from '../../../database/models/position.model.js';
import { RackModel } from '../../../database/models/rack.model.js';

export async function createLevel(rackId: string, input: CreateLevelInput): Promise<Level> {
  const rack = await RackModel.findOne({ id: rackId }).lean().exec();
  if (!rack) {
    throw new Error(`Parent rack '${rackId}' not found`);
  }
  if (!rack.isActive) {
    throw new Error(`Cannot create level under inactive rack '${rackId}'`);
  }

  const code = input.code.trim();
  const existingCode = await LevelModel.findOne({ rackId, code }).lean().exec();
  if (existingCode) {
    throw new Error(`Level code '${code}' already exists in rack '${rackId}'`);
  }

  const existingNumber = await LevelModel.findOne({
    rackId,
    levelNumber: input.levelNumber,
  })
    .lean()
    .exec();
  if (existingNumber) {
    throw new Error(`Level number '${input.levelNumber}' already exists in rack '${rackId}'`);
  }

  const id = `lvl-${randomUUID()}`;
  const doc = await LevelModel.create({
    id,
    rackId,
    chamberId: rack.chamberId,
    facilityId: rack.facilityId,
    code,
    levelNumber: input.levelNumber,
    isActive: input.isActive ?? true,
  });

  return {
    id: doc.id,
    rackId: doc.rackId,
    code: doc.code,
    levelNumber: doc.levelNumber,
    isActive: doc.isActive,
  };
}

export async function listLevels(rackId: string): Promise<Level[]> {
  const docs = await LevelModel.find({ rackId }).sort({ levelNumber: 1 }).lean().exec();
  return docs.map((d) => ({
    id: d.id,
    rackId: d.rackId,
    code: d.code,
    levelNumber: d.levelNumber,
    isActive: d.isActive,
  }));
}

export async function getLevelById(id: string): Promise<Level | null> {
  const doc = await LevelModel.findOne({ id }).lean().exec();
  if (!doc) return null;
  return {
    id: doc.id,
    rackId: doc.rackId,
    code: doc.code,
    levelNumber: doc.levelNumber,
    isActive: doc.isActive,
  };
}

export async function updateLevel(id: string, input: UpdateLevelInput): Promise<Level | null> {
  const existing = await LevelModel.findOne({ id }).exec();
  if (!existing) return null;

  if (input.code && input.code.trim() !== existing.code) {
    const code = input.code.trim();
    const duplicate = await LevelModel.findOne({
      rackId: existing.rackId,
      code,
      id: { $ne: id },
    })
      .lean()
      .exec();
    if (duplicate) {
      throw new Error(`Level code '${code}' already exists in rack '${existing.rackId}'`);
    }
    existing.code = code;
  }

  if (input.levelNumber !== undefined && input.levelNumber !== existing.levelNumber) {
    const duplicate = await LevelModel.findOne({
      rackId: existing.rackId,
      levelNumber: input.levelNumber,
      id: { $ne: id },
    })
      .lean()
      .exec();
    if (duplicate) {
      throw new Error(
        `Level number '${input.levelNumber}' already exists in rack '${existing.rackId}'`,
      );
    }
    existing.levelNumber = input.levelNumber;
  }

  if (input.isActive !== undefined && input.isActive !== existing.isActive) {
    if (!input.isActive) {
      const activePositions = await PositionModel.countDocuments({
        levelId: id,
        isActive: true,
      }).exec();
      if (activePositions > 0) {
        throw new Error('Cannot deactivate level while it contains active positions');
      }
    } else {
      const rack = await RackModel.findOne({ id: existing.rackId }).lean().exec();
      if (!rack || !rack.isActive) {
        throw new Error(`Cannot activate level because parent rack is inactive`);
      }
    }
    existing.isActive = input.isActive;
  }

  await existing.save();
  return {
    id: existing.id,
    rackId: existing.rackId,
    code: existing.code,
    levelNumber: existing.levelNumber,
    isActive: existing.isActive,
  };
}
