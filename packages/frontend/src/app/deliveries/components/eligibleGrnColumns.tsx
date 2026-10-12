import React from 'react';
import type { Grn } from '@cold-storage/contracts';
import type { DataTableColumn } from '@/components/ui/DataTable';
import { Badge, Button } from '@/components/ui';
import {
  formatGrnDate,
  getAvailableStockBags,
  getEligibleGrnMarks,
} from '../hooks/eligibleGrn.helper';
import styles from './EligibleGrnSection.module.css';

export { formatGrnDate };

export interface CreateEligibleGrnColumnsParams {
  onSelectGrn: (grnId: string) => void;
}

export function createEligibleGrnColumns({
  onSelectGrn,
}: CreateEligibleGrnColumnsParams): DataTableColumn<Grn>[] {
  return [
    {
      key: 'grnNumber',
      header: 'GRN',
      render: (row) => (
        <div className={styles.grnCell}>
          <span className={styles.grnNumber}>{row.grnNumber}</span>
          {row.loanStatus === 'TAKEN' && (
            <Badge variant="danger" icon={<span aria-hidden="true">🔒</span>}>
              Loan Hold
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Inward Date',
      render: (row) => (
        <span className={styles.dateCell}>
          {formatGrnDate(row.date)}
        </span>
      ),
    },
    {
      key: 'customerName',
      header: 'Customer',
      render: (row) => (
        <span className={styles.customerName}>{row.customerName}</span>
      ),
    },
    {
      key: 'commodityName',
      header: 'Commodity',
      render: (row) => (
        <span className={styles.commodityName}>{row.commodityName}</span>
      ),
    },
    {
      key: 'chamber',
      header: 'Chamber',
      render: (row) => (
        <span className={styles.chamberCell}>
          Ch {row.chamber}
        </span>
      ),
    },
    {
      key: 'rentType',
      header: 'Rent Type',
      render: (row) => (
        <div className={styles.rentTypeGroup}>
          <Badge variant="neutral">{row.rentType}</Badge>
        </div>
      ),
    },
    {
      key: 'mark',
      header: 'Mark',
      render: (row) => {
        const { primaryMark, partyMarkSub } = getEligibleGrnMarks(row);
        return (
          <div className={styles.markCell}>
            <span className={styles.storageMark}>{primaryMark}</span>
            {partyMarkSub && (
              <span className={styles.partyMarkSub}>Party: {partyMarkSub}</span>
            )}
          </div>
        );
      },
    },
    {
      key: 'availableStock',
      header: 'Available Stock',
      align: 'right',
      render: (row) => {
        const availableBags = getAvailableStockBags(row);
        return (
          <div className={styles.stockCell}>
            <span className={styles.stockQuantity}>
              {availableBags.toLocaleString('en-IN')} bags
            </span>
            {row.bagType && (
              <span className={styles.bagTypeSub}>
                {row.bagType}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: 'Action',
      align: 'right',
      render: (row) => {
        const isLoanHold = row.loanStatus === 'TAKEN';
        return (
          <div className={styles.actionsCell}>
            <Button
              id={`outward-grn-select-${row.id}`}
              type="button"
              variant={isLoanHold ? 'danger' : 'primary'}
              size="sm"
              disabled={isLoanHold}
              onClick={(e) => {
                e.stopPropagation();
                onSelectGrn(row.id);
              }}
              aria-label={`Issue outward delivery for GRN ${row.grnNumber}`}
            >
              {isLoanHold ? 'Loan Hold' : 'Outward →'}
            </Button>
          </div>
        );
      },
    },
  ];
}
