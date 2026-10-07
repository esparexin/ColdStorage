import { useEffect, useState } from 'react';
import { requestWithAuth } from '../../../lib/api-client';

export interface UseLiveGrnValidationParams {
  facilityId: string;
  createGrnNumber: string;
  isEdit: boolean;
  fieldError?: string;
  setFieldErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

export function useLiveGrnValidation({
  facilityId,
  createGrnNumber,
  isEdit,
  fieldError,
  setFieldErrors,
}: UseLiveGrnValidationParams) {
  const [isCheckingGrn, setIsCheckingGrn] = useState(false);

  useEffect(() => {
    if (isEdit || !facilityId) return;

    const trimmed = createGrnNumber.trim();
    if (trimmed.length !== 4) {
      setFieldErrors((prev) => {
        if (prev.grnNumber?.includes('already exists')) {
          const rest = { ...prev };
          delete rest.grnNumber;
          return rest;
        }
        return prev;
      });
      return;
    }

    let active = true;
    const controller = new AbortController();
    setIsCheckingGrn(true);

    const timer = setTimeout(() => {
      requestWithAuth(
        `/api/facilities/${encodeURIComponent(facilityId)}/grns?search=${encodeURIComponent(trimmed)}&limit=100`,
        { signal: controller.signal },
      )
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { items?: Array<{ grnNumber: string }> } | null) => {
          if (!active) return;
          setIsCheckingGrn(false);
          if (!data) return;
          const exists = (data.items ?? []).some((item) => item.grnNumber === trimmed);
          if (exists) {
            setFieldErrors((prev) => ({
              ...prev,
              grnNumber: `GRN '${trimmed}' already exists for this facility.`,
            }));
          } else {
            setFieldErrors((prev) => {
              if (prev.grnNumber?.includes('already exists')) {
                const rest = { ...prev };
                delete rest.grnNumber;
                return rest;
              }
              return prev;
            });
          }
        })
        .catch((err: unknown) => {
          if (!active) return;
          if (err instanceof Error && err.name === 'AbortError') return;
          setIsCheckingGrn(false);
        });
    }, 250);

    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
      setIsCheckingGrn(false);
    };
  }, [facilityId, createGrnNumber, isEdit, setFieldErrors]);

  const handleGrnBlur = () => {
    if (isEdit) return;
    const trimmed = createGrnNumber.trim();
    if (trimmed.length > 0 && trimmed.length < 4) {
      setFieldErrors((prev) => ({
        ...prev,
        grnNumber: 'GRN must be exactly 4 digits (numbers only)',
      }));
    }
  };

  const isGrnInvalid = isGrnInvalidState({
    createGrnNumber,
    isEdit,
    fieldError,
    isCheckingGrn,
  });

  return {
    isCheckingGrn,
    isGrnInvalid,
    handleGrnBlur,
  };
}

export function isGrnInvalidState(params: {
  createGrnNumber: string;
  isEdit: boolean;
  fieldError?: string;
  isCheckingGrn: boolean;
}): boolean {
  if (params.isEdit) return false;
  return (
    params.createGrnNumber.trim().length !== 4 ||
    Boolean(params.fieldError) ||
    params.isCheckingGrn
  );
}

export function formatGrnDuplicateError(grnNumber: string): string {
  return `GRN '${grnNumber.trim()}' already exists for this facility.`;
}

export function isDuplicateGrnError(message: string): boolean {
  const lower = message.toLowerCase();
  const isDuplicatePhrase = message.includes('already exists') || lower.includes('duplicate key') || message.includes('E11000');
  return (
    isDuplicatePhrase &&
    (message.includes('GRN') || lower.includes('grn') || message.includes('facilityId_1_grnNumber_1'))
  );
}
