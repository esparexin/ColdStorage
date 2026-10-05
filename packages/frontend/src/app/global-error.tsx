'use client';

import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { ERROR_TITLES } from '@/components/ui/stateCopy';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <FeedbackStates.Error
          title={ERROR_TITLES.default}
          message={error.message || 'An unexpected application error occurred.'}
          onRetry={reset}
        />
      </body>
    </html>
  );
}
