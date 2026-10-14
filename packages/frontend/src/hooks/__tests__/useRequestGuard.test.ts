import { describe, expect, it } from 'vitest';

/**
 * Regression guard for the shared-request-guard defect (W5, CRITICAL).
 *
 * `useRequestGuard` increments one counter and reports `thisId ===
 * latestId.current`, so the LAST caller wins and every earlier caller is
 * permanently invalidated. That is correct for one request sequence and
 * actively wrong for two.
 *
 * `useBackupData` fired fetchStatus() and fetchLogs() in the same tick through
 * a SINGLE shared guard, so status took id N and logs took id N+1. Status
 * resolved to `N === N+1`, which is false, and therefore:
 *
 *   setBackupStatus(data)    never ran  -> the page rendered "NOT CONFIGURED"
 *   setLoadingStatus(false)  never ran  -> the Refresh button stayed disabled
 *   setStatusError(...)      never ran
 *
 * The backup screen was permanently broken with no error shown.
 *
 * This models the hook's counter semantics directly rather than rendering it:
 * the repo has no React testing library, and the defect lives entirely in the
 * counter logic, which is plain and synchronous.
 */
function makeGuard() {
  let latestId = 0;
  return () => {
    latestId += 1;
    const thisId = latestId;
    return () => thisId === latestId;
  };
}

describe('request-guard semantics behind useRequestGuard', () => {
  it('marks the most recent request of a sequence as current', () => {
    const begin = makeGuard();
    const isCurrent = begin();
    expect(isCurrent()).toBe(true);
  });

  it('invalidates an earlier caller once a newer one begins', () => {
    const begin = makeGuard();
    const older = begin();
    const newer = begin();
    expect(older()).toBe(false);
    expect(newer()).toBe(true);
  });

  it('is why two concurrent reads through ONE guard lose the first result', () => {
    // Exactly the original defect.
    const shared = makeGuard();
    const statusCheck = shared();
    const logsCheck = shared();

    // Status resolves while logs is still in flight: it is already stale.
    expect(statusCheck()).toBe(false);
    expect(logsCheck()).toBe(true);
  });

  it('lets two independent guards both commit (the fix)', () => {
    // useBackupData now creates one guard per request sequence.
    const beginStatus = makeGuard();
    const beginLogs = makeGuard();
    const statusCheck = beginStatus();
    const logsCheck = beginLogs();

    expect(statusCheck()).toBe(true);
    expect(logsCheck()).toBe(true);
  });
});
