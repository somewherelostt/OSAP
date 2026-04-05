'use client';

import { useMemo } from 'react';
import { useUser, useClerk } from '@clerk/nextjs';

interface User {
  id: string;
  email?: string;
  fullName?: string;
  imageUrl?: string;
}

export function useAuth() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();

  return useMemo(() => ({
    user: user ? {
      id: user.id,
      email: user.primaryEmailAddress?.emailAddress,
      fullName: user.fullName,
      imageUrl: user.imageUrl,
    } : null,
    isLoading: !isLoaded || !user,
    isAuthenticated: !!user && isLoaded,
    signOut: () => signOut(),
  }), [user, isLoaded, signOut]);
}
