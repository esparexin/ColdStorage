import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import {
  type CreatePutAwayInput,
  type FacilityInventorySummary,
  type GrnInventorySummary,
  type InventoryTransaction,
  type PositionOccupancy,
  type PutAwayAllocation,
  type PutAwayItem,
  type PutAwayStatus,
  type StockLedgerQuery,
} from '@cold-storage/contracts';
import { ChamberModel } from '../../database/models/chamber.model.js';
import { CommodityModel } from '../../database/models/commodity.model.js';
import { GrnModel } from '../../database/models/grn.model.js';
import {
  InventoryTransactionModel,
  type InventoryTransactionDoc,
} from '../../database/models/inventory-transaction.model.js';
import { LevelModel } from '../../database/models/level.model.js';
import { PositionModel } from '../../database/models/position.model.js';
import {
  PutAwayAllocationModel,
  type PutAwayAllocationDoc,
} from '../../database/models/put-away.model.js';
import { RackModel } from '../../database/models/rack.model.js';
import { auditService } from '../audit/audit.service.js';

export class ConcurrencyConflictError extends Error {
  public readonly statusCode = 409;
  public readonly code = 'CONCURRENCY_CONFLICT';

  constructor(
    message = 'Concurrent allocation conflict on storage position or GRN. Please retry.',
  ) {
    super(message);
    this.name = 'ConcurrencyConflictError';
  }
}

export class InventoryService {
  /**
   * Executes put-away allocation within a MongoDB multi-document session transaction
   * with deterministic write-locking and transient write conflict retries.
   */
  public async createPutAway(
    facilityId: string,
    grnId: string,
    input: CreatePutAwayInput,
    userId: string,
  ): Promise<{ putAway: PutAwayAllocation; summary: GrnInventorySummary }> {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      attempt++;
      try {
        return await this.executePutAwayTransaction(facilityId, grnId, input, userId);
      } catch (err: unknown) {
        if (this.isTransientError(err) && attempt < maxRetries) {
          const delayMs = 50 * Math.pow(2, attempt) + Math.floor(Math.random() * 25);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }

        if (this.isTransientError(err)) {
          throw new ConcurrencyConflictError();
        }

        throw err;
      }
    }

    throw new ConcurrencyConflictError();
  }

  private isTransientError(err: unknown): boolean {
    if (!err || typeof err !== 'object') {
      return false;
    }
    const mongoErr = err as {
      code?: number;
      hasErrorLabel?: (label: string) => boolean;
      message?: string;
    };
    if (
      typeof mongoErr.hasErrorLabel === 'function' &&
      mongoErr.hasErrorLabel('TransientTransactionError')
    ) {
      return true;
    }
    if (mongoErr.code === 112 || mongoErr.code === 251) {
      return true;
    }
    if (typeof mongoErr.message === 'string' && mongoErr.message.includes('WriteConflict')) {
      return true;
    }
    return false;
  }

  private async executePutAwayTransaction(
    facilityId: string,
    grnId: string,
    input: CreatePutAwayInput,
    userId: string,
  ): Promise<{ putAway: PutAwayAllocation; summary: GrnInventorySummary }> {
    const session = await mongoose.startSession();
    let createdPutAwayDoc: PutAwayAllocationDoc;

    try {
      await session.withTransaction(async () => {
        // 1. Explicit write-lock on GRN document
        const grn = await GrnModel.findOneAndUpdate(
          { id: grnId, facilityId },
          { $set: { updatedAt: new Date() } },
          { session, new: true },
        )
          .lean()
          .exec();

        if (!grn) {
          throw new Error(`GRN '${grnId}' not found in facility '${facilityId}'`);
        }
        if (grn.status !== 'OPEN') {
          throw new Error(`GRN '${grn.grnNumber}' is not OPEN (status: ${grn.status})`);
        }

        // 2. Sort target positions deterministically by ID to prevent circular deadlocks
        const sortedItems = [...input.items].sort((a, b) =>
          a.positionId.localeCompare(b.positionId),
        );

        // 3. Acquire sequential write-locks on target Position documents in lexicographical order
        const lockedPositions = new Map<
          string,
          { code: string; capacityBags: number; chamberId: string }
        >();

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
          if (pos.chamberId !== grn.chamberId) {
            throw new Error(
              `Position '${pos.code}' belongs to chamber '${pos.chamberId}', but GRN belongs to chamber '${grn.chamberId}'`,
            );
          }

          // Verify hierarchy active status: Level, Rack, Chamber
          const [level, rack, chamber] = await Promise.all([
            LevelModel.findOne({ id: pos.levelId, isActive: true }, null, { session })
              .lean()
              .exec(),
            RackModel.findOne({ id: pos.rackId, isActive: true }, null, { session }).lean().exec(),
            ChamberModel.findOne({ id: pos.chamberId, isActive: true }, null, { session })
              .lean()
              .exec(),
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

          lockedPositions.set(item.positionId, {
            code: pos.code,
            capacityBags: pos.capacityBags,
            chamberId: pos.chamberId,
          });
        }

        // 4. Authoritative Ledger Aggregations inside transaction
        // 4a. Check GRN remaining unallocated bags
        const grnAllocatedAgg = await InventoryTransactionModel.aggregate([
          { $match: { grnId, facilityId } },
          { $group: { _id: null, total: { $sum: '$quantity' } } },
        ]).session(session);

        const currentGrnAllocated = grnAllocatedAgg[0]?.total ?? 0;
        const remainingGrnUnallocated = grn.bags - currentGrnAllocated;
        const totalRequestedBags = input.items.reduce((sum, item) => sum + item.bags, 0);

        if (totalRequestedBags > remainingGrnUnallocated) {
          throw new Error(
            `Requested ${totalRequestedBags} bags exceeds unallocated GRN balance of ${remainingGrnUnallocated} bags (received: ${grn.bags}, allocated: ${currentGrnAllocated})`,
          );
        }

        // 4b. Check each target position's available capacity
        for (const item of input.items) {
          const posMeta = lockedPositions.get(item.positionId)!;
          const posOccupancyAgg = await InventoryTransactionModel.aggregate([
            { $match: { positionId: item.positionId, facilityId } },
            {
              $group: {
                _id: null,
                total: {
                  $sum: {
                    $cond: [
                      { $eq: ['$transactionType', 'OUTWARD_DELIVERY'] },
                      { $multiply: ['$quantity', -1] },
                      '$quantity',
                    ],
                  },
                },
              },
            },
          ]).session(session);

          const currentOccupancy = posOccupancyAgg[0]?.total ?? 0;
          const availableCapacity = posMeta.capacityBags - currentOccupancy;

          if (item.bags > availableCapacity) {
            throw new Error(
              `Requested ${item.bags} bags exceeds available capacity of ${availableCapacity} bags for position '${posMeta.code}' (capacity: ${posMeta.capacityBags}, occupied: ${currentOccupancy})`,
            );
          }
        }

        // 5. Commit batch allocation record and immutable ledger entries
        const putAwayId = `pa-${randomUUID()}`;
        const allocatedAt = new Date();

        const putAwayItems: PutAwayItem[] = input.items.map((item) => ({
          positionId: item.positionId,
          positionCode: lockedPositions.get(item.positionId)!.code,
          bags: item.bags,
        }));

        const putAwayDocs = await PutAwayAllocationModel.create(
          [
            {
              id: putAwayId,
              facilityId,
              grnId: grn.id,
              grnNumber: grn.grnNumber,
              chamberId: grn.chamberId,
              items: putAwayItems,
              totalBags: totalRequestedBags,
              notes: input.notes?.trim() || null,
              allocatedBy: userId,
              allocatedAt,
            },
          ],
          { session, ordered: true },
        );

        createdPutAwayDoc = putAwayDocs[0];

        // Retrieve level and rack mappings for the positions to enrich ledger records
        const positionDocs = await PositionModel.find(
          { id: { $in: input.items.map((i) => i.positionId) } },
          null,
          { session },
        )
          .lean()
          .exec();

        const positionMap = new Map(positionDocs.map((p) => [p.id, p]));

        const ledgerDocsToCreate = input.items.map((item) => {
          const pos = positionMap.get(item.positionId)!;
          return {
            id: `tx-${randomUUID()}`,
            facilityId,
            grnId: grn.id,
            grnNumber: grn.grnNumber,
            chamberId: grn.chamberId,
            rackId: pos.rackId,
            levelId: pos.levelId,
            positionId: pos.id,
            positionCode: pos.code,
            customerId: grn.customerId,
            commodityId: grn.commodityId,
            bagType: grn.bagType,
            transactionType: 'INWARD_PUTAWAY' as const,
            quantity: item.bags,
            referenceType: 'PUT_AWAY' as const,
            referenceId: putAwayId,
            notes: input.notes?.trim() || null,
            createdBy: userId,
            createdAt: allocatedAt,
          };
        });

        await InventoryTransactionModel.create(ledgerDocsToCreate, { session, ordered: true });
      });
    } finally {
      await session.endSession();
    }

    const putAway = this.toPutAwayEntity(createdPutAwayDoc!);
    const summary = await this.getGrnInventorySummary(facilityId, grnId);

    await auditService.log({
      eventType: 'INVENTORY_PUTAWAY',
      severity: 'INFO',
      userId,
      facilityId,
      resource: 'inventory',
      resourceId: putAway.id,
      details: {
        grnId,
        itemsCount: input.items.length,
        totalBags: input.items.reduce((acc, curr) => acc + curr.bags, 0),
      },
    });

    return { putAway, summary };
  }

  public async listPutAwayAllocations(
    facilityId: string,
    grnId: string,
  ): Promise<PutAwayAllocation[]> {
    const docs = await PutAwayAllocationModel.find({ facilityId, grnId })
      .sort({ allocatedAt: -1 })
      .lean()
      .exec();
    return docs.map((d) => this.toPutAwayEntity(d));
  }

  public async getGrnInventorySummary(
    facilityId: string,
    grnId: string,
  ): Promise<GrnInventorySummary> {
    const grn = await GrnModel.findOne({ id: grnId, facilityId }).lean().exec();
    if (!grn) {
      throw new Error(`GRN '${grnId}' not found in facility '${facilityId}'`);
    }

    // SSOT: Aggregate exclusively from InventoryTransactionModel
    const positionAgg = await InventoryTransactionModel.aggregate([
      { $match: { grnId, facilityId } },
      {
        $group: {
          _id: { positionId: '$positionId', positionCode: '$positionCode' },
          bags: { $sum: '$quantity' },
        },
      },
    ]);

    const positions = positionAgg.map((p) => ({
      positionId: p._id.positionId,
      positionCode: p._id.positionCode,
      bags: p.bags,
    }));

    const allocatedBags = positions.reduce((sum, p) => sum + p.bags, 0);
    const unallocatedBags = Math.max(0, grn.bags - allocatedBags);

    let putAwayStatus: PutAwayStatus = 'UNALLOCATED';
    if (allocatedBags >= grn.bags) {
      putAwayStatus = 'FULLY_ALLOCATED';
    } else if (allocatedBags > 0) {
      putAwayStatus = 'PARTIALLY_ALLOCATED';
    }

    return {
      grnId: grn.id,
      facilityId: grn.facilityId,
      grnNumber: grn.grnNumber,
      chamberId: grn.chamberId,
      chamberNumber: grn.chamberNumber,
      totalBags: grn.bags,
      allocatedBags,
      unallocatedBags,
      putAwayStatus,
      positions,
    };
  }

  public async getPositionOccupancy(
    facilityId: string,
    positionId: string,
  ): Promise<PositionOccupancy> {
    const position = await PositionModel.findOne({ id: positionId, facilityId }).lean().exec();
    if (!position) {
      throw new Error(`Position '${positionId}' not found in facility '${facilityId}'`);
    }

    // SSOT: Aggregate exclusively from InventoryTransactionModel
    const lotsAgg = await InventoryTransactionModel.aggregate([
      { $match: { positionId, facilityId } },
      {
        $group: {
          _id: {
            grnId: '$grnId',
            grnNumber: '$grnNumber',
            customerId: '$customerId',
            commodityId: '$commodityId',
            bagType: '$bagType',
          },
          bags: {
            $sum: {
              $cond: [
                { $eq: ['$transactionType', 'OUTWARD_DELIVERY'] },
                { $multiply: ['$quantity', -1] },
                '$quantity',
              ],
            },
          },
        },
      },
    ]);

    const storedLots = lotsAgg
      .filter((lot) => lot.bags > 0)
      .map((lot) => ({
        grnId: lot._id.grnId,
        grnNumber: lot._id.grnNumber,
        customerId: lot._id.customerId,
        commodityId: lot._id.commodityId,
        bagType: lot._id.bagType,
        bags: lot.bags,
      }));

    const occupiedBags = storedLots.reduce((sum, lot) => sum + lot.bags, 0);
    const availableBags = Math.max(0, position.capacityBags - occupiedBags);
    const utilizationRate =
      position.capacityBags > 0
        ? Math.round(((occupiedBags / position.capacityBags) * 100 + Number.EPSILON) * 100) / 100
        : 0;

    return {
      positionId: position.id,
      facilityId: position.facilityId,
      chamberId: position.chamberId,
      rackId: position.rackId,
      levelId: position.levelId,
      code: position.code,
      capacityBags: position.capacityBags,
      occupiedBags,
      availableBags,
      utilizationRate,
      storedLots,
    };
  }

  public async getFacilityInventorySummary(facilityId: string): Promise<FacilityInventorySummary> {
    // 1. Group by Commodity
    const commodityAgg = await InventoryTransactionModel.aggregate([
      { $match: { facilityId } },
      {
        $group: {
          _id: '$commodityId',
          totalBags: {
            $sum: {
              $cond: [
                { $eq: ['$transactionType', 'OUTWARD_DELIVERY'] },
                { $multiply: ['$quantity', -1] },
                '$quantity',
              ],
            },
          },
        },
      },
    ]);

    const commodityIds = commodityAgg.map((c) => c._id);
    const commodities = await CommodityModel.find({ id: { $in: commodityIds } })
      .lean()
      .exec();
    const commodityMap = new Map(commodities.map((c) => [c.id, c.name]));

    const byCommodity = commodityAgg.map((c) => ({
      commodityId: c._id,
      commodityName: commodityMap.get(c._id) ?? 'Unknown',
      totalBags: c.totalBags,
    }));

    // 2. Group by Chamber
    const chamberAgg = await InventoryTransactionModel.aggregate([
      { $match: { facilityId } },
      {
        $group: {
          _id: '$chamberId',
          totalBags: {
            $sum: {
              $cond: [
                { $eq: ['$transactionType', 'OUTWARD_DELIVERY'] },
                { $multiply: ['$quantity', -1] },
                '$quantity',
              ],
            },
          },
        },
      },
    ]);

    const chamberIds = chamberAgg.map((c) => c._id);
    const chambers = await ChamberModel.find({ id: { $in: chamberIds } })
      .lean()
      .exec();
    const chamberMap = new Map(chambers.map((c) => [c.id, c.chamberNumber]));

    const byChamber = chamberAgg.map((c) => ({
      chamberId: c._id,
      chamberNumber: chamberMap.get(c._id) ?? 'Unknown',
      totalBags: c.totalBags,
    }));

    const totalStockBags = byCommodity.reduce((sum, c) => sum + c.totalBags, 0);

    return {
      facilityId,
      totalStockBags,
      byCommodity,
      byChamber,
    };
  }

  public async queryStockLedger(
    facilityId: string,
    query: StockLedgerQuery,
  ): Promise<{ items: InventoryTransaction[]; total: number; page: number; limit: number }> {
    const filter: Record<string, unknown> = { facilityId };
    if (query.grnId) filter.grnId = query.grnId;
    if (query.positionId) filter.positionId = query.positionId;
    if (query.chamberId) filter.chamberId = query.chamberId;
    if (query.commodityId) filter.commodityId = query.commodityId;
    if (query.customerId) filter.customerId = query.customerId;

    const skip = (query.page - 1) * query.limit;

    const [docs, total] = await Promise.all([
      InventoryTransactionModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(query.limit)
        .lean()
        .exec(),
      InventoryTransactionModel.countDocuments(filter).exec(),
    ]);

    return {
      items: docs.map((d) => this.toLedgerEntity(d)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  public async resolveFacilityIdForGrn(grnId: string): Promise<string | null> {
    const grn = await GrnModel.findOne({ id: grnId }).select('facilityId').lean().exec();
    return grn?.facilityId ?? null;
  }

  public async resolveFacilityIdForPosition(positionId: string): Promise<string | null> {
    const pos = await PositionModel.findOne({ id: positionId }).select('facilityId').lean().exec();
    return pos?.facilityId ?? null;
  }

  private toPutAwayEntity(
    doc: PutAwayAllocationDoc | (Record<string, unknown> & { id: string }),
  ): PutAwayAllocation {
    const d = doc as Record<string, unknown>;
    return {
      id: String(d.id),
      facilityId: String(d.facilityId),
      grnId: String(d.grnId),
      grnNumber: String(d.grnNumber),
      chamberId: String(d.chamberId),
      items: (d.items as PutAwayItem[]) ?? [],
      totalBags: Number(d.totalBags),
      notes: d.notes ? String(d.notes) : null,
      allocatedBy: String(d.allocatedBy),
      allocatedAt: d.allocatedAt instanceof Date ? d.allocatedAt : new Date(String(d.allocatedAt)),
    };
  }

  private toLedgerEntity(
    doc: InventoryTransactionDoc | (Record<string, unknown> & { id: string }),
  ): InventoryTransaction {
    const d = doc as Record<string, unknown>;
    return {
      id: String(d.id),
      facilityId: String(d.facilityId),
      grnId: String(d.grnId),
      grnNumber: String(d.grnNumber),
      chamberId: String(d.chamberId),
      rackId: String(d.rackId),
      levelId: String(d.levelId),
      positionId: String(d.positionId),
      positionCode: String(d.positionCode),
      customerId: String(d.customerId),
      commodityId: String(d.commodityId),
      bagType: d.bagType as InventoryTransaction['bagType'],
      transactionType: 'INWARD_PUTAWAY',
      quantity: Number(d.quantity),
      referenceType: 'PUT_AWAY',
      referenceId: String(d.referenceId),
      notes: d.notes ? String(d.notes) : null,
      createdBy: String(d.createdBy),
      createdAt: d.createdAt instanceof Date ? d.createdAt : new Date(String(d.createdAt)),
    };
  }
}

export const inventoryService = new InventoryService();
