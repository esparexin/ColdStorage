'use client';

import React, { useEffect, useState } from 'react';
import type { Grn, RentSummaryDto } from '@cold-storage/contracts';
import { Badge } from '@/components/ui';
import { requestWithAuth } from '@/lib/api-client';
import styles from './InternalMovementModal.module.css';

interface MergeRentAssessmentProps {
  facilityId: string;
  sources: Grn[];
  submitting: boolean;
  acknowledged: boolean;
  onAcknowledgedChange: (v: boolean) => void;
  onPendingChange: (pending: number) => void;
}

/**
 * Pre-execution rent assessment for Internal Move. Reads the existing
 * single-GRN rent summary API (same source as useRentGate) per selected
 * source. Display only: the backend revalidates balance, obligation, payment
 * state, and availability at execution, so stale figures can never authorize
 * the operation.
 */
export function MergeRentAssessment({ facilityId, sources, submitting, acknowledged, onAcknowledgedChange, onPendingChange }: MergeRentAssessmentProps) {
  const [summaries, setSummaries] = useState<Record<string, RentSummaryDto | null>>({});
  const [loading, setLoading] = useState(false);
  const ids = sources.map((s) => s.id).join(',');

  useEffect(() => {
    let active = true;
    if (sources.length === 0) { setSummaries({}); return; }
    setLoading(true);
    void Promise.all(
      sources.map(async (s): Promise<[string, RentSummaryDto | null]> => {
        try {
          const res = await requestWithAuth(
            `/api/facilities/${encodeURIComponent(facilityId)}/rent/grn/${encodeURIComponent(s.id)}`,
          );
          if (!res.ok) return [s.id, null];
          return [s.id, (await res.json()) as RentSummaryDto];
        } catch {
          return [s.id, null];
        }
      }),
    ).then((entries) => {
      if (!active) return;
      setSummaries(Object.fromEntries(entries));
      setLoading(false);
    });
    return () => { active = false; };
    // `ids` stands in for the source set; facilityId is stable per modal.
  }, [ids, facilityId]);

  const rows = sources.map((s) => ({ grn: s, summary: summaries[s.id] ?? null }));
  const aggregatePending = rows.reduce((acc, r) => acc + (r.summary?.remainingBalance ?? 0), 0);

  useEffect(() => {
    onPendingChange(aggregatePending);
  }, [aggregatePending]);

  if (sources.length === 0) return null;

  return (
    <div style={{ borderTop: '1px dashed var(--color-border)', paddingTop: 'var(--space-1)', marginTop: '4px' }}>
      <div style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)', marginBottom: '4px' }}>
        Source Rent Assessment {loading ? '(loading…)' : `(Pending: ₹${aggregatePending.toLocaleString('en-IN')})`}
      </div>
      {rows.map(({ grn, summary }) => (
        <div key={grn.id} className={styles.detailRow}>
          <span className={styles.detailLabel}>{grn.grnNumber}:</span>
          <span className={styles.detailValue} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            {summary ? (
              <>
                <span>Obligation ₹{summary.rentAmount.toLocaleString('en-IN')} · Paid ₹{summary.totalPaid.toLocaleString('en-IN')} · Due ₹{summary.remainingBalance.toLocaleString('en-IN')}</span>
                <Badge variant={summary.remainingBalance > 0 ? 'warning' : 'success'}>{summary.paymentStatus}</Badge>
              </>
            ) : (
              <span style={{ color: 'var(--color-text-muted)' }}>{loading ? 'Loading…' : 'Unavailable — revalidated at execution'}</span>
            )}
          </span>
        </div>
      ))}
      {aggregatePending > 0 && (
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: 'var(--text-xs)', cursor: 'pointer', marginTop: '4px' }}>
          <input type="checkbox" checked={acknowledged} onChange={(e) => onAcknowledgedChange(e.target.checked)} disabled={submitting} />
          <span>I have reviewed the outstanding dues above (informational — amounts are revalidated at execution).</span>
        </label>
      )}
      <div className={styles.noticeBox} style={{ marginTop: '4px' }}>
        Figures refresh from rent records on selection change; execution recomputes everything — stale figures cannot authorize this move.
      </div>
    </div>
  );
}
