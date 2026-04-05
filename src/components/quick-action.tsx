'use client';

import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

interface QuickActionProps {
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

export function QuickAction({
  label,
  icon,
  onClick,
  className
}: QuickActionProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        buttonVariants({ variant: 'secondary', size: 'sm' }),
        'h-8 px-3 rounded-xl text-xs font-medium gap-1.5 bg-accent/50 hover:bg-accent border border-border/50',
        className
      )}
    >
      {icon}
      {label}
    </button>
  );
}
