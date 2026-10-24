import mongoose from 'mongoose';
import type { DeleteGrnInput, DeleteGrnResult } from '@cold-storage/contracts';
import { GrnModel } from '../../../database/models/grn.model.js';
import { RentPaymentModel } from '../../../database/models/rent-payment.model.js';
import { RentExtensionModel } from '../../../database/models/rent-extension.model.js';
import { InventoryTransactionModel } from '../../../database/models/inventory-transaction.model.js';
import { DeliveryChallanModel } from '../../../database/models/delivery-challan.model.js';
import { DeliveryReversalModel } from '../../../database/models/delivery-reversal.model.js';
import { InternalMovementModel } from '../../../database/models/internal-movement.model.js';
import { auditService } from '../../audit/audit.service.js';

/**
 * Testing-only GRN deletion handler.
 *
 * NEVER enabled in production. Guards:
 *  1. `process.env.NODE_ENV !== 'production'` — hard-coded production block.
 *  2. `confirmationToken` must equal the GRN number — prevents accidental deletion.
 *  3. Dependency pre-checks — blocks deletion when dependent records exist that
 *     would corrupt the system (active deliveries, merge relationships).
 *  4. Facility scoping — only GRNs in the caller's facility can be deleted.
 *
 * Dependent records are deleted via raw MongoDB collection operations to
 * bypass Mongoose immutability pre-hooks on RentPayment and AuditLog.
 * AuditLog records are NEVER deleted (append-only compliance log); a new
 * GRN_DELETED audit entry is written instead.
 */
export async function deleteGrn(
  facilityId: string,
  input: DeleteGrnInput,
  userId: string,
): Promise<DeleteGrnResult> {
  // 1. Production hard-block
  if (process.env.NODE_ENV === 'production') {
    throw new Error('GRN deletion is disabled in production');
  }

  const { grnId, confirmationToken, reason } = input;

  // 2. Load GRN with facility scope
  const grn = await GrnModel.findOne({ id: grnId, facilityId }).lean().exec();
  if (!grn) {
    throw new Error(`GRN '${grnId}' not found in facility '${facilityId}'`);
  }

  // 3. Confirmation token must match GRN number
  if (confirmationToken !== grn.grnNumber) {
    throw new Error(
      `Confirmation token does not match GRN number '${grn.grnNumber}'. Deletion aborted.`,
    );
  }

  // 4. Dependency pre-checks
  // A GRN that has been merged into another GRN cannot be deleted (its identity
  // is superseded by the surviving target).
  if (grn.mergedIntoGrnId) {
    throw new Error(
      `Cannot delete GRN '${grn.grnNumber}' because it has been merged into GRN '${grn.mergedIntoGrnNumber}'.`,
    );
  }

  // A GRN that is a merge target (other GRNs reference it as mergedIntoGrnId)
  // cannot be deleted because it preserves the source GRNs' history.
  const mergeTargetCount = await GrnModel.countDocuments({
    facilityId,
    mergedIntoGrnId: grnId,
  }).exec();
  if (mergeTargetCount > 0) {
    throw new Error(
      `Cannot delete GRN '${grn.grnNumber}' because ${mergeTargetCount} source GRN(s) have been merged into it.`,
    );
  }

  // Active ISSUED delivery challans mean bags are still outbound — deletion would
  // orphan outward movement records.
  const activeChallans = await DeliveryChallanModel.countDocuments({
    facilityId,
    grnId,
    status: 'ISSUED',
  }).exec();
  if (activeChallans > 0) {
    throw new Error(
      `Cannot delete GRN '${grn.grnNumber}' because ${activeChallans} delivery challan(s) are still ISSUED. Reverse or settle them first.`,
    );
  }

  // 5. Count all dependent records before deletion
  const [rentPaymentsCount, rentExtensionsCount, inventoryTxCount, deliveryChallansCount, deliveryReversalsCount, internalMovementsCount] =
    await Promise.all([
      RentPaymentModel.countDocuments({ facilityId, grnId }).exec(),
      RentExtensionModel.countDocuments({ facilityId, grnId }).exec(),
      InventoryTransactionModel.countDocuments({ facilityId, grnId }).exec(),
      DeliveryChallanModel.countDocuments({ facilityId, grnId }).exec(),
      DeliveryReversalModel.countDocuments({ facilityId, grnId }).exec(),
      InternalMovementModel.countDocuments({
        facilityId,
        $or: [{ grnId }, { targetGrnId: grnId }, { sourceGrnIds: grnId }],
      }).exec(),
    ]);

  // 6. Delete all dependent records in a transaction
  const session = await mongoose.startSession();
  let deletedGrn: { id: string; grnNumber: string } | null = null;

  try {
    await session.withTransaction(async () => {
      // RentPayment: raw collection delete to bypass Mongoose immutability pre-hooks
      await mongoose.connection.collection('rentpayments').deleteMany(
        { facilityId, grnId },
        { session },
      );

      // RentExtension
      await RentExtensionModel.deleteMany({ facilityId, grnId }, { session }).exec();

      // InventoryTransaction
      await InventoryTransactionModel.deleteMany({ facilityId, grnId }, { session }).exec();

      // DeliveryReversal (before DeliveryChallan, since reversals reference challans)
      await DeliveryReversalModel.deleteMany({ facilityId, grnId }, { session }).exec();

      // DeliveryChallan
      await DeliveryChallanModel.deleteMany({ facilityId, grnId }, { session }).exec();

      // InternalMovement (references grnId as target or source)
      await InternalMovementModel.deleteMany(
        {
          facilityId,
          $or: [{ grnId }, { targetGrnId: grnId }, { sourceGrnIds: grnId }],
        },
        { session },
      ).exec();

      // Delete the GRN itself
      const result = await GrnModel.deleteOne({ id: grnId, facilityId }, { session }).exec();
      deletedGrn = {
        id: grnId,
        grnNumber: grn.grnNumber,
      };
      if (result.deletedCount === 0) {
        throw new Error(`GRN '${grnId}' was deleted by another request`);
      }
    });
  } finally {
    await session.endSession();
  }

  // 7. Audit log (append-only — ADD a new entry, never delete existing ones)
  await auditService.log({
    eventType: 'GRN_DELETED',
    severity: 'WARN',
    userId,
    facilityId,
    resource: 'grn',
    resourceId: grnId,
    details: {
      grnNumber: grn.grnNumber,
      reason: reason.trim(),
      dependentRecords: {
        rentPayments: rentPaymentsCount,
        rentExtensions: rentExtensionsCount,
        inventoryTransactions: inventoryTxCount,
        deliveryChallans: deliveryChallansCount,
        deliveryReversals: deliveryReversalsCount,
        internalMovements: internalMovementsCount,
      },
      deletedBy: userId,
    },
  });

  return {
    deleted: true,
    id: deletedGrn!.id,
    grnNumber: deletedGrn!.grnNumber,
    dependentRecords: {
      rentPayments: rentPaymentsCount,
      rentExtensions: rentExtensionsCount,
      inventoryTransactions: inventoryTxCount,
      deliveryChallans: deliveryChallansCount,
      deliveryReversals: deliveryReversalsCount,
      internalMovements: internalMovementsCount,
    },
    auditLogged: true,
  };
}
