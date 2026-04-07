'use client';

import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/components/theme-provider';
import { BottomNav } from './bottom-nav';
import { Sidebar } from './sidebar';
import { useAppStore } from '@/store';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { theme } = useAppStore();
  const pathname = usePathname();
  const isLanding = pathname === '/';

  return (
    <ThemeProvider>
      <TooltipProvider>
        <div className={cn('min-h-screen', theme === 'light' ? 'light' : 'dark')}>
          {!isLanding && (
            <>
              <div className="hidden md:block">
                <Sidebar />
              </div>
              <main className={cn(
                "md:pl-20 transition-all w-full",
                pathname === '/chat' 
                  ? "h-[100dvh] overflow-hidden pb-[70px] md:pb-0" 
                  : "min-h-screen pb-24 md:pb-0"
              )}>
                {children}
              </main>
              <div className="block md:hidden fixed bottom-0 left-0 right-0 z-50">
                <BottomNav />
              </div>
            </>
          )}
          {isLanding && children}
        </div>
      </TooltipProvider>
    </ThemeProvider>
  );
}
