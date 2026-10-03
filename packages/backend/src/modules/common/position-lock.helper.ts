import type mongoose from 'mongoose';
import { ChamberModel } from '../../database/models/chamber.model.js';
import { LevelModel } from '../../database/models/level.model.js';
import { PositionModel } from '../../database/models/position.model.js';
import { RackModel } from '../../database/models/rack.model.js';

export interface LockedPositionMeta {
  code: string;
  capacityBags: number;
  chamberId: string;
}

export interface LockPositionsOptions {
  /**
   * When true, also requires the position's parent Level, Rack and Chamber to exist and be
   * active. Put-away additionally verifies the full ancestry because it writes stock into
   * the hierarchy; delivery withdrawal only needs the position itself to be valid.
   */
  verifyActiveParents?: boolean;
}

/**
 * Canonical transactional position lock (P5/P6).
 *
 * Positions are locked by writing `updatedAt` inside the caller's transaction session, and
 * they are always locked in ascending `positionId` order so that concurrent delivery,
 * reversal and put-away transactions acquire row locks in a single deterministic sequence
 * and cannot deadlock against each other.
 *
 * `chamberId` is optional: pass it when the owning GRN's chamber is known and ownership
 * must be enforced, or omit it (delivery reversal) when only the position itself is
 * authoritative for the operation.
 */
export async function lockPositionsForUpdate(
  facilityId: string,
  chamberId: string | undefined,
  items: Array<{ positionId: string; bags: number }>,
  session: mongoose.ClientSession,
  options: LockPositionsOptions = {},
): Promise<Map<string, LockedPositionMeta>> {
  const sortedItems = [...items].sort((a, b) => a.positionId.localeCompare(b.positionId));
  const lockedPositions = new Map<string, LockedPositionMeta>();

  for (const item of sortedItems) {
    const pos = await PositionModel.findOneAndUpdate(
      { id: item.positionId, facilityId },
      { $set: { updatedAt: new Date() } },
      { session, new: true },
    )
      .lean()
      .exec();

    if (!pos) {
      throw new Error(`Position '${item.positionId}' not found in facility '${facilityId}'`);
    }
    if (!pos.isActive) {
      throw new Error(`Position '${pos.code}' is inactive`);
    }
    if (chamberId !== undefined && pos.chamberId !== chamberId) {
      throw new Error(
        `Position '${pos.code}' belongs to chamber '${pos.chamberId}', but GRN belongs to chamber '${chamberId}'`,
      );
    }

    if (options.verifyActiveParents) {
      const [level, rack, chamber] = await Promise.all([
        LevelModel.findOne({ id: pos.levelId, isActive: true }, null, { session }).lean().exec(),
        RackModel.findOne({ id: pos.rackId, isActive: true }, null, { session }).lean().exec(),
        ChamberModel.findOne({ id: pos.chamberId, isActive: true }, null, { session }).lean().exec(),
      ]);

      if (!level) {
        throw new Error(`Parent Level for position '${pos.code}' is inactive or invalid`);
      }
      if (!rack) {
        throw new Error(`Parent Rack for position '${pos.code}' is inactive or invalid`);
      }
      if (!chamber) {
        throw new Error(`Parent Chamber for position '${pos.code}' is inactive or invalid`);
      }
    }

    lockedPositions.set(item.positionId, {
      code: pos.code,
      capacityBags: pos.capacityBags,
      chamberId: pos.chamberId,
    });
  }

  return lockedPositions;
}