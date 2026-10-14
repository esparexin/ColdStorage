'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { sanitizeReturnUrl } from '@/lib/safe-url';

export default function LoginPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user) {
      const rawReturnUrl =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('returnUrl')
          : null;
      router.replace(sanitizeReturnUrl(rawReturnUrl));
    }
  }, [user, isLoading, router]);

  return null;
}
