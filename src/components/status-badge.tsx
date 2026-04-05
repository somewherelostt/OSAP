import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: 'pending' | 'running' | 'success' | 'failed' | 'done';
  className?: string;
}

const statusConfig = {
  pending: {
    label: 'Pending',
    className: 'bg-muted text-muted-foreground',
  },
  running: {
    label: 'Running',
    className: 'bg-blue-500/10 text-blue-500',
  },
  done: {
    label: 'Done',
    className: 'bg-green-500/10 text-green-500',
  },
  success: {
    label: 'Done',
    className: 'bg-green-500/10 text-green-500',
  },
  failed: {
    label: 'Failed',
    className: 'bg-red-500/10 text-red-500',
  },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium',
        config.className,
        className
      )}
    >
      <span className={cn(
        'size-1.5 rounded-full',
        status === 'running' && 'animate-pulse',
        status === 'pending' && 'bg-current opacity-50',
        (status === 'done' || status === 'success') && 'bg-green-500',
        status === 'failed' && 'bg-red-500'
      )} />
      {config.label}
    </span>
  );
}
