import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@/types';

interface AppState {
  user: User | null;
  activeTab: string;
  isSidebarOpen: boolean;
  theme: 'dark' | 'light' | 'system';
  setUser: (user: User | null) => void;
  setActiveTab: (tab: string) => void;
  setSidebarOpen: (open: boolean) => void;
  setTheme: (theme: 'dark' | 'light' | 'system') => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      activeTab: 'home',
      isSidebarOpen: false,
      theme: 'dark',
      setUser: (user) => set({ user }),
      setActiveTab: (activeTab) => set({ activeTab }),
      setSidebarOpen: (isSidebarOpen) => set({ isSidebarOpen }),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'osap-storage',
      partialize: (state) => ({
        theme: state.theme,
        user: state.user
      }),
    }
  )
);
