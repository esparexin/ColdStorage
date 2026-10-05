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

  // Bond # stays reference-only: an explicit value from a legacy import is preserved, but no
  // new BND- number is minted. The GR Number is the sole business key and is what the Bonds UI
  // shows in the Bond # column.
  if (input.bondNumber !== undefined && input.bondNumber !== null) {
    grn.bondNumber = input.bondNumber.trim() || null;
  }

  if (input.loanStatus === 'TAKEN') {
    grn.loanTakenAt = new Date();
    grn.loanClearedAt = null;
    if (input.bankName !== undefined) grn.loanBankName = input.bankName.trim() || null;
    if (input.referenceNumber !== undefined) grn.loanReferenceNumber = input.referenceNumber.trim() || null;
    if (input.remarks !== undefined) grn.loanRemarks = input.remarks.trim() || null;
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
      if (input.settlement.remarks) {
        grn.loanRemarks = input.settlement.remarks.trim();
      }
    }
    if (input.remarks !== undefined) grn.loanRemarks = input.remarks.trim() || null;
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
      bondNumber: grn.bondNumber,
      previousStatus,
      newStatus: grn.loanStatus,
      bankName: grn.loanBankName,
      referenceNumber: grn.loanReferenceNumber,
      remarks: grn.loanRemarks,
      settlement: input.settlement
        ? {
            amountPaid: input.settlement.amountPaid,
            paymentMode: input.settlement.paymentMode,
            utrNumber: input.settlement.utrNumber,
            bankName: input.settlement.bankName,
            accountNumber: input.settlement.accountNumber,
            ifscCode: input.settlement.ifscCode,
            receiverName: input.settlement.receiverName,
            receiverAadhaar: input.settlement.receiverAadhaar,
          }
        : undefined,
    },
  });

  const netDelivered = await readLedgerNetDelivered(facilityId, grn.id);
  const closing = Math.max(0, grn.bags - netDelivered.total);

  return toGrnEntity(grn.toObject(), { netDeliveredBags: netDelivered.total, closingBags: closing });
}
