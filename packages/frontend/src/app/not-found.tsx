'use client';

import { useRouter } from 'next/navigation';
import { FeedbackStates } from '@/components/ui/FeedbackStates';

export default function NotFound() {
  const router = useRouter();
  return (
    <FeedbackStates.Empty
      message="The page you are looking for does not exist."
      action={{ label: 'Back to Dashboard', onClick: () => router.push('/'), id: 'not-found-home' }}
    />
  );
}
