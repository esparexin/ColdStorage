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
import { LevelModel } from '../../database/models/level.model.js';
import { PositionModel } from '../../database/models/position.model.js';
import { RackModel } from '../../database/models/rack.model.js';
import {
  createChamber,
  createRack,
  getChamberById,
  getRackById,
  listChambers,
  listRacks,
  updateChamber,
  updateRack,
} from './handlers/chamber-rack.handler.js';
import {
  createLevel,
  getLevelById,
  listLevels,
  updateLevel,
} from './handlers/level.handler.js';
import {
  createPosition,
  getPositionById,
  listPositions,
  updatePosition,
} from './handlers/position.handler.js';

export class HierarchyService {
  // ==================== CHAMBER ====================
  public async createChamber(facilityId: string, input: CreateChamberInput): Promise<Chamber> {
    return createChamber(facilityId, input);
  }

  public async listChambers(facilityId: string): Promise<Chamber[]> {
    return listChambers(facilityId);
  }

  public async getChamberById(id: string): Promise<Chamber | null> {
    return getChamberById(id);
  }

  public async updateChamber(id: string, input: UpdateChamberInput): Promise<Chamber | null> {
    return updateChamber(id, input);
  }

  // ==================== RACK ====================
  public async createRack(chamberId: string, input: CreateRackInput): Promise<Rack> {
    return createRack(chamberId, input);
  }

  public async listRacks(chamberId: string): Promise<Rack[]> {
    return listRacks(chamberId);
  }

  public async getRackById(id: string): Promise<Rack | null> {
    return getRackById(id);
  }

  public async updateRack(id: string, input: UpdateRackInput): Promise<Rack | null> {
    return updateRack(id, input);
  }

  // ==================== LEVEL ====================
  public async createLevel(rackId: string, input: CreateLevelInput): Promise<Level> {
    return createLevel(rackId, input);
  }

  public async listLevels(rackId: string): Promise<Level[]> {
    return listLevels(rackId);
  }

  public async getLevelById(id: string): Promise<Level | null> {
    return getLevelById(id);
  }

  public async updateLevel(id: string, input: UpdateLevelInput): Promise<Level | null> {
    return updateLevel(id, input);
  }

  // ==================== POSITION ====================
  public async createPosition(levelId: string, input: CreatePositionInput): Promise<Position> {
    return createPosition(levelId, input);
  }

  public async listPositions(levelId: string): Promise<Position[]> {
    return listPositions(levelId);
  }

  public async getPositionById(id: string): Promise<Position | null> {
    return getPositionById(id);
  }

  public async updatePosition(id: string, input: UpdatePositionInput): Promise<Position | null> {
    return updatePosition(id, input);
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
