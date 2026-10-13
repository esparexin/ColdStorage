'use client';

import React from 'react';
import { calculateHamaliAmount } from '@cold-storage/contracts';
import { Input } from '@/components/ui';

interface MergeHamaliFieldsProps {
  hamaliBags: number | '';
  totalSourceBags: number;
  hamaliRate: number;
  submitting: boolean;
  onChange: (val: number | '') => void;
}

/**
 * Repack/rebag hamali selection (Phase 5). Charge applies only to the
 * explicitly selected bags at the destination's historical rate; blank/0
 * means carry-only with no new charge. Display-only preview, never billed here.
 */
export function MergeHamaliFields({ hamaliBags, totalSourceBags, hamaliRate, submitting, onChange }: MergeHamaliFieldsProps) {
  const selected = typeof hamaliBags === 'number' && Number.isInteger(hamaliBags) ? hamaliBags : 0;
  const preview = calculateHamaliAmount(selected, hamaliRate);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
      <Input
        id="hamali-bags" type="number" min={0} max={totalSourceBags}
        placeholder="Repacked bags charged hamali (0 = carry only)"
        aria-label="Repacked bags charged hamali" value={hamaliBags}
        onChange={(e) => onChange(e.target.value !== '' ? parseInt(e.target.value, 10) : '')}
        disabled={submitting}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', padding: '2px 0' }}>
        <span>Hamali: <strong>₹{preview.toLocaleString('en-IN')}</strong> ({selected} bags @ ₹{hamaliRate}/bag)</span>
        <span style={{ color: 'var(--color-text-muted)' }}>Carry-only when 0</span>
      </div>
    </div>
  );
}
