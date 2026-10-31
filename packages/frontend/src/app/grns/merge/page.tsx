'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle } from 'lucide-react';
import type { Commodity, Grn, OutwardBagCategory, PaymentMode } from '@cold-storage/contracts';
import { Banner, Button, FeedbackStates } from '@/components/ui';
import { ACCESS_MESSAGES, EMPTY_MESSAGES, ERROR_TITLES, LOADING_LABELS } from '@/components/ui/stateCopy';
import { useFacility } from '@/context/FacilityContext';
import { usePermissions } from '@/hooks/usePermissions';
import { requestWithAuth } from '@/lib/api-client';
import { cachedRequestWithAuth } from '@/lib/api-cache';
import { formatApiErrorMessage, parseApiResponse } from '@/lib/api-response';
import { InternalMovementMergeTab } from '../components/InternalMovementMergeTab';
import { buildMergePayload } from '../components/internalMovementPayload.helper';
import { findForwardMergeTarget } from '../components/mergeEligibility.helper';
import styles from './page.module.css';

function MergeScreenContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedFacilityId, availableFacilities } = useFacility();
  const { hasPermission } = usePermissions();
  const canMerge = hasPermission('grn:correct');

  const [grns, setGrns] = useState<Grn[]>([]);
  const [commodities, setCommodities] = useState<Commodity[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mergedTarget, setMergedTarget] = useState<Grn | null>(null);

  const fetchMergeData = useCallback(async () => {
    if (!selectedFacilityId || !canMerge) return;
    setLoading(true);
    setError(null);
    try {
      const [grnRes, commRes] = await Promise.all([
        requestWithAuth(`/api/facilities/${encodeURIComponent(selectedFacilityId)}/grns?status=OPEN&limit=100`),
        cachedRequestWithAuth('/api/commodities'),
      ]);
      const [grnData, commData] = await Promise.all([
        parseApiResponse<{ items?: Grn[]; grns?: Grn[] }>(grnRes),
        parseApiResponse<{ items?: Commodity[]; commodities?: Commodity[] }>(commRes),
      ]);
      if (!grnData.ok) throw new Error(formatApiErrorMessage(grnData));
      const loadedGrns = grnData.data.items ?? grnData.data.grns ?? [];
      setGrns(loadedGrns);
      if (commData.ok) {
        setCommodities(commData.data.items ?? commData.data.commodities ?? []);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load GRNs for merge');
    } finally {
      setLoading(false);
    }
  }, [selectedFacilityId, canMerge]);

  useEffect(() => { void fetchMergeData(); }, [fetchMergeData]);

  const targetIdParam = searchParams.get('targetId');
  const sourceIdParam = searchParams.get('sourceId');

  const initialTargetGrn = React.useMemo(() => {
    if (targetIdParam) {
      const found = grns.find((g) => g.id === targetIdParam);
      if (found) return found;
    }
    if (sourceIdParam) {
      const sourceGrn = grns.find((g) => g.id === sourceIdParam);
      if (sourceGrn) {
        const forwardTarget = findForwardMergeTarget(sourceGrn, grns);
        if (forwardTarget) return forwardTarget;
      }
    }
    return grns[0] ?? null;
  }, [grns, targetIdParam, sourceIdParam]);

  const handleExecuteMerge = async (
    targetGrnId: string, sourceGrnIds: string[], reason: string, remarks?: string,
    movementDate?: string, additionalRentAmount?: number, repackedSmallBags?: number,
    repackedBigBags?: number, referenceWeight?: number, sourcePaymentAmount?: number,
    sourcePaymentMode?: PaymentMode, sourceBagCategory?: OutwardBagCategory,
    sourceQuantity?: number, sourceBagPrice?: number, sourceSeasonalBagPrice?: number,
    sourceMonthlyBagPrice?: number, isRepackSelected?: boolean, repackedBagCount?: number,
    destinationChamber?: string,
  ) => {
    if (!selectedFacilityId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(selectedFacilityId)}/internal-movements/merge`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            buildMergePayload(
              targetGrnId, sourceGrnIds, reason, remarks, movementDate, additionalRentAmount,
              repackedSmallBags, repackedBigBags, referenceWeight, sourcePaymentAmount, sourcePaymentMode,
              sourceBagCategory, sourceQuantity, sourceBagPrice, sourceSeasonalBagPrice, sourceMonthlyBagPrice,
              isRepackSelected, repackedBagCount,
              destinationChamber,
            ),
          ),
        },
      );
      const parsed = await parseApiResponse<{ targetGrn?: Grn }>(res);
      if (!parsed.ok || !parsed.data.targetGrn) {
        throw new Error(parsed.ok ? 'GRN Merge failed' : formatApiErrorMessage(parsed));
      }
      setMergedTarget(parsed.data.targetGrn);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Internal Movement Merge failed');
    } finally {
      setSubmitting(false);
    }
  };

  const currentFacilityName = availableFacilities.find((f) => f.id === selectedFacilityId)?.name || 'Facility';

  if (!canMerge) {
    return (
      <div className={styles.page}>
        <FeedbackStates.Error title={ERROR_TITLES.accessRestricted} message={ACCESS_MESSAGES.grnStock} />
      </div>
    );
  }

  if (!selectedFacilityId) {
    return (
      <div className={styles.page}>
        <FeedbackStates.Empty message={EMPTY_MESSAGES.noFacilityGrns} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.titleArea}>
          <h1 className={styles.pageTitle}>Merge into Existing GRN</h1>
          <span className={styles.pageSubtitle}>
            Consolidate multiple open source lots into a surviving target GRN ({currentFacilityName})
          </span>
        </div>
        <div className={styles.headerActions}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/grns')}
            leftIcon={<ArrowLeft size={14} aria-hidden="true" />}
          >
            Back to Inward of Goods
          </Button>
        </div>
      </div>

      {error && <Banner message={error} />}

      {loading ? (
        <FeedbackStates.Loading label={LOADING_LABELS.grns} />
      ) : mergedTarget ? (
        <div className={styles.successCard}>
          <div className={styles.successHeader}>
            <CheckCircle size={20} aria-hidden="true" />
            <span>GRN Merge Successfully Executed!</span>
          </div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
            Source batches have been consolidated into surviving GRN <strong>{mergedTarget.grnNumber}</strong>.
          </p>
          <div className={styles.successDetails}>
            <div><span>Customer: </span><strong>{mergedTarget.customerName}</strong></div>
            <div><span>Commodity: </span><strong>{mergedTarget.commodityName} (Chamber {mergedTarget.chamber})</strong></div>
            <div><span>Consolidated Remaining Bags: </span><strong>{mergedTarget.closingBags ?? mergedTarget.bags} Bags</strong></div>
            <div><span>Resulting Bag Type: </span><strong>{mergedTarget.bagType}</strong></div>
            <div><span>Updated Rent Obligation: </span><strong>₹{(mergedTarget.rentAmount ?? 0).toLocaleString('en-IN')}</strong></div>
          </div>
          <div className={styles.successActions}>
            <Button
              variant="primary"
              onClick={() => router.push(`/grns?selectedGrnId=${encodeURIComponent(mergedTarget.id)}`)}
            >
              View Surviving GRN in Inward
            </Button>
            <Button
              variant="outline"
              onClick={() => { setMergedTarget(null); void fetchMergeData(); }}
            >
              Perform Another Merge
            </Button>
          </div>
        </div>
      ) : grns.length < 2 || !initialTargetGrn ? (
        <FeedbackStates.Empty
          message="At least two open Inward of Goods (GRNs) in this facility are required to perform a merge."
          action={{ label: 'Back to Inward of Goods', onClick: () => router.push('/grns') }}
        />
      ) : (
        <div className={styles.mergeContainer}>
          <InternalMovementMergeTab
            currentGrn={initialTargetGrn}
            facilityId={selectedFacilityId}
            allGrns={grns}
            commodities={commodities}
            submitting={submitting}
            initiatingGrnId={sourceIdParam ?? undefined}
            onExecuteMerge={handleExecuteMerge}
          />
        </div>
      )}
    </div>
  );
}

export default function GrnMergePage() {
  return (
    <Suspense fallback={<FeedbackStates.Loading label={LOADING_LABELS.grns} />}>
      <MergeScreenContent />
    </Suspense>
  );
}
