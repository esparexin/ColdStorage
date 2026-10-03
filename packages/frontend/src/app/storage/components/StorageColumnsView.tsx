'use client';

import React from 'react';
import { Boxes, Layers, Package, Plus, Warehouse } from 'lucide-react';
import type { Chamber, Level, Position, Rack } from '@cold-storage/contracts';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import type { ModalType } from '../types';
import { StorageItemCard } from './StorageItemCard';
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
  onEditChamber?: (c: Chamber) => void;
  onDeactivateChamber?: (c: Chamber) => void;
  onEditRack?: (r: Rack) => void;
  onDeactivateRack?: (r: Rack) => void;
  onEditLevel?: (l: Level) => void;
  onDeactivateLevel?: (l: Level) => void;
  onEditPosition?: (p: Position) => void;
  onDeactivatePosition?: (p: Position) => void;
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
  onEditChamber,
  onDeactivateChamber,
  onEditRack,
  onDeactivateRack,
  onEditLevel,
  onDeactivateLevel,
  onEditPosition,
  onDeactivatePosition,
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
              <StorageItemCard
                key={c.id}
                title={`Chamber ${c.chamberNumber}`}
                subtitle={c.name}
                isActive={c.isActive}
                isSelected={selectedChamber?.id === c.id}
                onSelect={() => onSelectChamber(c)}
                canManage={canManage}
                onEdit={onEditChamber ? () => onEditChamber(c) : undefined}
                onDeactivate={onDeactivateChamber ? () => onDeactivateChamber(c) : undefined}
              />
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
              <StorageItemCard
                key={r.id}
                title={`Rack ${r.code}`}
                isActive={r.isActive}
                isSelected={selectedRack?.id === r.id}
                onSelect={() => onSelectRack(r)}
                canManage={canManage}
                onEdit={onEditRack ? () => onEditRack(r) : undefined}
                onDeactivate={onDeactivateRack ? () => onDeactivateRack(r) : undefined}
              />
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
              <StorageItemCard
                key={l.id}
                title={`Level ${l.code}`}
                subtitle={`Tier #${l.levelNumber}`}
                isActive={l.isActive}
                isSelected={selectedLevel?.id === l.id}
                onSelect={() => onSelectLevel(l)}
                canManage={canManage}
                onEdit={onEditLevel ? () => onEditLevel(l) : undefined}
                onDeactivate={onDeactivateLevel ? () => onDeactivateLevel(l) : undefined}
              />
            ))
          )}
        </div>
      </div>

      {/* Tier 4: Positions (Rack Spaces) */}
      <div className={styles.column}>
        <div className={styles.columnHeader}>
          <div className={styles.columnTitle}>
            <Package size={16} />
            <span>Rack Spaces ({positions.length})</span>
          </div>
          {canManage && selectedLevel && (
            <button
              type="button"
              className={styles.columnAddBtn}
              onClick={() => onOpenModal('position')}
              title="Add Rack Space"
            >
              <Plus size={14} />
            </button>
          )}
        </div>
        <div className={styles.itemList}>
          {!selectedLevel ? (
            <FeedbackStates.Empty message="Select a level." />
          ) : loadingPositions ? (
            <FeedbackStates.Loading label="Loading rack spaces..." />
          ) : positions.length === 0 ? (
            <FeedbackStates.Empty message="No rack spaces on this level." />
          ) : (
            positions.map((p) => (
              <StorageItemCard
                key={p.id}
                title={p.code}
                subtitle={`Cap: ${p.capacityBags} bags`}
                isActive={p.isActive}
                isSelected={selectedPosition?.id === p.id}
                onSelect={() => onSelectPosition(p)}
                canManage={canManage}
                onEdit={onEditPosition ? () => onEditPosition(p) : undefined}
                onDeactivate={onDeactivatePosition ? () => onDeactivatePosition(p) : undefined}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
