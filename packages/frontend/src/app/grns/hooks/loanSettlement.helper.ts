import {
  aadhaarNumberSchema,
  ifscCodeSchema,
  type Grn,
  type LoanPaymentMode,
} from '@cold-storage/contracts';

export interface LoanSettlementState {
  amountPaid: string;
  paymentMode: LoanPaymentMode;
  paymentDate: string;
  utrNumber: string;
  upiId: string;
  bankName: string;
  branchName: string;
  accountNumber: string;
  ifscCode: string;
  receiverName: string;
  receiverAadhaar: string;
  remarks: string;
}

export function initSettlementState(grn: Grn): LoanSettlementState {
  return {
    amountPaid: grn.loanSettlementAmount ? String(grn.loanSettlementAmount) : '',
    paymentMode: grn.loanSettlementMode || 'Cash',
    paymentDate: new Date().toISOString().split('T')[0],
    utrNumber: grn.loanSettlementUtr || '',
    upiId: '',
    bankName: grn.loanBankName || grn.loanSettlementBankName || '',
    branchName: '',
    accountNumber: grn.loanSettlementAccountNumber || '',
    ifscCode: grn.loanSettlementIfsc || '',
    receiverName: grn.loanSettlementReceiverName || '',
    receiverAadhaar: grn.loanSettlementReceiverAadhaar || '',
    remarks: grn.loanRemarks || '',
  };
}

export function validateLoanSettlement(s: LoanSettlementState): string | null {
  const amt = Number(s.amountPaid);
  if (!amt || amt <= 0) return 'Valid settlement amount paid is required';
  if (!s.receiverName.trim()) return 'Receiver / Collector name is required';
  if (s.paymentMode === 'UPI') {
    if (!s.utrNumber.trim()) {
      return 'UPI UTR / Reference number is required';
    }
    if (s.utrNumber.trim().length < 4) {
      return 'UPI UTR / Reference number must be at least 4 characters';
    }
  }
  if (s.paymentMode === 'Bank Transfer') {
    if (!s.bankName.trim() || !s.accountNumber.trim() || !s.ifscCode.trim() || !s.utrNumber.trim()) {
      return 'Bank Name, Account #, IFSC, and UTR are required for Bank Transfer';
    }
    if (s.utrNumber.trim().length < 4) {
      return 'UTR / Reference number must be at least 4 characters';
    }
    const ifscResult = ifscCodeSchema.safeParse(s.ifscCode.trim());
    if (!ifscResult.success) {
      return ifscResult.error.issues[0]?.message ?? 'Invalid Indian IFSC code format (e.g. SBIN0001234)';
    }
  }
  if (s.receiverAadhaar.trim()) {
    const aadhaarResult = aadhaarNumberSchema.safeParse(s.receiverAadhaar.trim());
    if (!aadhaarResult.success) {
      return aadhaarResult.error.issues[0]?.message ?? 'Aadhaar number must be exactly 12 digits';
    }
  }
  return null;
}

export function buildSettlementPayload(s: LoanSettlementState) {
  return {
    amountPaid: Number(s.amountPaid),
    paymentMode: s.paymentMode,
    paymentDate: new Date(s.paymentDate),
    utrNumber: s.utrNumber.trim() || undefined,
    upiId: s.upiId.trim() || undefined,
    bankName: s.bankName.trim() || undefined,
    branchName: s.branchName.trim() || undefined,
    accountNumber: s.accountNumber.trim() || undefined,
    ifscCode: s.ifscCode.trim() || undefined,
    receiverName: s.receiverName.trim(),
    receiverAadhaar: s.receiverAadhaar.trim() || undefined,
    // Settlement notes are the single place loan remarks are captured.
    remarks: s.remarks.trim() || undefined,
  };
}
