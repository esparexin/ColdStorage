/**
 * FeedbackStates — Loading, Error, and Empty state presentational components.
 * Presentation-only. No business logic.
 */

import { AlertCircle, Inbox, Loader2 } from 'lucide-react';
import styles from './FeedbackStates.module.css';

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

interface LoadingProps {
  label?: string;
  fullPage?: boolean;
}

function Loading({ label = 'Loading…', fullPage = false }: LoadingProps) {
  return (
    <div
      className={`${styles.feedbackWrapper} ${fullPage ? styles.fullPage : ''}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <Loader2 className={styles.spinner} size={32} aria-hidden="true" />
      <span className={styles.label}>{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

interface ErrorProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

function ErrorState({ title = 'Something went wrong', message, onRetry }: ErrorProps) {
  return (
    <div className={`${styles.feedbackWrapper} ${styles.error}`} role="alert">
      <AlertCircle size={32} className={styles.errorIcon} aria-hidden="true" />
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.message}>{message}</p>
      {onRetry && (
        <button id="retry-button" className={styles.retryBtn} onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty
// ---------------------------------------------------------------------------

interface EmptyProps {
  message?: string;
}

function Empty({ message = 'No data available.' }: EmptyProps) {
  return (
    <div className={styles.feedbackWrapper} role="status">
      <Inbox size={32} className={styles.emptyIcon} aria-hidden="true" />
      <p className={styles.message}>{message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export as namespace
// ---------------------------------------------------------------------------

export const FeedbackStates = { Loading, Error: ErrorState, Empty };
