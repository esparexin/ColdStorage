'use client';

import React from 'react';
import { X } from 'lucide-react';
import type { AuditLogRecord } from '@cold-storage/contracts';
import styles from '../page.module.css';

interface AuditDetailModalProps {
  log: AuditLogRecord;
  onClose: () => void;
}

export function AuditDetailModal({ log, onClose }: AuditDetailModalProps) {
  return (
    <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>
            Audit Event: {log.eventType}
          </h2>
          <button
            type="button"
            className={styles.modalClose}
            onClick={onClose}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className={styles.modalBody}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', fontSize: 'var(--text-xs)' }}>
            <div>
              <strong>Timestamp:</strong> {new Date(log.timestamp).toISOString()}
            </div>
            <div>
              <strong>Severity:</strong> {log.severity}
            </div>
            <div>
              <strong>User:</strong> {log.username} ({log.userId})
            </div>
            <div>
              <strong>Role:</strong> {log.userRole}
            </div>
            <div>
              <strong>IP Address:</strong> {log.ipAddress}
            </div>
            <div>
              <strong>Facility:</strong> {log.facilityId || 'Global'}
            </div>
          </div>

          <div>
            <strong style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase' }}>
              Event Details Payload:
            </strong>
            <pre className={styles.jsonBox}>
              {JSON.stringify(log.details, null, 2)}
            </pre>
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
