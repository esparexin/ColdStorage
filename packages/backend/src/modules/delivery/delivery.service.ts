import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import {
  getFinancialYearKey,
  type CreateDeliveryInput,
  type DeliveryChallan,
  type DeliveryQuery,
  type DeliveryReversal,
  type DeliverySummary,
  type ReverseDeliveryInput,
} from '@cold-storage/contracts';
import { ConcurrencyConflictError } from '../inventory/inventory.service.js';
import { counterService } from '../grn/counter.service.js';
import {
  DeliveryChallanModel,
  type DeliveryChallanDoc,
} from '../../database/models/delivery-challan.model.js';
import {
  DeliveryReversalModel,
  type DeliveryReversalDoc,
} from '../../database/models/delivery-reversal.model.js';
import { GrnModel } from '../../database/models/grn.model.js';
import { InventoryTransactionModel } from '../../database/models/inventory-transaction.model.js';
import { PositionModel } from '../../database/models/position.model.js';
import { auditService } from '../audit/audit.service.js';

export class DeliveryService {
  /**
   * Creates an outward delivery challan within a MongoDB session transaction
   * using the global deterministic lock order across P5 and P6:
   * GRN -> Position IDs (sorted) -> Authoritative Ledger Reads -> Writes.
   */
  public async createDelivery(
    facilityId: string,
    input: CreateDeliveryInput,
    userId: string,
  ): Promise<{ delivery: DeliveryChallan; summary: DeliverySummary }> {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      attempt++;
      try {
        return await this.executeDeliveryTransaction(facilityId, input, userId);
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

  /**
   * Executes full reversal of an issued delivery challan within a MongoDB session transaction
   * using the global deterministic lock order:
   * GRN -> Position IDs (sorted) -> DeliveryChallan -> Authoritative Ledger Reads -> Writes.
   */
  public async reverseDelivery(
    facilityId: string,
    deliveryId: string,
    input: ReverseDeliveryInput,
    userId: string,
  ): Promise<{ reversal: DeliveryReversal; challan: DeliveryChallan; summary: DeliverySummary }> {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      attempt++;
      try {
        return await this.executeReversalTransaction(facilityId, deliveryId, input, userId);
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

  private async executeDeliveryTransaction(
    facilityId: string,
    input: CreateDeliveryInput,
    userId: string,
  ): Promise<{ delivery: DeliveryChallan; summary: DeliverySummary }> {
    const session = await mongoose.startSession();
    let createdChallanDoc: DeliveryChallanDoc;

    try {
      await session.withTransaction(async () => {
        // 1. Lock GRN Document (First in global lock order)
        const grn = await GrnModel.findOneAndUpdate(
          { id: input.grnId, facilityId },
          { $set: { updatedAt: new Date() } },
          { session, new: true },
        )
          .lean()
          .exec();

        if (!grn) {
          throw new Error(`GRN '${input.grnId}' not found in facility '${facilityId}'`);
        }
        if (grn.status === 'CLOSED') {
          throw new Error(`Cannot create delivery: GRN '${grn.grnNumber}' is CLOSED`);
        }

        // 2. Lock Position Documents in lexicographical order (Second in global lock order)
        const sortedItems = [...input.items].sort((a, b) =>
          a.positionId.localeCompare(b.positionId),
        );
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

          lockedPositions.set(item.positionId, {
            code: pos.code,
            capacityBags: pos.capacityBags,
            chamberId: pos.chamberId,
          });
        }

        // 3. Authoritative Ledger Reads inside transaction
        // 3a. Calculate NetDelivered and RemainingDeliveryBalance
        const [outwardAgg, reversalAgg, inwardAgg] = await Promise.all([
          InventoryTransactionModel.aggregate([
            { $match: { grnId: grn.id, facilityId, transactionType: 'OUTWARD_DELIVERY' } },
            { $group: { _id: null, total: { $sum: '$quantity' } } },
          ]).session(session),
          InventoryTransactionModel.aggregate([
            { $match: { grnId: grn.id, facilityId, transactionType: 'DELIVERY_REVERSAL' } },
            { $group: { _id: null, total: { $sum: '$quantity' } } },
          ]).session(session),
          InventoryTransactionModel.aggregate([
            { $match: { grnId: grn.id, facilityId, transactionType: 'INWARD_PUTAWAY' } },
            { $group: { _id: null, total: { $sum: '$quantity' } } },
          ]).session(session),
        ]);

        const totalOutward = outwardAgg[0]?.total ?? 0;
        const totalReversal = reversalAgg[0]?.total ?? 0;
        const totalInward = inwardAgg[0]?.total ?? 0;

        const netDelivered = totalOutward - totalReversal;
        const remainingDeliveryBalance = grn.bags - netDelivered;
        const physicallyStored = totalInward - totalOutward + totalReversal;

        const totalRequestedBags = input.items.reduce((sum, item) => sum + item.bags, 0);

        // Invariant: Cannot deliver more than remaining delivery balance
        if (totalRequestedBags > remainingDeliveryBalance) {
          throw new Error(
            `Requested ${totalRequestedBags} bags exceeds remaining delivery balance of ${remainingDeliveryBalance} bags for GRN '${grn.grnNumber}'`,
          );
        }

        // Invariant: Cannot deliver more than physically available in storage (unallocated bags cannot be delivered)
        if (totalRequestedBags > physicallyStored) {
          throw new Error(
            `Requested ${totalRequestedBags} bags exceeds physically available stock of ${physicallyStored} bags for GRN '${grn.grnNumber}' (unallocated bags cannot be delivered)`,
          );
        }

        // Invariant: Check each position's physical stock for this GRN
        for (const item of input.items) {
          const posMeta = lockedPositions.get(item.positionId)!;
          const posStockAgg = await InventoryTransactionModel.aggregate([
            { $match: { grnId: grn.id, positionId: item.positionId, facilityId } },
            {
              $group: {
                _id: null,
                inward: {
                  $sum: {
                    $cond: [{ $eq: ['$transactionType', 'INWARD_PUTAWAY'] }, '$quantity', 0],
                  },
                },
                outward: {
                  $sum: {
                    $cond: [{ $eq: ['$transactionType', 'OUTWARD_DELIVERY'] }, '$quantity', 0],
                  },
                },
                reversal: {
                  $sum: {
                    $cond: [{ $eq: ['$transactionType', 'DELIVERY_REVERSAL'] }, '$quantity', 0],
                  },
                },
              },
            },
          ]).session(session);

          const currentPosStock =
            (posStockAgg[0]?.inward ?? 0) -
            (posStockAgg[0]?.outward ?? 0) +
            (posStockAgg[0]?.reversal ?? 0);

          if (item.bags > currentPosStock) {
            throw new Error(
              `Requested ${item.bags} bags exceeds available stock of ${currentPosStock} bags in position '${posMeta.code}' for GRN '${grn.grnNumber}'`,
            );
          }
        }

        // 4. Date validation & FY sequence generation
        const deliveryDate = new Date(input.date || Date.now());
        const now = new Date();
        const maxFutureAllowed = new Date(now.getTime() + 5 * 60 * 1000);
        if (deliveryDate > maxFutureAllowed) {
          throw new Error('Delivery date cannot be in the future');
        }

        const currentFy = getFinancialYearKey(now);
        const deliveryFy = getFinancialYearKey(deliveryDate);
        if (deliveryFy !== currentFy) {
          throw new Error(
            `Delivery date belongs to Financial Year '${deliveryFy}', but current active FY is '${currentFy}'`,
          );
        }

        const maxPastAllowed = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        if (deliveryDate < maxPastAllowed) {
          throw new Error('Delivery date exceeds permitted 30-day operational backdating window');
        }

        const challanNumber = await counterService.generateDeliveryChallanNumber(
          facilityId,
          deliveryDate,
          session,
        );
        const deliveryId = `del-${randomUUID()}`;

        // 5. Insert DeliveryChallan document
        const deliveryItems = input.items.map((item) => ({
          positionId: item.positionId,
          positionCode: lockedPositions.get(item.positionId)!.code,
          bags: item.bags,
        }));

        const challanDocs = await DeliveryChallanModel.create(
          [
            {
              id: deliveryId,
              facilityId,
              challanNumber,
              date: deliveryDate,
              grnId: grn.id,
              grnNumber: grn.grnNumber,
              customerId: grn.customerId,
              customerName: grn.customerName,
              commodityId: grn.commodityId,
              commodityName: grn.commodityName,
              chamberId: grn.chamberId,
              chamberNumber: grn.chamberNumber,
              items: deliveryItems,
              totalBags: totalRequestedBags,
              vehicleNumber: input.vehicleNumber?.trim().toUpperCase() || null,
              driverName: input.driverName?.trim() || null,
              weight: input.weight ?? null,
              remarks: input.remarks?.trim() || null,
              status: 'ISSUED',
              issuedBy: userId,
            },
          ],
          { session, ordered: true },
        );

        createdChallanDoc = challanDocs[0];

        // 6. Append immutable ledger transactions for each delivered position
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
            transactionType: 'OUTWARD_DELIVERY' as const,
            quantity: item.bags,
            referenceType: 'DELIVERY' as const,
            referenceId: deliveryId,
            notes: input.remarks?.trim() || null,
            createdBy: userId,
            createdAt: deliveryDate,
          };
        });

        await InventoryTransactionModel.create(ledgerDocsToCreate, { session, ordered: true });

        // 7. Automatic GRN Lifecycle Transition: OPEN -> CLOSED
        const newRemainingDeliveryBalance = remainingDeliveryBalance - totalRequestedBags;
        const newPhysicallyStored = physicallyStored - totalRequestedBags;

        if (newRemainingDeliveryBalance === 0 && newPhysicallyStored === 0) {
          await GrnModel.updateOne({ id: grn.id }, { $set: { status: 'CLOSED' } }, { session });
        }
      });
    } finally {
      await session.endSession();
    }

    const delivery = this.toChallanEntity(createdChallanDoc!);
    const summary = await this.getDeliverySummary(facilityId, input.grnId);

    await auditService.log({
      eventType: 'DELIVERY_ISSUED',
      severity: 'INFO',
      userId,
      facilityId,
      resource: 'delivery',
      resourceId: delivery.id,
      details: {
        challanNumber: delivery.challanNumber,
        totalBags: delivery.totalBags,
        grnId: delivery.grnId,
        customerId: delivery.customerId,
      },
    });

    return { delivery, summary };
  }

  private async executeReversalTransaction(
    facilityId: string,
    deliveryId: string,
    input: ReverseDeliveryInput,
    userId: string,
  ): Promise<{ reversal: DeliveryReversal; challan: DeliveryChallan; summary: DeliverySummary }> {
    const session = await mongoose.startSession();
    let createdReversalDoc: DeliveryReversalDoc;
    let updatedChallanDoc: DeliveryChallanDoc;
    let grnId = '';

    try {
      await session.withTransaction(async () => {
        // Pre-fetch delivery to resolve grnId
        const existingChallan = await DeliveryChallanModel.findOne({ id: deliveryId, facilityId })
          .session(session)
          .lean()
          .exec();

        if (!existingChallan) {
          throw new Error(`Delivery challan '${deliveryId}' not found in facility '${facilityId}'`);
        }
        if (existingChallan.status === 'REVERSED') {
          throw new Error(
            `Delivery challan '${existingChallan.challanNumber}' is already REVERSED`,
          );
        }

        grnId = existingChallan.grnId;

        // 1. Lock GRN Document (First in global lock order)
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

        // 2. Lock Position Documents in lexicographical order (Second in global lock order)
        const sortedItems = [...existingChallan.items].sort((a, b) =>
          a.positionId.localeCompare(b.positionId),
        );
        const lockedPositions = new Map<string, { code: string; capacityBags: number }>();

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

          lockedPositions.set(item.positionId, {
            code: pos.code,
            capacityBags: pos.capacityBags,
          });
        }

        // 3. Lock DeliveryChallan Document (Third in global lock order)
        const lockedChallan = await DeliveryChallanModel.findOneAndUpdate(
          { id: deliveryId, facilityId, status: 'ISSUED' },
          { $set: { status: 'REVERSED', updatedAt: new Date() } },
          { session, new: true },
        ).exec();

        if (!lockedChallan) {
          throw new Error(
            `Delivery challan '${deliveryId}' cannot be reversed (must be in ISSUED status)`,
          );
        }
        updatedChallanDoc = lockedChallan;

        // 4. Pre-Reversal Position Capacity Verification
        for (const item of existingChallan.items) {
          const posMeta = lockedPositions.get(item.positionId)!;
          const posOccupancyAgg = await InventoryTransactionModel.aggregate([
            { $match: { positionId: item.positionId, facilityId } },
            {
              $group: {
                _id: null,
                inward: {
                  $sum: {
                    $cond: [{ $eq: ['$transactionType', 'INWARD_PUTAWAY'] }, '$quantity', 0],
                  },
                },
                outward: {
                  $sum: {
                    $cond: [{ $eq: ['$transactionType', 'OUTWARD_DELIVERY'] }, '$quantity', 0],
                  },
                },
                reversal: {
                  $sum: {
                    $cond: [{ $eq: ['$transactionType', 'DELIVERY_REVERSAL'] }, '$quantity', 0],
                  },
                },
              },
            },
          ]).session(session);

          const currentOccupancy =
            (posOccupancyAgg[0]?.inward ?? 0) -
            (posOccupancyAgg[0]?.outward ?? 0) +
            (posOccupancyAgg[0]?.reversal ?? 0);
          const availableCapacity = posMeta.capacityBags - currentOccupancy;

          if (item.bags > availableCapacity) {
            throw new Error(
              `Cannot reverse delivery: returning ${item.bags} bags exceeds available capacity of ${availableCapacity} bags in position '${posMeta.code}' (capacity: ${posMeta.capacityBags}, current occupancy: ${currentOccupancy})`,
            );
          }
        }

        // 5. Insert DeliveryReversal record
        const reversalId = `rev-${randomUUID()}`;
        const reversedAt = new Date();

        const reversalDocs = await DeliveryReversalModel.create(
          [
            {
              id: reversalId,
              facilityId,
              deliveryId: existingChallan.id,
              challanNumber: existingChallan.challanNumber,
              grnId: grn.id,
              reason: input.reason.trim(),
              reversedBy: userId,
              reversedAt,
            },
          ],
          { session, ordered: true },
        );

        createdReversalDoc = reversalDocs[0];

        // 6. Append compensating ledger entries with transactionType: 'DELIVERY_REVERSAL'
        const positionDocs = await PositionModel.find(
          { id: { $in: existingChallan.items.map((i) => i.positionId) } },
          null,
          { session },
        )
          .lean()
          .exec();
        const positionMap = new Map(positionDocs.map((p) => [p.id, p]));

        const reversalLedgerRows = existingChallan.items.map((item) => {
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
            transactionType: 'DELIVERY_REVERSAL' as const,
            quantity: item.bags,
            referenceType: 'DELIVERY_REVERSAL' as const,
            referenceId: reversalId,
            notes: `Reversal of challan ${existingChallan.challanNumber}: ${input.reason.trim()}`,
            createdBy: userId,
            createdAt: reversedAt,
          };
        });

        await InventoryTransactionModel.create(reversalLedgerRows, { session, ordered: true });

        // 7. Automatic GRN Lifecycle Transition: CLOSED -> OPEN
        if (grn.status === 'CLOSED') {
          await GrnModel.updateOne({ id: grn.id }, { $set: { status: 'OPEN' } }, { session });
        }
      });
    } finally {
      await session.endSession();
    }

    const reversal = this.toReversalEntity(createdReversalDoc!);
    const challan = this.toChallanEntity(updatedChallanDoc!);
    const summary = await this.getDeliverySummary(facilityId, grnId);

    await auditService.log({
      eventType: 'DELIVERY_REVERSED',
      severity: 'INFO',
      userId,
      facilityId,
      resource: 'delivery',
      resourceId: reversal.id,
      details: {
        deliveryId: challan.id,
        challanNumber: challan.challanNumber,
        reason: input.reason,
      },
    });

    return { reversal, challan, summary };
  }

  public async getDeliveryById(
    facilityId: string,
    deliveryId: string,
  ): Promise<DeliveryChallan | null> {
    const doc = await DeliveryChallanModel.findOne({ id: deliveryId, facilityId }).lean().exec();
    return doc ? this.toChallanEntity(doc) : null;
  }

  public async listDeliveries(
    facilityId: string,
    query: DeliveryQuery,
  ): Promise<{ items: DeliveryChallan[]; total: number; page: number; limit: number }> {
    const filter: Record<string, unknown> = { facilityId };
    if (query.grnId) filter.grnId = query.grnId;
    if (query.customerId) filter.customerId = query.customerId;
    if (query.status) filter.status = query.status;

    const skip = (query.page - 1) * query.limit;

    const [docs, total] = await Promise.all([
      DeliveryChallanModel.find(filter)
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(query.limit)
        .lean()
        .exec(),
      DeliveryChallanModel.countDocuments(filter).exec(),
    ]);

    return {
      items: docs.map((d) => this.toChallanEntity(d)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  public async listDeliveriesForGrn(facilityId: string, grnId: string): Promise<DeliveryChallan[]> {
    const docs = await DeliveryChallanModel.find({ facilityId, grnId })
      .sort({ date: -1, createdAt: -1 })
      .lean()
      .exec();
    return docs.map((d) => this.toChallanEntity(d));
  }

  public async getDeliverySummary(facilityId: string, grnId: string): Promise<DeliverySummary> {
    const grn = await GrnModel.findOne({ id: grnId, facilityId }).lean().exec();
    if (!grn) {
      throw new Error(`GRN '${grnId}' not found in facility '${facilityId}'`);
    }

    const [outwardAgg, reversalAgg, inwardAgg] = await Promise.all([
      InventoryTransactionModel.aggregate([
        { $match: { grnId, facilityId, transactionType: 'OUTWARD_DELIVERY' } },
        { $group: { _id: null, total: { $sum: '$quantity' } } },
      ]),
      InventoryTransactionModel.aggregate([
        { $match: { grnId, facilityId, transactionType: 'DELIVERY_REVERSAL' } },
        { $group: { _id: null, total: { $sum: '$quantity' } } },
      ]),
      InventoryTransactionModel.aggregate([
        { $match: { grnId, facilityId, transactionType: 'INWARD_PUTAWAY' } },
        { $group: { _id: null, total: { $sum: '$quantity' } } },
      ]),
    ]);

    const totalOutward = outwardAgg[0]?.total ?? 0;
    const totalReversal = reversalAgg[0]?.total ?? 0;
    const totalInward = inwardAgg[0]?.total ?? 0;

    const netDeliveredBags = totalOutward - totalReversal;
    const remainingDeliveryBalance = Math.max(0, grn.bags - netDeliveredBags);
    const physicallyStoredBags = Math.max(0, totalInward - totalOutward + totalReversal);

    const challanDocs = await DeliveryChallanModel.find({ facilityId, grnId })
      .sort({ date: -1, createdAt: -1 })
      .lean()
      .exec();

    return {
      grnId: grn.id,
      facilityId: grn.facilityId,
      grnNumber: grn.grnNumber,
      totalReceivedBags: grn.bags,
      netDeliveredBags,
      remainingDeliveryBalance,
      physicallyStoredBags,
      grnStatus: grn.status,
      deliveries: challanDocs.map((d) => this.toChallanEntity(d)),
    };
  }

  public async resolveFacilityIdForDelivery(deliveryId: string): Promise<string | null> {
    const doc = await DeliveryChallanModel.findOne({ id: deliveryId })
      .select('facilityId')
      .lean()
      .exec();
    return doc?.facilityId ?? null;
  }

  private toChallanEntity(
    doc: DeliveryChallanDoc | (Record<string, unknown> & { id: string }),
  ): DeliveryChallan {
    const d = doc as Record<string, unknown>;
    return {
      id: String(d.id),
      facilityId: String(d.facilityId),
      challanNumber: String(d.challanNumber),
      date: d.date instanceof Date ? d.date : new Date(String(d.date)),
      grnId: String(d.grnId),
      grnNumber: String(d.grnNumber),
      customerId: String(d.customerId),
      customerName: String(d.customerName),
      commodityId: String(d.commodityId),
      commodityName: String(d.commodityName),
      chamberId: String(d.chamberId),
      chamberNumber: String(d.chamberNumber),
      items: (d.items as DeliveryChallan['items']) ?? [],
      totalBags: Number(d.totalBags),
      vehicleNumber: d.vehicleNumber ? String(d.vehicleNumber) : null,
      driverName: d.driverName ? String(d.driverName) : null,
      weight: d.weight !== null && d.weight !== undefined ? Number(d.weight) : null,
      remarks: d.remarks ? String(d.remarks) : null,
      status: d.status as DeliveryChallan['status'],
      issuedBy: String(d.issuedBy),
      createdAt: d.createdAt instanceof Date ? d.createdAt : new Date(String(d.createdAt)),
      updatedAt: d.updatedAt instanceof Date ? d.updatedAt : new Date(String(d.updatedAt)),
    };
  }

  private toReversalEntity(
    doc: DeliveryReversalDoc | (Record<string, unknown> & { id: string }),
  ): DeliveryReversal {
    const d = doc as Record<string, unknown>;
    return {
      id: String(d.id),
      facilityId: String(d.facilityId),
      deliveryId: String(d.deliveryId),
      challanNumber: String(d.challanNumber),
      grnId: String(d.grnId),
      reason: String(d.reason),
      reversedBy: String(d.reversedBy),
      reversedAt: d.reversedAt instanceof Date ? d.reversedAt : new Date(String(d.reversedAt)),
    };
  }
}

export const deliveryService = new DeliveryService();
