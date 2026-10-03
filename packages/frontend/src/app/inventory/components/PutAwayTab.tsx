'use client';

import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Grn } from '@cold-storage/contracts';
import { Button, Select } from '@/components/ui';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import type { usePutAway } from '../hooks/usePutAway';
import { GrnAllocationStatusCard } from './GrnAllocationStatusCard';
import styles from '../page.module.css';

interface PutAwayTabProps {
  openGrns: Grn[];
  putAway: ReturnType<typeof usePutAway>;
  canAllocate: boolean;
  canPayRent: boolean;
  payLoading: boolean;
  onPayRent: () => void;
}

export function PutAwayTab({ openGrns, putAway, canAllocate, canPayRent, payLoading, onPayRent }: PutAwayTabProps) {
  return (
    <div className={styles.putAwayLayout}>
      {/* Left Sidebar */}
      <div className={styles.grnSidebar}>
        <div className={styles.sidebarHeader}>
          <span>Pending Inward GRNs ({openGrns.length})</span>
        </div>

        {openGrns.length === 0 ? (
          <FeedbackStates.Empty message="No OPEN Goods Receipt Notes requiring allocation." />
        ) : (
          <div className={styles.grnList}>
            {openGrns.map((g) => {
              const isActive = g.id === putAway.selectedGrnId;
              return (
                <button
                  key={g.id}
                  type="button"
                  className={`${styles.grnCard} ${isActive ? styles.grnCardActive : ''}`}
                  onClick={() => putAway.setSelectedGrnId(g.id)}
                >
                  <div className={styles.grnCardTop}>
                    <span className={styles.grnCardNum}>{g.grnNumber}</span>
                    <span className={styles.unallocatedPill}>Chamber {g.chamberNumber}</span>
                  </div>
                  <span className={styles.grnCardCust}>{g.customerName}</span>
                  <div className={styles.grnCardMeta}>
                    <span>{g.commodityName}</span>
                    <span style={{ fontWeight: 600 }}>{g.bags} bags</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Right Work Area */}
      <div className={styles.putAwayWorkArea}>
        {!putAway.selectedGrnId || !putAway.grnSummary ? (
          <FeedbackStates.Empty message="Select an inward GRN from the left list to allocate bags." />
        ) : putAway.loadingGrnDetails ? (
          <FeedbackStates.Loading label="Loading GRN allocation summary..." />
        ) : (
          <>
            <GrnAllocationStatusCard
              grnSummary={putAway.grnSummary}
              pastAllocations={putAway.pastAllocations}
            />

            {putAway.grnSummary.unallocatedBags > 0 && canAllocate && (
              <div className={styles.allocationFormCard}>
                <div className={styles.formHeader}>
                  <h3 className={styles.formSectionTitle}>Allocate Bags to Rack Positions</h3>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    Target Chamber: Chamber {putAway.grnSummary.chamberNumber}
                  </span>
                </div>

                {putAway.rentBlocked ? (
                  <div className={styles.modalError} role="alert">
                    Rent ₹{putAway.rentBlocked.remainingBalance.toLocaleString('en-IN')} pending for{' '}
                    {putAway.rentBlocked.grnNumber}. Complete payment to allocate — you will return here.
                    {canPayRent && (
                      <div style={{ marginTop: 8 }}>
                        <Button variant="primary" onClick={onPayRent} disabled={payLoading} isLoading={payLoading}>
                          {payLoading ? 'Loading rent account...' : 'Pay rent now'}
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  putAway.allocError && <div className={styles.modalError}>{putAway.allocError}</div>
                )}

                <form
                  onSubmit={putAway.handlePutAwaySubmit}
                  style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    {putAway.allocRows.map((row) => (
                      <div key={row.id} className={styles.allocRow}>
                        <Select
                          aria-label="Select Rack"
                          className={styles.fieldSelect}
                          required
                          value={row.rackId}
                          onChange={(e) => void putAway.handleAllocRackChange(row.id, e.target.value)}
                        >
                          <option value="">Select Rack</option>
                          {putAway.chamberRacks.map((rk) => (
                            <option key={rk.id} value={rk.id}>
                              Rack {rk.code}
                            </option>
                          ))}
                        </Select>

                        <Select
                          aria-label="Select Level"
                          className={styles.fieldSelect}
                          required
                          disabled={!row.rackId}
                          value={row.levelId}
                          onChange={(e) => void putAway.handleAllocLevelChange(row.id, e.target.value)}
                        >
                          <option value="">Select Level</option>
                          {(putAway.rackLevels[row.rackId] ?? []).map((lvl) => (
                            <option key={lvl.id} value={lvl.id}>
                              Level {lvl.levelNumber} ({lvl.code})
                            </option>
                          ))}
                        </Select>

                        <Select
                          aria-label="Select Position"
                          className={styles.fieldSelect}
                          required
                          disabled={!row.levelId}
                          value={row.positionId}
                          onChange={(e) => putAway.handleAllocPositionChange(row.id, e.target.value)}
                        >
                          <option value="">Select Position</option>
                          {(putAway.levelPositions[row.levelId] ?? []).map((pos) => (
                            <option key={pos.id} value={pos.id}>
                              {pos.code} (Cap: {pos.capacityBags} bags)
                            </option>
                          ))}
                        </Select>

                        <input
                          type="number"
                          aria-label="Bags"
                          className={styles.fieldInput}
                          required
                          min={1}
                          max={putAway.grnSummary?.unallocatedBags ?? 100000}
                          placeholder="Bags"
                          value={row.bags}
                          onChange={(e) => putAway.handleAllocBagsChange(row.id, e.target.value)}
                        />

                        {putAway.allocRows.length > 1 && (
                          <button
                            type="button"
                            className={styles.removeBtn}
                            onClick={() => putAway.handleRemoveAllocRow(row.id)}
                            title="Remove position row"
                          >
                            <Trash2 size={16} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    className={styles.addAllocBtn}
                    onClick={putAway.handleAddAllocRow}
                  >
                    <Plus size={14} aria-hidden="true" />
                    Add Another Position
                  </button>

                  <input aria-label="Optional put-away notes or lot observations"
                    type="text"
                    placeholder="Optional put-away notes or lot observations"
                    className={styles.fieldInput}
                    value={putAway.allocNotes}
                    onChange={(e) => putAway.setAllocNotes(e.target.value)}
                    maxLength={500}
                  />

                  <div className={styles.formFooter}>
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                      Total Allocating:{' '}
                      <span style={{ color: 'var(--color-primary)' }}>
                        {putAway.totalAllocatingBags}
                      </span>{' '}
                      / {putAway.grnSummary.unallocatedBags} bags
                    </span>

                    <Button
                      id="submit-allocation-btn"
                      type="submit"
                      variant="primary"
                      disabled={putAway.allocSubmitting || putAway.totalAllocatingBags <= 0 || !!putAway.rentBlocked}
                      isLoading={putAway.allocSubmitting}
                    >
                      {putAway.rentBlocked
                        ? 'Rent payment required'
                        : putAway.allocSubmitting
                          ? 'Recording Batch...'
                          : 'Confirm Put-Away Allocation'}
                    </Button>
                  </div>
                </form>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
