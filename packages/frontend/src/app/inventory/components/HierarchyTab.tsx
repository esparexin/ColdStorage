'use client';

import React from 'react';
import Link from 'next/link';
import { ExternalLink, Eye } from 'lucide-react';
import { Button } from '@/components/ui';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import type { useStorageHierarchy } from '../hooks/useStorageHierarchy';
import styles from '../page.module.css';

interface HierarchyTabProps {
  hierarchy: ReturnType<typeof useStorageHierarchy>;
  canManageStorage: boolean;
}

export function HierarchyTab({
  hierarchy,
  canManageStorage,
}: HierarchyTabProps) {
  return (
    <div className={styles.tabContent}>
      <div className={styles.hierarchyToolbar}>
        <div className={styles.chamberSelector}>
          <span className={styles.fieldLabel} style={{ marginRight: 'var(--space-2)' }}>
            Chambers:
          </span>
          <div className={styles.chamberPills}>
            {hierarchy.chambers.map((ch) => (
              <button
                key={ch.id}
                type="button"
                className={`${styles.chamberPill} ${hierarchy.activeChamberId === ch.id ? styles.chamberPillActive : ''}`}
                onClick={() => hierarchy.setActiveChamberId(ch.id)}
              >
                Chamber {ch.chamberNumber}
              </button>
            ))}
          </div>
        </div>

        {canManageStorage && (
          <div className={styles.hierarchyActions}>
            <Link href="/storage">
              <Button
                variant="outline"
                size="sm"
                leftIcon={<ExternalLink size={14} aria-hidden="true" />}
              >
                Manage Storage Layout
              </Button>
            </Link>
          </div>
        )}
      </div>

      {hierarchy.loadingHierarchy ? (
        <FeedbackStates.Loading label="Loading physical warehouse hierarchy..." />
      ) : hierarchy.chambers.length === 0 ? (
        <FeedbackStates.Empty message="No active chambers registered in this facility." />
      ) : hierarchy.hierarchyRacks.length === 0 ? (
        <FeedbackStates.Empty message="No active racks installed in this chamber yet." />
      ) : (
        <div className={styles.racksGrid}>
          {hierarchy.hierarchyRacks.map((rack) => (
            <div key={rack.id} className={styles.rackCard}>
              <div className={styles.rackHeader}>
                <span className={styles.rackTitle}>Rack {rack.code}</span>
                <span className={styles.tagMuted}>
                  {(hierarchy.hierarchyLevels[rack.id] ?? []).length} Levels
                </span>
              </div>

              <div className={styles.levelsList}>
                {(hierarchy.hierarchyLevels[rack.id] ?? []).map((lvl) => {
                  const positions = hierarchy.hierarchyPositions[lvl.id] ?? [];
                  return (
                    <div key={lvl.id} className={styles.levelRow}>
                      <div className={styles.levelLabelArea}>
                        <span className={styles.levelNumber}>
                          L{lvl.levelNumber} ({lvl.code})
                        </span>
                      </div>

                      <div className={styles.positionsRow}>
                        {positions.length === 0 ? (
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                            No slots
                          </span>
                        ) : (
                          positions.map((pos) => {
                            return (
                              <button
                                key={pos.id}
                                type="button"
                                className={styles.posSlot}
                                onClick={() => void hierarchy.inspectPositionOccupancy(pos.id)}
                                title={`Pos ${pos.code}: Cap ${pos.capacityBags} bags (Click to inspect)`}
                              >
                                <span className={styles.posCode}>{pos.code}</span>
                                <span className={styles.posBags}>{pos.capacityBags}b</span>
                                <Eye size={10} aria-hidden="true" />
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
