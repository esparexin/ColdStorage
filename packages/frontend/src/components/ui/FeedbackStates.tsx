/**
 * FeedbackStates — Loading, Error, and Empty state presentational components.
 * Presentation-only. No business logic.
 */

import { AlertCircle, Inbox, Loader2 } from 'lucide-react';
import { Button } from './Button';
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
      <Loader2 className={styles.spinner} size={20} aria-hidden="true" />
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
      <AlertCircle size={20} className={styles.errorIcon} aria-hidden="true" />
      {title && <h3 className={styles.title}>{title}</h3>}
      <p className={styles.message}>{message}</p>
      {onRetry && (
        <Button id="retry-button" variant="primary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty
// ---------------------------------------------------------------------------

interface EmptyProps {
  message?: string;
  action?: {
    label: string;
    onClick: () => void;
    id?: string;
  };
}

function Empty({ message = 'No data available.', action }: EmptyProps) {
  return (
    <div className={styles.feedbackWrapper} role="status">
      <Inbox size={32} className={styles.emptyIcon} aria-hidden="true" />
      <p className={styles.message}>{message}</p>
      {action && (
        <Button
          id={action.id ?? 'empty-state-action'}
          variant="secondary"
          size="sm"
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export as namespace
// ---------------------------------------------------------------------------

export const FeedbackStates = { Loading, Error: ErrorState, Empty };
