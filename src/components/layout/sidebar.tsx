'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Home,
  ListTodo,
  Brain,
  Code2,
  User,
  Settings,
  Bot,
  MessageSquare,
} from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';

const navItems = [
  {
    label: 'Chat',
    href: '/chat',
    icon: MessageSquare,
  },
  {
    label: 'Tasks',
    href: '/tasks',
    icon: ListTodo,
  },
  {
    label: 'Agent',
    href: '/agent',
    icon: Bot,
  },
  {
    label: 'Memory',
    href: '/memory',
    icon: Brain,
  },
  {
    label: 'Dev',
    href: '/dev',
    icon: Code2,
  },
  {
    label: 'Profile',
    href: '/profile',
    icon: User,
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <TooltipProvider>
      <aside className="fixed left-0 top-0 bottom-0 w-20 z-40 flex flex-col border-r border-border/50 bg-sidebar">
        <div className="flex flex-col items-center py-6 gap-2">
          <div className="size-10 rounded-2xl bg-primary/10 flex items-center justify-center">
            <span className="text-lg font-bold text-primary">O</span>
          </div>
        </div>

        <Separator className="mx-auto w-12" />

        <nav className="flex-1 flex flex-col items-center py-6 gap-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            const Icon = item.icon;

            return (
              <Tooltip key={item.href}>
                <TooltipTrigger
                  render={
                    <Link
                      href={item.href}
                      className={cn(
                        buttonVariants({ variant: 'ghost', size: 'icon' }),
                        'size-12 rounded-xl transition-all duration-200 flex items-center justify-center',
                        isActive
                          ? 'bg-primary/10 text-primary hover:bg-primary/15'
                          : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                      )}
                    />
                  }
                >
                  <Icon className="size-5" />
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={12}>
                  <p className="text-sm font-medium">{item.label}</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        <div className="flex flex-col items-center py-6 gap-2 border-t border-border/50">
          <Tooltip>
            <TooltipTrigger
              render={
                <Link
                  href="/profile"
                  className={cn(
                    buttonVariants({ variant: 'ghost', size: 'icon' }),
                    'size-12 rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent flex items-center justify-center'
                  )}
                />
              }
            >
              <Settings className="size-5" />
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={12}>
              <p className="text-sm font-medium">Settings</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  );
}
