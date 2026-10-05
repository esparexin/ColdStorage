'use client';

import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { ERROR_TITLES } from '@/components/ui/stateCopy';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <FeedbackStates.Error
      title={ERROR_TITLES.default}
      message={error.message || 'An unexpected error occurred while rendering this section.'}
      onRetry={reset}
    />
  );
}
