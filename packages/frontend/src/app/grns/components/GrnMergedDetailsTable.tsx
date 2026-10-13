'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { Grn, InternalMovementRecord } from '@cold-storage/contracts';
import { Badge, DataTable, type DataTableColumn } from '@/components/ui';
import { requestWithAuth } from '@/lib/api-client';
import {
  type MergeTableRow,
  mapStructuredMovementsToTableRows,
  parseRemarksToTableRows,
} from './internalMovementNotes.helper';
import styles from './GrnMergedDetailsTable.module.css';

export interface GrnMergedDetailsTableProps {
  currentGrn: Grn;
  allGrns?: Grn[];
}

const columns: DataTableColumn<MergeTableRow>[] = [
  {
    key: 'typeDate',
    header: 'Type & Date',
    render: (row) => (
      <div>
        <Badge variant={row.badgeVariant}>{row.badgeLabel}</Badge>
        <span className={styles.subText}>{row.date}</span>
      </div>
    ),
  },
  {
    key: 'grnRef',
    header: 'GRN # / Ref',
    render: (row) => (
      <div>
        <span className={`${styles.primaryText} ${styles.tabularNum}`}>{row.grnLabel}</span>
        <span className={styles.subText}>{row.refSub}</span>
      </div>
    ),
  },
  {
    key: 'party',
    header: 'Party / Account',
    render: (row) => (
      <div>
        <span className={styles.primaryText}>{row.partyName}</span>
        <span className={styles.subText}>{row.partyMark}</span>
      </div>
    ),
  },
  {
    key: 'storage',
    header: 'Storage Location',
    render: (row) => (
      <div>
        <span className={styles.primaryText}>{row.chamber}</span>
        <span className={styles.subText}>{row.storageMark}</span>
      </div>
    ),
  },
  {
    key: 'bags',
    header: 'Bags & Composition',
    render: (row) => (
      <div style={{ textAlign: 'right' }}>
        <span className={`${styles.primaryText} ${styles.tabularNum}`}>{row.totalBags}</span>
        <span className={styles.subText}>{row.sbDetail}</span>
      </div>
    ),
  },
  {
    key: 'reason',
    header: 'Reason',
    render: (row) => <span className={styles.reasonNote}>{row.reason}</span>,
  },
];

export function GrnMergedDetailsTable({ currentGrn, allGrns = [] }: GrnMergedDetailsTableProps) {
  const [dbMovements, setDbMovements] = useState<InternalMovementRecord[] | null>(null);

  useEffect(() => {
    let active = true;
    if (!currentGrn.facilityId || !currentGrn.id) return;

    requestWithAuth(
      `/api/facilities/${encodeURIComponent(currentGrn.facilityId)}/internal-movements/grn/${encodeURIComponent(currentGrn.id)}`,
    )
      .then(async (res) => {
        if (!active) return;
        if (res.ok) {
          const data = (await res.json()) as { movements?: InternalMovementRecord[] };
          if (Array.isArray(data.movements)) {
            setDbMovements(data.movements);
          }
        }
      })
      .catch(() => {
        // Silently fall back to remarks parsing
      });

    return () => {
      active = false;
    };
  }, [currentGrn.facilityId, currentGrn.id]);

  const rows = useMemo<MergeTableRow[]>(() => {
    if (dbMovements && dbMovements.length > 0) {
      return mapStructuredMovementsToTableRows(dbMovements, currentGrn, allGrns);
    }
    return parseRemarksToTableRows(currentGrn, allGrns);
  }, [dbMovements, currentGrn, allGrns]);

  if (rows.length === 0) return null;

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>Internal Move & Merged Lot History</span>
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        caption="Internal Move & Merged Lot History"
      />
    </div>
  );
}
