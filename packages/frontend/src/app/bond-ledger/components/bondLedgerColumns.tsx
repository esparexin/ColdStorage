import React from 'react';
import { Eye } from 'lucide-react';
import type { Grn } from '@cold-storage/contracts';
import type { DataTableColumn } from '@/components/ui/DataTable';
import { Badge, Button } from '@/components/ui';
import styles from '../page.module.css';

interface CreateBondLedgerColumnsParams {
  onOpenLedger: (grn: Grn) => void;
}

export function createBondLedgerColumns({
  onOpenLedger,
}: CreateBondLedgerColumnsParams): DataTableColumn<Grn>[] {
  return [
    {
      key: 'bondNumber',
      header: 'Bond #',
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-0-5)', fontSize: 'var(--text-xs)' }}>
          {row.bondNumber ? (
            <span style={{ fontWeight: 'var(--font-bold)', color: 'var(--color-primary-text)' }}>
              {row.bondNumber}
            </span>
          ) : (
            <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>
              Standard
            </span>
          )}
          {row.loanBankName && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
              {row.loanBankName}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'grnNumber',
      header: 'GRN #',
      render: (row) => (
        <div className={styles.grnCell}>
          <span className={styles.grnNumber}>{row.grnNumber}</span>
          <span className={styles.dateSub}>
            {new Date(row.date).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          </span>
        </div>
      ),
    },
    {
      key: 'customerName',
      header: 'Customer',
      render: (row) => <span style={{ fontWeight: 'var(--font-medium)' }}>{row.customerName}</span>,
    },
    {
      key: 'commodityName',
      header: 'Commodity',
      render: (row) => row.commodityName,
    },
    {
      key: 'chamber',
      header: 'Chamber',
      render: (row) => <span className={styles.tagChamber}>Chamber {row.chamber}</span>,
    },
    {
      key: 'bags',
      header: 'Inward Bags',
      render: (row) => (
        <div className={styles.bagDetails}>
          <span className={styles.bagTotal}>{row.bags.toLocaleString('en-IN')} Bags</span>
          {(row.smallBags > 0 || row.bigBags > 0) && (
            <span className={styles.bagSub}>
              {row.smallBags.toLocaleString('en-IN')}S / {row.bigBags.toLocaleString('en-IN')}B
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'closingBags',
      header: 'Current Stored',
      render: (row) => {
        const balance = row.closingBags ?? row.bags;
        return (
          <span style={{ fontWeight: 'var(--font-semibold)' }}>
            {balance.toLocaleString('en-IN')} Bags
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Status & Lien',
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', alignItems: 'flex-start' }}>
          <Badge variant={row.status === 'CLOSED' ? 'neutral' : 'warning'}>
            {row.status}
          </Badge>
          {row.loanStatus === 'TAKEN' && (
            <Badge variant="danger">
              Loan Hold
            </Badge>
          )}
          {row.loanStatus === 'CLEARED' && (
            <Badge variant="success">
              Loan Cleared
            </Badge>
          )}
          {row.loanStatus === 'NOT_TAKEN' && (
            <Badge variant="neutral">
              Pledged
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onOpenLedger(row)}
          title={`View Outward Movement Ledger for ${row.bondNumber ? `Bond ${row.bondNumber} (GRN ${row.grnNumber})` : `GRN ${row.grnNumber}`}`}
          aria-label={`View Ledger for ${row.bondNumber ? `Bond ${row.bondNumber}` : `GRN ${row.grnNumber}`}`}
          leftIcon={<Eye size={14} aria-hidden="true" />}
        >
          View
        </Button>
      ),
    },
  ];
}
