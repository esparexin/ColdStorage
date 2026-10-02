'use client';

import React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Printer,
} from 'lucide-react';
import type { Grn } from '@cold-storage/contracts';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import styles from '../page.module.css';

interface GrnTableProps {
  grns: Grn[];
  caption: string;
  canPrint: boolean;
  canAllocate: boolean;
  printingId: string | null;
  onSelectGrn: (grn: Grn) => void;
  onPrint: (type: 'grn' | 'receipt', grnId: string) => void;
}

export function GrnTable({
  grns,
  caption,
  canPrint,
  canAllocate,
  printingId,
  onSelectGrn,
  onPrint,
}: GrnTableProps) {
  const columns: DataTableColumn<Grn>[] = [
    {
      key: 'grnNumber',
      header: 'GRN / Receipt #',
      render: (row) => (
        <div className={styles.grnCell}>
          <span className={styles.grnNumber}>{row.grnNumber}</span>
          <span className={styles.receiptNumber}>Receipt: {row.inwardReceiptNumber}</span>
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
      render: (row) => <span>{row.customerName}</span>,
    },
    {
      key: 'commodityName',
      header: 'Commodity & Chamber',
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span>{row.commodityName}</span>
          <span className={styles.tagChamber}>Chamber {row.chamberNumber}</span>
        </div>
      ),
    },
    {
      key: 'bags',
      header: 'Bags & Type',
      align: 'right',
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
          <span style={{ fontWeight: 600 }}>{row.bags.toLocaleString('en-IN')} bags</span>
          <span className={styles.tagBagType}>Type: {row.bagType}</span>
          {row.authoritativeWeight && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              {row.authoritativeWeight} kg
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'rent',
      header: 'Rent Terms',
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span>
            {row.rentType}
            {row.rentType === 'Monthly' && row.rentMonths ? ` (${row.rentMonths}m)` : ''}
          </span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            ₹{row.rentAmount.toLocaleString('en-IN')}
          </span>
        </div>
      ),
    },
    {
      key: 'identifiers',
      header: 'GP / Vehicle',
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: 'var(--text-xs)' }}>
          <span>GP: {row.gpNumber || '—'}</span>
          <span>Veh: {row.vehicleNumber || '—'}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (row) => (
        <span className={row.status === 'OPEN' ? styles.badgeOpen : styles.badgeClosed}>
          {row.status === 'OPEN' ? (
            <>
              <Clock size={12} aria-hidden="true" /> OPEN
            </>
          ) : (
            <>
              <CheckCircle2 size={12} aria-hidden="true" /> CLOSED
            </>
          )}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className={styles.actionGroup}>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={() => onSelectGrn(row)}
            title="View Details"
          >
            <Eye size={13} aria-hidden="true" />
            View
          </button>

          {canPrint && (
            <>
              <button
                type="button"
                className={styles.actionBtnPrimary}
                onClick={() => onPrint('grn', row.id)}
                disabled={printingId === `grn-${row.id}`}
                title="Print Official GRN"
              >
                <Printer size={13} aria-hidden="true" />
                GRN
              </button>
              <button
                type="button"
                className={styles.actionBtnSuccess}
                onClick={() => onPrint('receipt', row.id)}
                disabled={printingId === `receipt-${row.id}`}
                title="Print Farmer Inward Receipt"
              >
                <FileText size={13} aria-hidden="true" />
                Ack
              </button>
            </>
          )}

          {row.status === 'OPEN' && canAllocate && (
            <Link
              href={`/inventory?grnId=${encodeURIComponent(row.id)}`}
              className={styles.actionBtn}
              title="Put Away Bags to Racks/Positions"
            >
              <ArrowRight size={13} aria-hidden="true" />
              Put-Away
            </Link>
          )}
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={grns}
      rowKey={(r) => r.id}
      caption={caption}
    />
  );
}
