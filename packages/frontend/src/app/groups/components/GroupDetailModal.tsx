'use client';

import React, { useEffect, useState } from 'react';
import { ArrowRightLeft, MinusCircle, Plus } from 'lucide-react';
import type { Grn, Group, GroupStockSummary } from '@cold-storage/contracts';
import { Badge, Button, DataTable, FeedbackStates, Modal, StatCard } from '@/components/ui';
import type { DataTableColumn } from '@/components/ui/DataTable';
import { requestWithAuth } from '@/lib/api-client';
import styles from '../page.module.css';

interface GroupDetailModalProps {
  selectedFacilityId: string;
  group: Group;
  canManage: boolean;
  onClose: () => void;
  onAssignMore: () => void;
  onMoveGrn: (grnId: string) => void;
  onRefreshParent: () => void;
}

export function GroupDetailModal({
  selectedFacilityId,
  group,
  canManage,
  onClose,
  onAssignMore,
  onMoveGrn,
  onRefreshParent,
}: GroupDetailModalProps) {
  const [memberGrns, setMemberGrns] = useState<Grn[]>([]);
  const [stockSummary, setStockSummary] = useState<GroupStockSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [unassigningId, setUnassigningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/facilities/${encodeURIComponent(selectedFacilityId)}/groups/${encodeURIComponent(group.id)}`;
      const res = await requestWithAuth(url);
      if (!res.ok) {
        throw new Error(`Failed to load details: ${res.status}`);
      }
      const data = (await res.json()) as {
        stockSummary: GroupStockSummary;
        memberGrns: Grn[];
      };
      setMemberGrns(data.memberGrns ?? []);
      setStockSummary(data.stockSummary ?? null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load group details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchDetails();
  }, [selectedFacilityId, group.id]);

  const handleUnassign = async (grnId: string) => {
    setUnassigningId(grnId);
    setError(null);
    try {
      const url = `/api/facilities/${encodeURIComponent(selectedFacilityId)}/groups/${encodeURIComponent(group.id)}/grns`;
      const res = await requestWithAuth(url, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grnIds: [grnId] }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? 'Unassign failed');
      }
      await fetchDetails();
      onRefreshParent();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to unassign GRN');
    } finally {
      setUnassigningId(null);
    }
  };

  const columns: DataTableColumn<Grn>[] = [
    {
      key: 'grnNumber',
      header: 'GRN #',
      render: (g: Grn) => <strong>{g.grnNumber}</strong>,
    },
    {
      key: 'commodity',
      header: 'Commodity',
      render: (g: Grn) => g.commodityName,
    },
    {
      key: 'chamber',
      header: 'Chamber',
      render: (g: Grn) => g.chamber,
    },
    {
      key: 'inwardBags',
      header: 'Inward Bags',
      render: (g: Grn) => `${g.bags} (${g.smallBags}S / ${g.bigBags}B)`,
    },
    {
      key: 'closingBags',
      header: 'On-Hand Stock',
      render: (g: Grn) => (
        <span style={{ fontWeight: 'var(--font-semibold)' }}>
          {g.closingBags ?? g.bags} bags
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (g: Grn) => (
        <Badge variant={g.status === 'OPEN' ? 'success' : 'neutral'}>
          {g.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (g: Grn) =>
        canManage ? (
          <div className={styles.tableActions}>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onMoveGrn(g.id)}
              aria-label={`Move GRN ${g.grnNumber}`}
              leftIcon={<ArrowRightLeft size={14} aria-hidden="true" />}
            >
              Move
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void handleUnassign(g.id)}
              isLoading={unassigningId === g.id}
              aria-label={`Unassign GRN ${g.grnNumber}`}
              leftIcon={<MinusCircle size={14} aria-hidden="true" />}
            >
              Unassign
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <Modal isOpen onClose={onClose} title={`Group Details: ${group.name}`} size="xl">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {error && <FeedbackStates.Error title="Error" message={error} />}

        <div className={styles.summaryCardsRow}>
          <StatCard
            label="Total On-Hand Stock"
            value={stockSummary ? `${stockSummary.totalBags.toLocaleString()} bags` : '—'}
          />
          <StatCard
            label="Small Bags (S)"
            value={stockSummary ? `${stockSummary.smallBags.toLocaleString()} bags` : '—'}
          />
          <StatCard
            label="Big Bags (B)"
            value={stockSummary ? `${stockSummary.bigBags.toLocaleString()} bags` : '—'}
          />
          <StatCard
            label="Total Member GRNs"
            value={String(memberGrns.length)}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 'var(--text-md)', fontWeight: 'var(--font-semibold)' }}>
              Member Goods Receipt Notes
            </h3>
            {group.customerName && (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                Trader: {group.customerName}
              </span>
            )}
          </div>
          {canManage && (
            <Button
              size="sm"
              variant="primary"
              onClick={onAssignMore}
              leftIcon={<Plus size={16} aria-hidden="true" />}
            >
              Assign GRNs
            </Button>
          )}
        </div>

        {loading ? (
          <FeedbackStates.Loading label="Loading member GRNs…" />
        ) : memberGrns.length === 0 ? (
          <FeedbackStates.Empty message="No GRNs currently assigned to this group." />
        ) : (
          <DataTable<Grn>
            columns={columns}
            rows={memberGrns}
            rowKey={(g) => g.id}
            caption={`Member GRNs for group ${group.name}`}
          />
        )}

        <div className={styles.modalFooter}>
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
