'use client';

import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';

interface ListItemProps {
  title: string;
  description?: string;
  leftElement?: React.ReactNode;
  rightElement?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

export function ListItem({
  title,
  description,
  leftElement,
  rightElement,
  onClick,
  className
}: ListItemProps) {
  return (
    <Card
      onClick={onClick}
      className={cn(
        'p-4 rounded-2xl border-border/50 bg-card hover:bg-accent/50 transition-colors cursor-pointer',
        onClick && className
      )}
    >
      <div className="flex items-center gap-4">
        {leftElement && (
          <div className="size-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
            {leftElement}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{title}</p>
          {description && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {description}
            </p>
          )}
        </div>
        {rightElement && (
          <div className="shrink-0">{rightElement}</div>
        )}
      </div>
    </Card>
  );
}
