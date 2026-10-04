'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Unsaved-changes protection.
 *
 * Provides a single `attemptExit` guard for in-application exits plus a `beforeunload` handler
 * so closing the tab or navigating with browser controls is covered too. This logic previously
 * existed only inline in the GRN modal, guarded just its own close button and nothing else.
 */
export interface UseUnsavedChangesResult {
  /** True when there are edits that have not been persisted. */
  isDirty: boolean;
  /** Whether the confirmation dialog is currently showing. */
  isConfirmOpen: boolean;
  /**
   * Call instead of exiting directly. When there are no unsaved changes the supplied exit
   * callback runs immediately; otherwise the confirmation dialog is presented first.
   */
  attemptExit: (onExit: () => void) => void;
  /** Runs the pending exit. Exposed for the dialog's confirm action. */
  confirmExit: () => void;
  /** Dismisses the dialog and stays on the page. */
  cancelExit: () => void;
}

export function useUnsavedChanges(isDirty: boolean): UseUnsavedChangesResult {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const pendingExitRef = useRef<(() => void) | null>(null);

  const confirmExit = useCallback(() => {
    const onExit = pendingExitRef.current;
    pendingExitRef.current = null;
    setIsConfirmOpen(false);
    onExit?.();
  }, []);

  const cancelExit = useCallback(() => {
    pendingExitRef.current = null;
    setIsConfirmOpen(false);
  }, []);

  const attemptExit = useCallback(
    (onExit: () => void) => {
      if (!isDirty) {
        onExit();
        return;
      }
      pendingExitRef.current = onExit;
      setIsConfirmOpen(true);
    },
    [isDirty],
  );

  // Browser-level exits cannot be intercepted with a custom dialog, so the browser's own
  // confirmation is the only available signal. This is a user-initiated navigation prompt, not
  // one of the blocking script dialogs that the architecture boundary rules prohibit.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  return { isDirty, isConfirmOpen, attemptExit, confirmExit, cancelExit };
}