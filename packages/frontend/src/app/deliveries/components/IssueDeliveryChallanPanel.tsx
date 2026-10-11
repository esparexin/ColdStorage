'use client';

import React from 'react';
import type { DeliveryChallan, DeliverySummary, Grn, RentSummaryDto } from '@cold-storage/contracts';
import { IssueDeliveryChallanModal } from './IssueDeliveryChallanModal';

export interface IssueDeliveryChallanPanelProps {
  facilityId: string;
  onCancel: () => void;
  onSuccess: (newDelivery: DeliveryChallan, summary?: DeliverySummary) => void;
  onPayRent: (account: RentSummaryDto) => void;
  rentPaidTick: number;
  canPayRent: boolean;
  onClearLoan?: (grn: Grn) => void;
  loanClearedTick?: number;
  canClearLoan?: boolean;
  initialGrnId?: string;
}

export function IssueDeliveryChallanPanel({
  facilityId,
  onCancel,
  onSuccess,
  onPayRent,
  rentPaidTick,
  canPayRent,
  onClearLoan,
  loanClearedTick,
  canClearLoan,
  initialGrnId,
}: IssueDeliveryChallanPanelProps) {
  return (
    <IssueDeliveryChallanModal
      isOpen={true}
      facilityId={facilityId}
      onClose={onCancel}
      onSuccess={onSuccess}
      onPayRent={onPayRent}
      rentPaidTick={rentPaidTick}
      canPayRent={canPayRent}
      onClearLoan={onClearLoan}
      loanClearedTick={loanClearedTick}
      canClearLoan={canClearLoan}
      initialGrnId={initialGrnId}
    />
  );
}
