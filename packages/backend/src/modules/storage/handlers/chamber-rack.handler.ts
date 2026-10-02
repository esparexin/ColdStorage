import { randomUUID } from 'node:crypto';
import type {
  Chamber,
  CreateChamberInput,
  CreateRackInput,
  Rack,
  UpdateChamberInput,
  UpdateRackInput,
} from '@cold-storage/contracts';
import { ChamberModel } from '../../../database/models/chamber.model.js';
import { FacilityModel } from '../../../database/models/facility.model.js';
import { LevelModel } from '../../../database/models/level.model.js';
import { RackModel } from '../../../database/models/rack.model.js';

export async function createChamber(
  facilityId: string,
  input: CreateChamberInput,
): Promise<Chamber> {
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

export async function listChambers(facilityId: string): Promise<Chamber[]> {
  const docs = await ChamberModel.find({ facilityId }).sort({ chamberNumber: 1 }).lean().exec();
  return docs.map((d) => ({
    id: d.id,
    facilityId: d.facilityId,
    chamberNumber: d.chamberNumber,
    name: d.name || undefined,
    isActive: d.isActive,
  }));
}

export async function getChamberById(id: string): Promise<Chamber | null> {
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

export async function updateChamber(
  id: string,
  input: UpdateChamberInput,
): Promise<Chamber | null> {
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
      throw new Error(
        `Chamber number '${chamberNumber}' already exists in facility '${existing.facilityId}'`,
      );
    }
    existing.chamberNumber = chamberNumber;
  }

  if (input.name !== undefined) {
    existing.name = input.name?.trim() || null;
  }

  if (input.isActive !== undefined && input.isActive !== existing.isActive) {
    if (!input.isActive) {
      const activeRacks = await RackModel.countDocuments({
        chamberId: id,
        isActive: true,
      }).exec();
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

export async function createRack(chamberId: string, input: CreateRackInput): Promise<Rack> {
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

export async function listRacks(chamberId: string): Promise<Rack[]> {
  const docs = await RackModel.find({ chamberId }).sort({ code: 1 }).lean().exec();
  return docs.map((d) => ({
    id: d.id,
    chamberId: d.chamberId,
    code: d.code,
    isActive: d.isActive,
  }));
}

export async function getRackById(id: string): Promise<Rack | null> {
  const doc = await RackModel.findOne({ id }).lean().exec();
  if (!doc) return null;
  return {
    id: doc.id,
    chamberId: doc.chamberId,
    code: doc.code,
    isActive: doc.isActive,
  };
}

export async function updateRack(id: string, input: UpdateRackInput): Promise<Rack | null> {
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
      const activeLevels = await LevelModel.countDocuments({
        rackId: id,
        isActive: true,
      }).exec();
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
