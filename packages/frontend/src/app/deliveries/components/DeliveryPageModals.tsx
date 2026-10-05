'use client';

import React from 'react';
import type { DeliveryChallan, Grn, RentSummaryDto } from '@cold-storage/contracts';
import { CollectPaymentModal } from '../../rent/components/CollectPaymentModal';
import { UpdateLoanStatusModal } from '../../grns/components/UpdateLoanStatusModal';
import { CreateDeliveryModal } from './CreateDeliveryModal';
import { DeliveryDetailModal } from './DeliveryDetailModal';
import { DeliveryReversalModal } from './DeliveryReversalModal';

interface DeliveryPageModalsProps {
  selectedFacilityId: string | null;
  selectedDelivery: DeliveryChallan | null;
  isCreateOpen: boolean;
  loanClearGrn: Grn | null;
  rentPayAccount: RentSummaryDto | null;
  reverseDelivery: DeliveryChallan | null;
  canPrint: boolean;
  canCollectRent: boolean;
  canUpdateLoan: boolean;
  printingId: string | null;
  rentPaidTick: number;
  loanClearedTick: number;
  initialGrnId?: string;
  onCloseDetail: () => void;
  onCloseCreate: () => void;
  onCloseLoanClear: () => void;
  onCreateSuccess: (newDelivery: DeliveryChallan, summary: unknown) => void;
  onPayRent: (account: RentSummaryDto) => void;
  onClearLoan: (grn: Grn) => void;
  onLoanCleared: () => void;
  onCloseRentPay: () => void;
  onRentPaid: () => void;
  onCloseReverse: () => void;
  onReversed: () => void;
  onPrintChallan: (challanId: string) => void;
}

export function DeliveryPageModals({
  selectedFacilityId,
  selectedDelivery,
  isCreateOpen,
  loanClearGrn,
  rentPayAccount,
  reverseDelivery,
  canPrint,
  canCollectRent,
  canUpdateLoan,
  printingId,
  rentPaidTick,
  loanClearedTick,
  initialGrnId,
  onCloseDetail,
  onCloseCreate,
  onCloseLoanClear,
  onCreateSuccess,
  onPayRent,
  onClearLoan,
  onLoanCleared,
  onCloseRentPay,
  onRentPaid,
  onCloseReverse,
  onReversed,
  onPrintChallan,
}: DeliveryPageModalsProps) {
  if (!selectedFacilityId) return null;
  return (
    <>
      {selectedDelivery && (
        <DeliveryDetailModal
          delivery={selectedDelivery}
          onClose={onCloseDetail}
          canPrint={canPrint}
          printingId={printingId}
          onPrintChallan={onPrintChallan}
        />
      )}

      {isCreateOpen && (
        <CreateDeliveryModal
          facilityId={selectedFacilityId}
          onClose={onCloseCreate}
          onSuccess={onCreateSuccess}
          onPayRent={onPayRent}
          rentPaidTick={rentPaidTick}
          canPayRent={canCollectRent}
          onClearLoan={onClearLoan}
          loanClearedTick={loanClearedTick}
          canClearLoan={canUpdateLoan}
          initialGrnId={initialGrnId}
        />
      )}

      {loanClearGrn && (
        <UpdateLoanStatusModal
          grn={loanClearGrn}
          facilityId={selectedFacilityId}
          onClose={onCloseLoanClear}
          onSuccess={() => onLoanCleared()}
        />
      )}

      {rentPayAccount && (
        <CollectPaymentModal
          account={rentPayAccount}
          selectedFacilityId={selectedFacilityId}
          canPrint={canPrint}
          onClose={onCloseRentPay}
          onPaymentSuccess={onRentPaid}
        />
      )}

      {reverseDelivery && (
        <DeliveryReversalModal
          facilityId={selectedFacilityId}
          delivery={reverseDelivery}
          onClose={onCloseReverse}
          onSuccess={onReversed}
        />
      )}
    </>
  );
}
