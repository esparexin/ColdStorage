'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function LoginPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user) {
      const returnUrl =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('returnUrl') || '/'
          : '/';
      router.replace(returnUrl);
    }
  }, [user, isLoading, router]);

  return null;
}
