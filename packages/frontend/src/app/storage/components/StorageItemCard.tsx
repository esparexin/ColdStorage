'use client';

import React from 'react';
import { Archive, ChevronRight, Edit3 } from 'lucide-react';
import styles from '../page.module.css';

interface StorageItemCardProps {
  title: string;
  subtitle?: string;
  isActive?: boolean;
  isSelected: boolean;
  onSelect: () => void;
  canManage: boolean;
  onEdit?: () => void;
  onDeactivate?: () => void;
}

export function StorageItemCard({
  title,
  subtitle,
  isActive = true,
  isSelected,
  onSelect,
  canManage,
  onEdit,
  onDeactivate,
}: StorageItemCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={`${styles.itemCard} ${isSelected ? styles.itemCardActive : ''}`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className={styles.itemCardMain}>
        <div className={styles.itemCardTitleRow}>
          <strong>{title}</strong>
          {!isActive && <span className={`${styles.badge} ${styles.badgeInactive}`}>Inactive</span>}
        </div>
        {subtitle && <span className={styles.itemSub}>{subtitle}</span>}
      </div>

      <div className={styles.cardActions}>
        {canManage && (
          <>
            {onEdit && (
              <button
                type="button"
                className={styles.actionIconBtn}
                title={`Edit ${title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
              >
                <Edit3 size={13} />
              </button>
            )}
            {onDeactivate && isActive && (
              <button
                type="button"
                className={`${styles.actionIconBtn} ${styles.actionIconBtnDanger}`}
                title={`Deactivate ${title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onDeactivate();
                }}
              >
                <Archive size={13} />
              </button>
            )}
          </>
        )}
        <ChevronRight size={14} className={styles.itemChevron} />
      </div>
    </div>
  );
}
