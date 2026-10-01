import { randomUUID } from 'node:crypto';
import type {
  Chamber,
  CreateChamberInput,
  CreateLevelInput,
  CreatePositionInput,
  CreateRackInput,
  Level,
  Position,
  Rack,
  UpdateChamberInput,
  UpdateLevelInput,
  UpdatePositionInput,
  UpdateRackInput,
} from '@cold-storage/contracts';
import { ChamberModel } from '../../database/models/chamber.model.js';
import { FacilityModel } from '../../database/models/facility.model.js';
import { LevelModel } from '../../database/models/level.model.js';
import { PositionModel } from '../../database/models/position.model.js';
import { RackModel } from '../../database/models/rack.model.js';

export class HierarchyService {
  // ==================== CHAMBER ====================
  public async createChamber(facilityId: string, input: CreateChamberInput): Promise<Chamber> {
    const facility = await FacilityModel.findOne({ id: facilityId }).lean().exec();
    if (!facility) {
      throw new Error(`Parent facility '${facilityId}' not found`);
    }
    if (!facility.isActive) {
      throw new Error(`Cannot create chamber under inactive facility '${facilityId}'`);
    }

    const chamberNumber = input.chamberNumber.trim();
    const existing = await ChamberModel.findOne({ facilityId, chamberNumber }).lean().exec();
    if (existing) {
      throw new Error(`Chamber number '${chamberNumber}' already exists in facility '${facilityId}'`);
    }

    const id = `ch-${randomUUID()}`;
    const doc = await ChamberModel.create({
      id,
      facilityId,
      chamberNumber,
      name: input.name?.trim() || null,
      isActive: input.isActive ?? true,
    });

    return {
      id: doc.id,
      facilityId: doc.facilityId,
      chamberNumber: doc.chamberNumber,
      name: doc.name || undefined,
      isActive: doc.isActive,
    };
  }

  public async listChambers(facilityId: string): Promise<Chamber[]> {
    const docs = await ChamberModel.find({ facilityId }).sort({ chamberNumber: 1 }).lean().exec();
    return docs.map((d) => ({
      id: d.id,
      facilityId: d.facilityId,
      chamberNumber: d.chamberNumber,
      name: d.name || undefined,
      isActive: d.isActive,
    }));
  }

  public async getChamberById(id: string): Promise<Chamber | null> {
    const doc = await ChamberModel.findOne({ id }).lean().exec();
    if (!doc) return null;
    return {
      id: doc.id,
      facilityId: doc.facilityId,
      chamberNumber: doc.chamberNumber,
      name: doc.name || undefined,
      isActive: doc.isActive,
    };
  }

  public async updateChamber(id: string, input: UpdateChamberInput): Promise<Chamber | null> {
    const existing = await ChamberModel.findOne({ id }).exec();
    if (!existing) return null;

    if (input.chamberNumber && input.chamberNumber.trim() !== existing.chamberNumber) {
      const chamberNumber = input.chamberNumber.trim();
      const duplicate = await ChamberModel.findOne({
        facilityId: existing.facilityId,
        chamberNumber,
        id: { $ne: id },
      })
        .lean()
        .exec();
      if (duplicate) {
        throw new Error(`Chamber number '${chamberNumber}' already exists in facility '${existing.facilityId}'`);
      }
      existing.chamberNumber = chamberNumber;
    }

    if (input.name !== undefined) {
      existing.name = input.name?.trim() || null;
    }

    if (input.isActive !== undefined && input.isActive !== existing.isActive) {
      if (!input.isActive) {
        const activeRacks = await RackModel.countDocuments({ chamberId: id, isActive: true }).exec();
        if (activeRacks > 0) {
          throw new Error('Cannot deactivate chamber while it contains active racks');
        }
      } else {
        const facility = await FacilityModel.findOne({ id: existing.facilityId }).lean().exec();
        if (!facility || !facility.isActive) {
          throw new Error(`Cannot activate chamber because parent facility is inactive`);
        }
      }
      existing.isActive = input.isActive;
    }

    await existing.save();
    return {
      id: existing.id,
      facilityId: existing.facilityId,
      chamberNumber: existing.chamberNumber,
      name: existing.name || undefined,
      isActive: existing.isActive,
    };
  }

  // ==================== RACK ====================
  public async createRack(chamberId: string, input: CreateRackInput): Promise<Rack> {
    const chamber = await ChamberModel.findOne({ id: chamberId }).lean().exec();
    if (!chamber) {
      throw new Error(`Parent chamber '${chamberId}' not found`);
    }
    if (!chamber.isActive) {
      throw new Error(`Cannot create rack under inactive chamber '${chamberId}'`);
    }

    const code = input.code.trim();
    const existing = await RackModel.findOne({ chamberId, code }).lean().exec();
    if (existing) {
      throw new Error(`Rack code '${code}' already exists in chamber '${chamberId}'`);
    }

    const id = `rk-${randomUUID()}`;
    const doc = await RackModel.create({
      id,
      chamberId,
      facilityId: chamber.facilityId,
      code,
      isActive: input.isActive ?? true,
    });

    return {
      id: doc.id,
      chamberId: doc.chamberId,
      code: doc.code,
      isActive: doc.isActive,
    };
  }

  public async listRacks(chamberId: string): Promise<Rack[]> {
    const docs = await RackModel.find({ chamberId }).sort({ code: 1 }).lean().exec();
    return docs.map((d) => ({
      id: d.id,
      chamberId: d.chamberId,
      code: d.code,
      isActive: d.isActive,
    }));
  }

  public async getRackById(id: string): Promise<Rack | null> {
    const doc = await RackModel.findOne({ id }).lean().exec();
    if (!doc) return null;
    return {
      id: doc.id,
      chamberId: doc.chamberId,
      code: doc.code,
      isActive: doc.isActive,
    };
  }

  public async updateRack(id: string, input: UpdateRackInput): Promise<Rack | null> {
    const existing = await RackModel.findOne({ id }).exec();
    if (!existing) return null;

    if (input.code && input.code.trim() !== existing.code) {
      const code = input.code.trim();
      const duplicate = await RackModel.findOne({
        chamberId: existing.chamberId,
        code,
        id: { $ne: id },
      })
        .lean()
        .exec();
      if (duplicate) {
        throw new Error(`Rack code '${code}' already exists in chamber '${existing.chamberId}'`);
      }
      existing.code = code;
    }

    if (input.isActive !== undefined && input.isActive !== existing.isActive) {
      if (!input.isActive) {
        const activeLevels = await LevelModel.countDocuments({ rackId: id, isActive: true }).exec();
        if (activeLevels > 0) {
          throw new Error('Cannot deactivate rack while it contains active levels');
        }
      } else {
        const chamber = await ChamberModel.findOne({ id: existing.chamberId }).lean().exec();
        if (!chamber || !chamber.isActive) {
          throw new Error(`Cannot activate rack because parent chamber is inactive`);
        }
      }
      existing.isActive = input.isActive;
    }

    await existing.save();
    return {
      id: existing.id,
      chamberId: existing.chamberId,
      code: existing.code,
      isActive: existing.isActive,
    };
  }

  // ==================== LEVEL ====================
  public async createLevel(rackId: string, input: CreateLevelInput): Promise<Level> {
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

    const existingNumber = await LevelModel.findOne({ rackId, levelNumber: input.levelNumber }).lean().exec();
    if (existingNumber) {
      throw new Error(`Level number '${input.levelNumber}' already exists in rack '${rackId}'`);
    }

    const id = `lvl-${randomUUID()}`;
    const doc = await LevelModel.create({
      id,
      rackId,
      chamberId: rack.chamberId,
      facilityId: rack.facilityId,
      levelNumber: input.levelNumber,
      code,
      isActive: input.isActive ?? true,
    });

    return {
      id: doc.id,
      rackId: doc.rackId,
      levelNumber: doc.levelNumber,
      code: doc.code,
      isActive: doc.isActive,
    };
  }

  public async listLevels(rackId: string): Promise<Level[]> {
    const docs = await LevelModel.find({ rackId }).sort({ levelNumber: 1 }).lean().exec();
    return docs.map((d) => ({
      id: d.id,
      rackId: d.rackId,
      levelNumber: d.levelNumber,
      code: d.code,
      isActive: d.isActive,
    }));
  }

  public async getLevelById(id: string): Promise<Level | null> {
    const doc = await LevelModel.findOne({ id }).lean().exec();
    if (!doc) return null;
    return {
      id: doc.id,
      rackId: doc.rackId,
      levelNumber: doc.levelNumber,
      code: doc.code,
      isActive: doc.isActive,
    };
  }

  public async updateLevel(id: string, input: UpdateLevelInput): Promise<Level | null> {
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
        throw new Error(`Level number '${input.levelNumber}' already exists in rack '${existing.rackId}'`);
      }
      existing.levelNumber = input.levelNumber;
    }

    if (input.isActive !== undefined && input.isActive !== existing.isActive) {
      if (!input.isActive) {
        const activePositions = await PositionModel.countDocuments({ levelId: id, isActive: true }).exec();
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
      levelNumber: existing.levelNumber,
      code: existing.code,
      isActive: existing.isActive,
    };
  }

  // ==================== POSITION ====================
  public async createPosition(levelId: string, input: CreatePositionInput): Promise<Position> {
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

  public async listPositions(levelId: string): Promise<Position[]> {
    const docs = await PositionModel.find({ levelId }).sort({ code: 1 }).lean().exec();
    return docs.map((d) => ({
      id: d.id,
      levelId: d.levelId,
      code: d.code,
      capacityBags: d.capacityBags,
      isActive: d.isActive,
    }));
  }

  public async getPositionById(id: string): Promise<Position | null> {
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

  public async updatePosition(id: string, input: UpdatePositionInput): Promise<Position | null> {
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

    if (input.capacityBags !== undefined) {
      existing.capacityBags = input.capacityBags;
    }

    if (input.isActive !== undefined && input.isActive !== existing.isActive) {
      if (input.isActive) {
        const level = await LevelModel.findOne({ id: existing.levelId }).lean().exec();
        if (!level || !level.isActive) {
          throw new Error(`Cannot activate position because parent level is inactive`);
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

  // ==================== FACILITY ROOT RESOLUTION (FOR SCOPE-BYPASS PROTECTION) ====================
  public async resolveFacilityIdForChamber(chamberId: string): Promise<string | null> {
    const chamber = await ChamberModel.findOne({ id: chamberId }).select('facilityId').lean().exec();
    return chamber?.facilityId || null;
  }

  public async resolveFacilityIdForRack(rackId: string): Promise<string | null> {
    const rack = await RackModel.findOne({ id: rackId }).select('facilityId').lean().exec();
    return rack?.facilityId || null;
  }

  public async resolveFacilityIdForLevel(levelId: string): Promise<string | null> {
    const level = await LevelModel.findOne({ id: levelId }).select('facilityId').lean().exec();
    return level?.facilityId || null;
  }

  public async resolveFacilityIdForPosition(positionId: string): Promise<string | null> {
    const pos = await PositionModel.findOne({ id: positionId }).select('facilityId').lean().exec();
    return pos?.facilityId || null;
  }
}

export const hierarchyService = new HierarchyService();
