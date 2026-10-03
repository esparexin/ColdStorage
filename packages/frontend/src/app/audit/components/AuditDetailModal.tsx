'use client';

import React from 'react';
import type { AuditLogRecord } from '@cold-storage/contracts';
import { Button, Modal } from '@/components/ui';
import styles from '../page.module.css';

interface AuditDetailModalProps {
  log: AuditLogRecord;
  onClose: () => void;
}

export function AuditDetailModal({ log, onClose }: AuditDetailModalProps) {
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Audit Event: ${log.eventType}`}
      size="lg"
      footer={
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
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
    </Modal>
  );
}
