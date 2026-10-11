import mongoose from 'mongoose';
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
  const session = await mongoose.startSession();
  let previousStatus = '';
  let savedId = '';
  try {
    await session.withTransaction(async () => {
      const grn = await GrnModel.findOne({ id: grnId, facilityId }).session(session).exec();
      if (!grn) {
        throw new Error(`GRN '${grnId}' not found in facility '${facilityId}'`);
      }
      previousStatus = grn.loanStatus;
      savedId = grn.id;
      grn.isBondForLoan = true;
      grn.loanStatus = input.loanStatus;
      if (input.bondNumber !== undefined && input.bondNumber !== null) {
        grn.bondNumber = input.bondNumber.trim() || null;
      }
      if (input.loanStatus === 'TAKEN') {
        grn.loanTakenAt = new Date();
        grn.loanClearedAt = null;
      } else if (input.loanStatus === 'CLEARED') {
        grn.loanClearedAt = new Date();
        if (input.settlement) {
          grn.loanSettlementAmount = input.settlement.amountPaid;
          grn.loanSettlementMode = input.settlement.paymentMode;
          grn.loanSettlementUtr = input.settlement.utrNumber?.trim() || null;
          grn.loanSettlementBankName = input.settlement.bankName?.trim() || null;
          grn.loanSettlementAccountNumber = input.settlement.accountNumber?.trim() || null;
          grn.loanSettlementIfsc = input.settlement.ifscCode?.trim() || null;
          grn.loanSettlementReceiverName = input.settlement.receiverName.trim();
          grn.loanSettlementReceiverAadhaar = input.settlement.receiverAadhaar?.trim() || null;
          grn.loanRemarks = input.settlement.remarks?.trim() || null;
        }
      } else if (input.loanStatus === 'NOT_TAKEN') {
        grn.loanTakenAt = null;
        grn.loanClearedAt = null;
        grn.loanSettlementAmount = null;
        grn.loanSettlementMode = null;
        grn.loanSettlementUtr = null;
        grn.loanSettlementBankName = null;
        grn.loanSettlementAccountNumber = null;
        grn.loanSettlementIfsc = null;
        grn.loanSettlementReceiverName = null;
        grn.loanSettlementReceiverAadhaar = null;
        grn.loanRemarks = null;
      }
      grn.updatedAt = new Date();
      await grn.save({ session });
    });
  } finally {
    await session.endSession();
  }

  const latest = await GrnModel.findOne({ id: savedId, facilityId }).lean().exec();
  if (!latest) throw new Error(`GRN '${grnId}' not found in facility '${facilityId}'`);
  await auditService.log({
    eventType: 'GRN_LOAN_STATUS_UPDATED',
    severity: 'INFO',
    userId,
    facilityId,
    resource: 'grn',
    resourceId: latest.id as string,
    details: {
      grnNumber: latest.grnNumber,
      bondNumber: latest.bondNumber,
      previousStatus,
      newStatus: latest.loanStatus,
      remarks: latest.loanRemarks,
    },
  });
  const netDelivered = await readLedgerNetDelivered(facilityId, savedId);
  const closing = Math.max(0, (latest.bags as number) - netDelivered.total);
  return toGrnEntity(latest, { netDeliveredBags: netDelivered.total, closingBags: closing });
}
