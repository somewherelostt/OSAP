'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import {
  ListTodo,
  Search,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronRight,
  Brain,
  ArrowRight,
  XCircle,
} from 'lucide-react';
import type { DbTask, TaskPlan } from '@/types/database';
import { useAnonymousUser } from '@/lib/use-anonymous-user';
import { TaskCard } from '@/components/task-card';

type FilterStatus = 'all' | 'running' | 'done' | 'failed';

export default function TasksPage() {
  const { anonymousId } = useAnonymousUser();
  const [tasks, setTasks] = useState<DbTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');

  const fetchTasks = useCallback(async () => {
    if (!anonymousId) return;
    
    try {
      const response = await fetch(`/api/tasks?anonymousId=${anonymousId}`);
      if (response.ok) {
        const data = await response.json();
        setTasks(data.tasks || []);
      }
    } catch (error) {
      console.error('Failed to fetch tasks:', error);
    } finally {
      setIsLoading(false);
    }
  }, [anonymousId]);

  useEffect(() => {
    if (anonymousId) {
      fetchTasks();
      const interval = setInterval(fetchTasks, 5000);
      return () => clearInterval(interval);
    }
  }, [anonymousId, fetchTasks]);

  const filteredTasks = tasks.filter((task) => {
    const matchesSearch =
      task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.input.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (filterStatus === 'all') return matchesSearch;
    if (filterStatus === 'running') return matchesSearch && task.status === 'running';
    if (filterStatus === 'done') return matchesSearch && (task.status === 'success');
    if (filterStatus === 'failed') return matchesSearch && task.status === 'failed';
    return matchesSearch;
  });

  const runningTasks = tasks.filter((t) => t.status === 'running');
  const pendingTasks = tasks.filter((t) => t.status === 'pending');
  const successTasks = tasks.filter((t) => t.status === 'success');
  const failedTasks = tasks.filter((t) => t.status === 'failed');

  const formatTimeAgo = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch {
      return 'Unknown';
    }
  };

  const getTaskDuration = (task: DbTask) => {
    if (!task.updated_at || !task.created_at) return null;
    try {
      const start = new Date(task.created_at);
      const end = new Date(task.updated_at);
      const diffMs = end.getTime() - start.getTime();
      if (diffMs < 1000) return '<1s';
      if (diffMs < 60000) return `${Math.round(diffMs / 1000)}s`;
      return `${Math.round(diffMs / 60000)}m ${Math.round((diffMs % 60000) / 1000)}s`;
    } catch {
      return null;
    }
  };

  const getBorderColor = (status: string) => {
    switch (status) {
      case 'running': return 'border-l-blue-500';
      case 'success':
      case 'done': return 'border-l-green-500';
      case 'failed': return 'border-l-red-500';
      default: return 'border-l-muted';
    }
  };

  const getStepIcon = (step: { status: string }) => {
    switch (step.status) {
      case 'running': return <Loader2 className="size-3.5 text-blue-500 animate-spin" />;
      case 'success': return <CheckCircle2 className="size-3.5 text-green-500" />;
      case 'failed': return <XCircle className="size-3.5 text-red-500" />;
      default: return <div className="size-3.5 rounded-full bg-muted" />;
    }
  };

  const renderPlanSteps = (plan: TaskPlan | undefined) => {
    if (!plan?.steps?.length) return null;
    return (
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Plan Steps</h4>
        <div className="space-y-1.5">
          {plan.steps.map((step, index) => (
            <div key={step.id} className="flex items-start gap-2.5 p-2 rounded-lg bg-muted/50">
              <div className="mt-0.5">{getStepIcon({ status: step.status || 'pending' })}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">{index + 1}.</span>
                  <span className="text-xs font-medium">{step.tool}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 pl-4">{step.description}</p>
                {step.status === 'failed' && (
                  <p className="text-xs text-red-500 mt-1 pl-4">Failed</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderMemorySection = (task: DbTask) => {
    if (!task.result) return null;
    const result = task.result as Record<string, unknown>;
    const memoryContent = result.memory as Record<string, unknown> | undefined;
    
    if (!memoryContent) return null;
    
    return (
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Memory Stored</h4>
        <div className="flex items-start gap-2 p-2 rounded-lg bg-muted/50">
          <Brain className="size-3.5 text-muted-foreground mt-0.5" />
          <div className="flex-1">
            {!!memoryContent.content && (
              <p className="text-xs text-muted-foreground">{String(memoryContent.content)}</p>
            )}
            {!!memoryContent.type && (
              <span className="text-[10px] text-muted-foreground/70 mt-1 inline-block">
                Type: {String(memoryContent.type)}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  const formatTaskResult = (result: string | null | undefined) => {
    if (!result) return null;
    
    // If it's not a JSON-like string, just return it
    if (!result.trim().startsWith('{') && !result.trim().startsWith('[')) {
      return <span className="text-xs text-muted-foreground">{result}</span>;
    }

    try {
      const parsed = JSON.parse(result);
      
      // Handle Gmail list results
      if (parsed.messages && Array.isArray(parsed.messages)) {
        return (
          <div className="space-y-2 mt-1">
            {parsed.messages.slice(0, 3).map((msg: any, i: number) => {
              const from = msg.sender || msg.from || 'Unknown';
              const subject = msg.subject || '(No Subject)';
              return (
                <div key={i} className="text-[11px] bg-muted/30 p-2 rounded-lg border border-border/50">
                  <div className="font-semibold text-foreground truncate">{from}</div>
                  <div className="text-muted-foreground truncate">{subject}</div>
                </div>
              );
            })}
            {parsed.messages.length > 3 && (
              <div className="text-[10px] text-muted-foreground px-1">
                + {parsed.messages.length - 3} more messages
              </div>
            )}
          </div>
        );
      }

      // Default JSON formatting
      return (
        <pre className="text-[10px] font-mono text-muted-foreground bg-muted/20 p-2 rounded-lg overflow-auto max-h-40">
          {JSON.stringify(parsed, null, 2)}
        </pre>
      );
    } catch {
      return <span className="text-xs text-muted-foreground">{result}</span>;
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
        <p className="text-muted-foreground text-sm">
          Manage and monitor your agent tasks
        </p>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20">
          <div className="size-2 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-xs font-medium text-blue-500">
            {runningTasks.length} running
          </span>
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/50 border border-muted">
          <div className="size-2 rounded-full bg-yellow-500" />
          <span className="text-xs font-medium text-muted-foreground">
            {pendingTasks.length} pending
          </span>
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20">
          <div className="size-2 rounded-full bg-green-500" />
          <span className="text-xs font-medium text-green-500">
            {successTasks.length} success
          </span>
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20">
          <div className="size-2 rounded-full bg-red-500" />
          <span className="text-xs font-medium text-red-500">
            {failedTasks.length} failed
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 rounded-xl bg-card border-border/50"
          />
        </div>
        <Button 
          size="sm" 
          variant="outline" 
          className="rounded-xl gap-1.5 border-border/50 text-muted-foreground hover:text-foreground"
          onClick={fetchTasks}
        >
          <RefreshCw className="size-4" />
          Refresh
        </Button>
      </div>

      {/* Filter Row */}
      <div className="flex items-center gap-1 p-1 bg-muted/30 rounded-xl w-fit">
        {(['all', 'running', 'done', 'failed'] as FilterStatus[]).map((status) => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filterStatus === status
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {/* Task List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="text-center py-12 space-y-3">
            <Loader2 className="size-8 mx-auto text-muted-foreground animate-spin" />
            <p className="text-muted-foreground text-sm">Loading tasks...</p>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <div className="size-12 rounded-2xl bg-muted mx-auto flex items-center justify-center">
              <ListTodo className="size-6 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              {searchQuery || filterStatus !== 'all' ? 'No tasks match your filters' : 'No tasks yet'}
            </p>
            <p className="text-xs text-muted-foreground">
              {searchQuery || filterStatus !== 'all' ? 'Try different filters' : 'Create a task from the home page'}
            </p>
          </div>
        ) : (
          filteredTasks.map((task) => (
            <TaskCard key={task.id} task={task as any} initiallyExpanded={expandedTaskId === task.id} />
          ))
        )}
      </div>
    </div>
  );
}