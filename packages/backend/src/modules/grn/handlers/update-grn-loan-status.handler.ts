import type { Grn, UpdateGrnLoanStatusInput } from '@cold-storage/contracts';
import { GrnModel } from '../../../database/models/grn.model.js';
import { auditService } from '../../audit/audit.service.js';
import { readLedgerNetDelivered } from '../../inventory/ledger-balance.js';
import { toGrnEntity } from '../grn.mappers.js';

export async function updateGrnLoanStatus(
  facilityId: string,
  grnId: string,
  input: UpdateGrnLoanStatusInput,
  userId: string,
): Promise<Grn> {
  const grn = await GrnModel.findOne({ id: grnId, facilityId });
  if (!grn) {
    throw new Error(`GRN '${grnId}' not found in facility '${facilityId}'`);
  }

  const previousStatus = grn.loanStatus;

  grn.isBondForLoan = true;
  grn.loanStatus = input.loanStatus;

  if (input.loanStatus === 'TAKEN') {
    grn.loanTakenAt = new Date();
    grn.loanClearedAt = null;
    if (input.bankName !== undefined) grn.loanBankName = input.bankName.trim() || null;
    if (input.referenceNumber !== undefined) grn.loanReferenceNumber = input.referenceNumber.trim() || null;
    if (input.remarks !== undefined) grn.loanRemarks = input.remarks.trim() || null;
  } else if (input.loanStatus === 'CLEARED') {
    grn.loanClearedAt = new Date();
    if (input.remarks !== undefined) grn.loanRemarks = input.remarks.trim() || null;
  } else if (input.loanStatus === 'NOT_TAKEN') {
    grn.loanTakenAt = null;
    grn.loanClearedAt = null;
    if (input.remarks !== undefined) grn.loanRemarks = input.remarks.trim() || null;
  }

  grn.updatedAt = new Date();
  await grn.save();

  await auditService.log({
    eventType: 'GRN_LOAN_STATUS_UPDATED',
    severity: 'INFO',
    userId,
    facilityId,
    resource: 'grn',
    resourceId: grn.id,
    details: {
      grnNumber: grn.grnNumber,
      previousStatus,
      newStatus: grn.loanStatus,
      bankName: grn.loanBankName,
      referenceNumber: grn.loanReferenceNumber,
      remarks: grn.loanRemarks,
    },
  });

  const netDelivered = await readLedgerNetDelivered(facilityId, grn.id);
  const closing = Math.max(0, grn.bags - netDelivered.total);

  return toGrnEntity(grn.toObject(), { netDeliveredBags: netDelivered.total, closingBags: closing });
}
