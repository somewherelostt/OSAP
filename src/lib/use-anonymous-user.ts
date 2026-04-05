'use client';

import { useState, useEffect, useCallback } from 'react';

const ANONYMOUS_ID_KEY = 'osap_anonymous_id';

export function useAnonymousUser() {
  const [anonymousId, setAnonymousId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize anonymous ID on mount
  useEffect(() => {
    const stored = localStorage.getItem(ANONYMOUS_ID_KEY);
    if (stored) {
      setAnonymousId(stored);
    } else {
      const newId = generateId();
      localStorage.setItem(ANONYMOUS_ID_KEY, newId);
      setAnonymousId(newId);
    }
    setIsLoading(false);
  }, []);

  // Generate unique ID
  function generateId(): string {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2, 10);
    return `${timestamp}-${randomPart}`;
  }

  // Reset anonymous ID (for testing or logout)
  const resetId = useCallback(() => {
    const newId = generateId();
    localStorage.setItem(ANONYMOUS_ID_KEY, newId);
    setAnonymousId(newId);
    return newId;
  }, []);

  return {
    anonymousId,
    isLoading,
    resetId,
  };
}
