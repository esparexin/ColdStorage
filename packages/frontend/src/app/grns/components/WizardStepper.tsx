'use client';

import React from 'react';
import { Button } from '@/components/ui';
import styles from './InternalMovementModal.module.css';

export interface WizardStepDef {
  number: number;
  label: string;
}

interface WizardStepperProps {
  steps: WizardStepDef[];
  currentStep: number;
  onStepClick: (stepNumber: number) => void;
  canNavigateToStep?: (stepNumber: number) => boolean;
  disabled?: boolean;
}

export function WizardStepper({
  steps,
  currentStep,
  onStepClick,
  canNavigateToStep,
  disabled = false,
}: WizardStepperProps) {
  return (
    <nav className={styles.stepper} role="navigation" aria-label="Wizard Steps">
      {steps.map((s) => {
        const isActive = s.number === currentStep;
        const isCompleted = s.number < currentStep;
        const isClickable = !disabled && (canNavigateToStep ? canNavigateToStep(s.number) : true);

        return (
          <Button
            key={s.number}
            type="button"
            variant="ghost"
            size="sm"
            className={`${styles.stepItem} ${isActive ? styles.stepItemActive : isCompleted ? styles.stepItemCompleted : ''}`}
            onClick={() => {
              if (isClickable) onStepClick(s.number);
            }}
            disabled={disabled || !isClickable}
            aria-current={isActive ? 'step' : undefined}
            leftIcon={<span className={styles.stepNumber}>{isCompleted ? '✓' : s.number}</span>}
          >
            {s.label}
          </Button>
        );
      })}
    </nav>
  );
}
