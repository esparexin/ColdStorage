'use client';

import React, { useState } from 'react';
import { FileText, History } from 'lucide-react';
import { seasonYearForInwardDate, type DeliveryChallan, type RentExtension, type RentSummaryDto } from '@cold-storage/contracts';
import { Button, Modal, StatCard, StatGrid } from '@/components/ui';
import { PRINT_MESSAGES } from '@/components/ui/stateCopy';
import { printHtmlDocument } from '@/lib/print-document';
import {
  formatRemainingDue,
  formatRentStructure,
} from '../hooks/rentDisplay.helper';
import { RentCashMemosTab } from './RentCashMemosTab';
import { RentOutwardHistoryTab } from './RentOutwardHistoryTab';
import styles from '../page.module.css';

interface RentHistoryModalProps {
  account: RentSummaryDto;
  selectedFacilityId: string;
  canPrint: boolean;
  canCollect?: boolean;
  onClose: () => void;
  onOpenCollect?: (account: RentSummaryDto, delivery?: DeliveryChallan) => void;
}

export function RentHistoryModal({
  account,
  selectedFacilityId,
  canPrint,
  canCollect,
  onClose,
  onOpenCollect,
}: RentHistoryModalProps) {
  const [activeTab, setActiveTab] = useState<'cash-memos' | 'outward-history'>('cash-memos');
  const [printingReceiptNum, setPrintingReceiptNum] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const originSeason = seasonYearForInwardDate(new Date(account.inwardDate));
  const isOutwardAssessed =
    (account.outwardRentCharges ?? 0) > 0 || (account.deliveredBags ?? 0) > 0;

  function periodLabel(ext: RentExtension): string {
    if (ext.period === 'SEASON') return `Season ${ext.seasonYear} renewal`;
    return `${ext.period === 'JANUARY' ? 'January' : 'February'} ${ext.seasonYear + 1}`;
  }

  const handlePrintReceipt = async (receiptNumber: string) => {
    if (!selectedFacilityId) return;
    setPrintingReceiptNum(receiptNumber);
    try {
      await printHtmlDocument({
        url: `/api/facilities/${encodeURIComponent(selectedFacilityId)}/rent/receipts/${encodeURIComponent(receiptNumber)}/print`,
        popupBlockedMessage: PRINT_MESSAGES.popupBlocked,
        failureMessage: 'Failed to generate rent receipt',
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate rent receipt');
    } finally {
      setPrintingReceiptNum(null);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Cash Memos & Rent History: ${account.grnNumber}`}
      subtitle={`${account.customerName} · Inward: ${account.totalBags.toLocaleString('en-IN')} bags · Delivered: ${(account.deliveredBags ?? 0).toLocaleString('en-IN')} bags · Stock Balance: ${(account.remainingBags ?? Math.max(0, account.totalBags - (account.deliveredBags ?? 0))).toLocaleString('en-IN')} bags`}
      size="lg"
      footer={
        <div className={styles.modalFooterContent}>
          <div>
            {canCollect && account.remainingBalance > 0 && (
              <span className={styles.outstandingBadge}>
                Balance Due: <strong>₹{account.remainingBalance.toLocaleString('en-IN')}</strong>
              </span>
            )}
          </div>
          <div className={styles.footerActions}>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            {!isOutwardAssessed && canCollect && account.remainingBalance > 0 && onOpenCollect && (
              <Button
                variant="primary"
                onClick={() => {
                  onClose();
                  onOpenCollect(account);
                }}
              >
                Pay ₹{account.remainingBalance.toLocaleString('en-IN')}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className={styles.modalBody}>
        <nav className={styles.actionGroup} role="tablist" aria-label="Rent details tabs">
          <Button
            role="tab"
            aria-selected={activeTab === 'cash-memos'}
            variant={activeTab === 'cash-memos' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('cash-memos')}
            leftIcon={<FileText size={14} aria-hidden="true" />}
          >
            Cash Memos & Bills
          </Button>
          <Button
            role="tab"
            aria-selected={activeTab === 'outward-history'}
            variant={activeTab === 'outward-history' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('outward-history')}
            leftIcon={<History size={14} aria-hidden="true" />}
          >
            Outward Rent History
          </Button>
        </nav>

        <div className={styles.compactStats}>
          <StatGrid label={`Rent summary for ${account.grnNumber}`}>
            <StatCard
              label={
                isOutwardAssessed
                  ? 'Total Outward Rent'
                  : account.rentType === 'Monthly' && account.rentAmount === 0
                  ? 'Rent Status'
                  : 'Total Billed'
              }
              value={formatRentStructure(account)}
            />
            <StatCard
              label="Total Paid"
              value={`₹${account.totalPaid.toLocaleString('en-IN')}`}
              accent="success"
            />
            <StatCard
              label="Remaining Due"
              value={formatRemainingDue(account)}
              accent="warning"
            />
          </StatGrid>
        </div>

        {activeTab === 'cash-memos' ? (
          <RentCashMemosTab
            account={account}
            originSeason={originSeason}
            canPrint={canPrint}
            canCollect={canCollect}
            printingReceiptNum={printingReceiptNum}
            error={error}
            onPrintReceipt={(num) => void handlePrintReceipt(num)}
            onCollectDelivery={(delivery) => {
              onClose();
              onOpenCollect?.(account, delivery);
            }}
            periodLabel={periodLabel}
          />
        ) : (
          <RentOutwardHistoryTab
            facilityId={selectedFacilityId}
            account={account}
          />
        )}
      </div>
    </Modal>
  );
}
