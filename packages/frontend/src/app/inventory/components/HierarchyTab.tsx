'use client';

import React from 'react';
import { Eye, Plus } from 'lucide-react';
import type { PositionOccupancy } from '@cold-storage/contracts';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { requestWithAuth } from '@/lib/api-client';
import type { useStorageHierarchy } from '../hooks/useStorageHierarchy';
import styles from '../page.module.css';

interface HierarchyTabProps {
  hierarchy: ReturnType<typeof useStorageHierarchy>;
  canManageStorage: boolean;
  onOpenAddChamber: () => void;
  onOpenAddRack: (chamberId: string) => void;
  onOpenAddPosition: (levelId: string) => void;
}

export function HierarchyTab({
  hierarchy,
  canManageStorage,
  onOpenAddChamber,
  onOpenAddRack,
  onOpenAddPosition,
}: HierarchyTabProps) {
  const handleInspectPosition = async (posId: string) => {
    try {
      const res = await requestWithAuth(`/api/positions/${encodeURIComponent(posId)}/occupancy`);
      if (res.ok) {
        const data = (await res.json()) as { occupancy: PositionOccupancy };
        hierarchy.setSelectedOccupancy(data.occupancy);
      }
    } catch {
      // Graceful
    }
  };

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
            <button
              type="button"
              className={styles.outlineBtn}
              onClick={onOpenAddChamber}
            >
              <Plus size={14} aria-hidden="true" />
              Add Chamber
            </button>
            {hierarchy.activeChamberId && (
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={() => onOpenAddRack(hierarchy.activeChamberId!)}
              >
                <Plus size={14} aria-hidden="true" />
                Add Rack to Chamber
              </button>
            )}
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
                        {canManageStorage && (
                          <button
                            type="button"
                            className={styles.miniBtn}
                            onClick={() => onOpenAddPosition(lvl.id)}
                            title="Add Position"
                          >
                            <Plus size={10} aria-hidden="true" /> Pos
                          </button>
                        )}
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
                                onClick={() => void handleInspectPosition(pos.id)}
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
