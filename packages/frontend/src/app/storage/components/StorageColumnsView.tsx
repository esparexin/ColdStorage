'use client';

import React from 'react';
import { Boxes, ChevronRight, Layers, Package, Plus, Warehouse } from 'lucide-react';
import type { Chamber, Level, Position, Rack } from '@cold-storage/contracts';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import type { ModalType } from '../types';
import styles from '../page.module.css';

interface StorageColumnsViewProps {
  chambers: Chamber[];
  selectedChamber: Chamber | null;
  onSelectChamber: (c: Chamber) => void;
  racks: Rack[];
  selectedRack: Rack | null;
  onSelectRack: (r: Rack) => void;
  levels: Level[];
  selectedLevel: Level | null;
  onSelectLevel: (l: Level) => void;
  positions: Position[];
  selectedPosition: Position | null;
  onSelectPosition: (p: Position) => void;
  canManage: boolean;
  onOpenModal: (type: ModalType) => void;
  loadingChambers: boolean;
  loadingRacks: boolean;
  loadingLevels: boolean;
  loadingPositions: boolean;
}

export function StorageColumnsView({
  chambers,
  selectedChamber,
  onSelectChamber,
  racks,
  selectedRack,
  onSelectRack,
  levels,
  selectedLevel,
  onSelectLevel,
  positions,
  selectedPosition,
  onSelectPosition,
  canManage,
  onOpenModal,
  loadingChambers,
  loadingRacks,
  loadingLevels,
  loadingPositions,
}: StorageColumnsViewProps) {
  return (
    <div className={styles.explorerGrid}>
      {/* Tier 1: Chambers */}
      <div className={styles.column}>
        <div className={styles.columnHeader}>
          <div className={styles.columnTitle}>
            <Warehouse size={16} />
            <span>Chambers ({chambers.length})</span>
          </div>
          {canManage && (
            <button
              type="button"
              className={styles.columnAddBtn}
              onClick={() => onOpenModal('chamber')}
              title="Add Chamber"
            >
              <Plus size={14} />
            </button>
          )}
        </div>
        <div className={styles.itemList}>
          {loadingChambers ? (
            <FeedbackStates.Loading label="Loading chambers..." />
          ) : chambers.length === 0 ? (
            <FeedbackStates.Empty message="No chambers found." />
          ) : (
            chambers.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`${styles.itemCard} ${selectedChamber?.id === c.id ? styles.itemCardActive : ''}`}
                onClick={() => onSelectChamber(c)}
              >
                <div className={styles.itemCardMain}>
                  <strong>Chamber {c.chamberNumber}</strong>
                  {c.name && <span className={styles.itemSub}>{c.name}</span>}
                </div>
                <ChevronRight size={14} />
              </button>
            ))
          )}
        </div>
      </div>

      {/* Tier 2: Racks */}
      <div className={styles.column}>
        <div className={styles.columnHeader}>
          <div className={styles.columnTitle}>
            <Boxes size={16} />
            <span>Racks ({racks.length})</span>
          </div>
          {canManage && selectedChamber && (
            <button
              type="button"
              className={styles.columnAddBtn}
              onClick={() => onOpenModal('rack')}
              title="Add Rack"
            >
              <Plus size={14} />
            </button>
          )}
        </div>
        <div className={styles.itemList}>
          {!selectedChamber ? (
            <FeedbackStates.Empty message="Select a chamber." />
          ) : loadingRacks ? (
            <FeedbackStates.Loading label="Loading racks..." />
          ) : racks.length === 0 ? (
            <FeedbackStates.Empty message="No racks in this chamber." />
          ) : (
            racks.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`${styles.itemCard} ${selectedRack?.id === r.id ? styles.itemCardActive : ''}`}
                onClick={() => onSelectRack(r)}
              >
                <div className={styles.itemCardMain}>
                  <strong>Rack {r.code}</strong>
                </div>
                <ChevronRight size={14} />
              </button>
            ))
          )}
        </div>
      </div>

      {/* Tier 3: Levels */}
      <div className={styles.column}>
        <div className={styles.columnHeader}>
          <div className={styles.columnTitle}>
            <Layers size={16} />
            <span>Levels ({levels.length})</span>
          </div>
          {canManage && selectedRack && (
            <button
              type="button"
              className={styles.columnAddBtn}
              onClick={() => onOpenModal('level')}
              title="Add Level"
            >
              <Plus size={14} />
            </button>
          )}
        </div>
        <div className={styles.itemList}>
          {!selectedRack ? (
            <FeedbackStates.Empty message="Select a rack." />
          ) : loadingLevels ? (
            <FeedbackStates.Loading label="Loading levels..." />
          ) : levels.length === 0 ? (
            <FeedbackStates.Empty message="No levels in this rack." />
          ) : (
            levels.map((l) => (
              <button
                key={l.id}
                type="button"
                className={`${styles.itemCard} ${selectedLevel?.id === l.id ? styles.itemCardActive : ''}`}
                onClick={() => onSelectLevel(l)}
              >
                <div className={styles.itemCardMain}>
                  <strong>Level {l.code}</strong>
                  <span className={styles.itemSub}>Tier #{l.levelNumber}</span>
                </div>
                <ChevronRight size={14} />
              </button>
            ))
          )}
        </div>
      </div>

      {/* Tier 4: Positions */}
      <div className={styles.column}>
        <div className={styles.columnHeader}>
          <div className={styles.columnTitle}>
            <Package size={16} />
            <span>Positions ({positions.length})</span>
          </div>
          {canManage && selectedLevel && (
            <button
              type="button"
              className={styles.columnAddBtn}
              onClick={() => onOpenModal('position')}
              title="Add Position"
            >
              <Plus size={14} />
            </button>
          )}
        </div>
        <div className={styles.itemList}>
          {!selectedLevel ? (
            <FeedbackStates.Empty message="Select a level." />
          ) : loadingPositions ? (
            <FeedbackStates.Loading label="Loading positions..." />
          ) : positions.length === 0 ? (
            <FeedbackStates.Empty message="No positions on this level." />
          ) : (
            positions.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`${styles.itemCard} ${selectedPosition?.id === p.id ? styles.itemCardActive : ''}`}
                onClick={() => onSelectPosition(p)}
              >
                <div className={styles.itemCardMain}>
                  <strong>{p.code}</strong>
                  <span className={styles.itemSub}>Cap: {p.capacityBags} bags</span>
                </div>
                <ChevronRight size={14} />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
