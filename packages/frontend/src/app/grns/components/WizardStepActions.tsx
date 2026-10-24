'use client';

import React from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui';
import styles from './InternalMovementModal.module.css';

interface WizardStepActionsProps {
  onBack?: () => void;
  backLabel?: string;
  onNext?: () => void;
  nextLabel?: string;
  isSubmitStep?: boolean;
  submitLabel?: string;
  submitting?: boolean;
  disabled?: boolean;
  submitFormId?: string;
  stepInfoText?: string;
}

export function WizardStepActions({
  onBack,
  backLabel = 'Back',
  onNext,
  nextLabel = 'Next',
  isSubmitStep = false,
  submitLabel = 'Submit',
  submitting = false,
  disabled = false,
  submitFormId,
  stepInfoText,
}: WizardStepActionsProps) {
  return (
    <div className={styles.stepActions}>
      {onBack ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onBack}
          disabled={submitting || disabled}
          leftIcon={<ArrowLeft size={14} aria-hidden="true" />}
        >
          ← {backLabel}
        </Button>
      ) : (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
          {stepInfoText ?? ''}
        </div>
      )}

      {isSubmitStep ? (
        <Button
          type="submit"
          form={submitFormId}
          variant="primary"
          size="sm"
          isLoading={submitting}
          disabled={submitting || disabled}
          leftIcon={<CheckCircle2 size={15} aria-hidden="true" />}
        >
          {submitLabel}
        </Button>
      ) : (
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={onNext}
          disabled={submitting || disabled}
          rightIcon={<ArrowRight size={14} aria-hidden="true" />}
        >
          {nextLabel} →
        </Button>
      )}
    </div>
  );
}
