'use client';

import React, { useMemo } from 'react';
import type { RentSummaryDto } from '@cold-storage/contracts';
import { Badge, FeedbackStates, StatCard, StatGrid } from '@/components/ui';
import { Banner } from '@/components/ui/Banner';
import {
  categorizeOutwardBags,
  deriveOutwardPeriodLabel,
  formatOutwardBagBreakdown,
  parseMergedGrnNotes,
  useGrnDeliveries,
} from '../hooks/useGrnDeliveries';
import styles from './RentOutwardHistoryTab.module.css';

interface RentOutwardHistoryTabProps {
  facilityId: string;
  account: RentSummaryDto;
}

export function RentOutwardHistoryTab({ facilityId, account }: RentOutwardHistoryTabProps) {
  const { deliveries, loading, error, metrics } = useGrnDeliveries(facilityId, account.grnId);
  const mergedNotes = useMemo(() => parseMergedGrnNotes(account.remarks), [account.remarks]);

  if (loading) {
    return <FeedbackStates.Loading label="Loading outward rent records..." />;
  }

  if (error) {
    return <Banner message={error} id="outward-history-tab-error" />;
  }

  return (
    <div className={styles.tabContainer}>
      <StatGrid label={`Outward rent summary for ${account.grnNumber}`}>
        <StatCard
          label="Total Outward Rent"
          value={`₹${metrics.totalRent.toLocaleString('en-IN')}`}
          accent="primary"
        />
        <StatCard
          label="Delivered Stock"
          value={`${metrics.totalBags.toLocaleString('en-IN')} bags`}
          accent="success"
        />
        <StatCard
          label="Bag Category Mix"
          value={`${metrics.smallBags.toLocaleString('en-IN')} S · ${metrics.bigBags.toLocaleString('en-IN')} B`}
        />
      </StatGrid>

      {mergedNotes.length > 0 && (
        <div className={styles.mergeSection}>
          <div className={styles.sectionHeader}>
            <p className={styles.sectionLabel}>
              Internal Movements & Seasonal Continuity ({mergedNotes.length})
            </p>
          </div>
          <div className={styles.outwardList}>
            {mergedNotes.map((note) => (
              <div key={note.id} className={styles.outwardCard}>
                <div className={styles.cardLeft}>
                  <div className={styles.cardHead}>
                    <strong className={styles.challanRef}>{note.title}</strong>
                    <Badge variant="success">Seasonal Continuity</Badge>
                    <Badge variant="neutral">{note.date}</Badge>
                  </div>
                  <span className={styles.cardMeta}>
                    <span>+{note.bags.toLocaleString('en-IN')} bags</span>
                    {note.repackedDetail && <span>({note.repackedDetail})</span>}
                    <span>•</span>
                    <span>From: {note.source}</span>
                    {note.carriedRent > 0 && (
                      <span>• Carried Rent: ₹{note.carriedRent.toLocaleString('en-IN')}</span>
                    )}
                  </span>
                  <span className={styles.cardNotes}>
                    Reason: {note.reason} · Absorbed into existing season without duplicate rent billing.
                  </span>
                </div>
                <div className={styles.cardRight}>
                  <strong className={styles.rentAmount}>
                    {note.carriedRent > 0 ? `+₹${note.carriedRent.toLocaleString('en-IN')}` : '₹0'}
                  </strong>
                  <span className={styles.rentFormula}>
                    {note.carriedRent > 0 ? 'Carried Pending Rent' : 'Continuous Season'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={styles.sectionHeader}>
        <p className={styles.sectionLabel}>
          Outward Transactions & Bag Breakdown ({deliveries.length})
        </p>
      </div>

      {deliveries.length === 0 ? (
        <FeedbackStates.Empty message="No outward transactions recorded for this lot yet. Outward rent will be calculated automatically upon dispatch." />
      ) : (
        <div className={styles.outwardList}>
          {deliveries.map((d) => {
            const category = categorizeOutwardBags(d.smallBags, d.bigBags);
            const periodLabel = deriveOutwardPeriodLabel(account.inwardDate, d.date);
            const isReversed = d.status === 'REVERSED';

            return (
              <div key={d.id} className={styles.outwardCard}>
                <div className={styles.cardLeft}>
                  <div className={styles.cardHead}>
                    <strong className={styles.challanRef}>{d.challanNumber}</strong>
                    {d.gpNumber && <span className={styles.gpTag}>Gate Pass: {d.gpNumber}</span>}
                    <Badge variant={category === 'Small' ? 'primary' : category === 'Big' ? 'warning' : 'neutral'}>
                      {category} Bags
                    </Badge>
                    <Badge variant="neutral">{periodLabel}</Badge>
                    <Badge variant={isReversed ? 'danger' : 'success'}>
                      {d.status}
                    </Badge>
                  </div>

                  <span className={styles.cardMeta}>
                    <span>{formatOutwardBagBreakdown(d.smallBags, d.bigBags)}</span>
                    <span>•</span>
                    <span>Dispatched on {new Date(d.date).toLocaleDateString('en-IN')}</span>
                    {d.issuedBy && <span>• by {d.issuedBy}</span>}
                  </span>

                  {(d.remarks || d.vehicleNumber) && (
                    <span className={styles.cardNotes}>
                      {d.vehicleNumber ? `Vehicle: ${d.vehicleNumber}` : ''}
                      {d.vehicleNumber && d.remarks ? ' · ' : ''}
                      {d.remarks ? `Remarks: ${d.remarks}` : ''}
                    </span>
                  )}
                </div>

                <div className={styles.cardRight}>
                  <strong className={styles.rentAmount}>
                    ₹{(d.rentCharge ?? 0).toLocaleString('en-IN')}
                  </strong>
                  <span className={styles.rentFormula}>
                    {isReversed ? 'Reversed / Voided' : 'Calculated at Outward'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
