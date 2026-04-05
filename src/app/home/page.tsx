'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import { useSearchParams } from 'next/navigation';
import { CommandInput } from '@/components/command-input';
import { SectionHeader } from '@/components/section-header';
import { QuickAction } from '@/components/quick-action';
import { ListItem } from '@/components/list-item';
import { StatusBadge } from '@/components/status-badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoginModal } from '@/components/login-modal';
import { useAuth } from '@/lib/use-auth';
import {
  Plus,
  RefreshCw,
  Sparkles,
  Clock,
  Loader2,
  CheckCircle2,
  AlertCircle,
  LogIn,
  Brain,
  Copy,
  Link2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { TaskCard } from '@/components/task-card';
import type { DbTask, DbMemoryNode } from '@/types/database';

interface Task {
  id: string;
  title: string;
  input: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  created_at: string;
  error?: string;
  result?: unknown;
}

interface MemoryEntry {
  id: string;
  content: string;
  type: string;
  created_at: string;
}

const quickActions = [
  { id: '1', label: 'New Task', icon: <Plus className="size-3" />, action: 'new_task' },
  { id: '2', label: 'Search Memory', icon: <Brain className="size-3" />, action: 'search_memory' },
];

export default function HomePage() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') || searchParams.get('query') || '';
  
  const { user: clerkUser, isLoaded: isAuthLoaded } = useUser();
  const { isAuthenticated } = useAuth();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [commandInputValue, setCommandInputValue] = useState(initialQuery);

  useEffect(() => {
    if (initialQuery) {
      setCommandInputValue(initialQuery);
    }
  }, [initialQuery]);

  const examplePrompts = [
    { text: 'Fetch my last 2 emails', query: 'Fetch my last 2 emails' },
    { text: 'What is the capital of France?', query: 'What is the capital of France?' },
    { text: "Create a GitHub issue titled 'Test from OSAP'", query: "Create a GitHub issue titled 'Test from OSAP'" },
  ];

  const fetchData = useCallback(async () => {
    if (!isAuthenticated) return;

    setIsLoading(true);
    try {
      const [tasksRes, memoriesRes] = await Promise.all([
        fetch('/api/tasks'),
        fetch('/api/memory'),
      ]);

      if (tasksRes.ok) {
        const { tasks: fetchedTasks } = await tasksRes.json();
        setTasks(fetchedTasks || []);
      }

      if (memoriesRes.ok) {
        const { memories: fetchedMemories } = await memoriesRes.json();
        setMemories(fetchedMemories || []);
      }
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
    }
  }, [isAuthenticated, fetchData]);

  const handleCommand = async (value: string) => {
    if (!isAuthenticated) {
      setIsLoginModalOpen(true);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: value }),
      });

      const data = await response.json();

      if (!response.ok) {
        setSubmitError(data.error || 'Failed to create task');
        return;
      }

      // Optimistic update - add task to top of list
      const newTask: Task = {
        id: data.taskId,
        title: value.substring(0, 50) + (value.length > 50 ? '...' : ''),
        input: value,
        status: 'running',
        created_at: new Date().toISOString(),
      };
      setTasks(prev => [newTask, ...prev]);

      // Refresh data after a short delay
      setTimeout(() => fetchData(), 2000);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Network error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };


  const isNotConnectedError = (error: string | undefined): boolean => {
    if (!error) return false;
    const lower = error.toLowerCase();
    return lower.includes('not connected') || 
           lower.includes('no connected account') || 
           lower.includes('active connection') ||
           lower.includes('connection') ||
           lower.includes('unauthorized') ||
           lower.includes('oauth') ||
           lower.includes('4302');
  };

  const formatResult = (result: unknown): string => {
    if (!result) return 'Completed';
    if (typeof result === 'string') return result;
    if (Array.isArray(result)) {
      return result.map((item, i) => {
        if (typeof item === 'object' && item !== null) {
          return JSON.stringify(item, null, 2);
        }
        return String(item);
      }).join('\n');
    }
    if (typeof result === 'object') {
      return JSON.stringify(result, null, 2);
    }
    return String(result);
  };

  const copyResult = (task: Task) => {
    const result = task.result as Record<string, unknown> | null;
    const answer = result?.answer as string | null | undefined;
    const summary = result?.summary as string | null | undefined;
    const text = answer || summary || formatResult(result) || 'Completed';
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const firstName = clerkUser?.firstName || 'there';

  if (!isAuthLoaded) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-8">
      <LoginModal open={isLoginModalOpen} onOpenChange={setIsLoginModalOpen} />

      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">
          {isAuthenticated ? `${getGreeting()}, ${firstName}` : 'Welcome to OSAP'}
        </h1>
        <p className="text-muted-foreground text-sm">
          {isAuthenticated
            ? 'Your agent is ready. What would you like to do?'
            : 'Sign in to access your agent and memories.'}
        </p>
      </div>

      {/* Command Input */}
      <div className="space-y-2">
        <CommandInput
          placeholder={isAuthenticated ? 'What would you like to do?' : 'Sign in to get started...'}
          onSubmit={handleCommand}
          disabled={isSubmitting}
          initialValue={commandInputValue}
        />
        {isSubmitting && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground px-1">
            <Loader2 className="size-4 animate-spin" />
            Creating task...
          </div>
        )}
        {submitError && (
          <div className="flex items-center gap-2 text-sm text-destructive px-1">
            <AlertCircle className="size-4" />
            {submitError}
          </div>
        )}
        {isAuthenticated && (
          <div className="flex flex-wrap gap-2 items-center mt-2">
            <span className="text-xs text-muted-foreground">Try:</span>
            {examplePrompts.map((prompt) => (
              <button
                key={prompt.text}
                onClick={() => {
                  const input = document.querySelector('input[data-command-input]') as HTMLInputElement;
                  if (input) {
                    input.value = prompt.text;
                    input.focus();
                  }
                }}
                className="text-xs px-2 py-1 rounded-full bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors border border-border/50"
              >
                {prompt.text}
              </button>
            ))}
          </div>
        )}
      </div>

      {!isAuthenticated && (
        <Card className="p-6 rounded-2xl border-border/50 bg-card text-center">
          <Sparkles className="size-8 mx-auto mb-3 text-primary" />
          <h3 className="text-lg font-medium mb-2">Get Started with OSAP</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Sign in to create tasks, store memories, and let your AI agent help you.
          </p>
          <Button onClick={() => setIsLoginModalOpen(true)} className="gap-2">
            <LogIn className="size-4" />
            Sign In
          </Button>
        </Card>
      )}

      {isAuthenticated && (
        <>
          {/* Quick Actions */}
          <div className="space-y-3">
            <SectionHeader title="Quick Actions" />
            <div className="flex flex-wrap gap-2">
              {quickActions.map((action) => (
                <QuickAction
                  key={action.id}
                  label={action.label}
                  icon={action.icon}
                  onClick={() => {
                    if (action.action === 'new_task') {
                      // Focus command input - could add a ref here
                    }
                  }}
                />
              ))}
              <Button
                size="sm"
                variant="outline"
                className="h-8 rounded-xl text-xs font-medium gap-1.5 bg-accent/50"
                onClick={fetchData}
                disabled={isLoading}
              >
                <RefreshCw className={`size-3 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>

          {/* Recent Tasks */}
          <div className="space-y-3">
            <SectionHeader
              title="Recent Tasks"
              action={
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => window.location.href = '/tasks'}>
                  View All
                </Button>
              }
            />
            <div className="space-y-2">
              {tasks.length === 0 ? (
                <Card className="p-6 rounded-2xl border-border/50 bg-card text-center">
                  <p className="text-sm text-muted-foreground">
                    No tasks yet. Create one above.
                  </p>
                </Card>
              ) : (
                tasks.slice(0, 5).map((task) => (
                  <TaskCard key={task.id} task={task as any} />
                ))
              )}
            </div>
          </div>

          {/* Recent Memories */}
          <div className="space-y-3">
            <SectionHeader
              title="Recent Memories"
              action={
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => window.location.href = '/memory'}>
                  View All
                </Button>
              }
            />
            <div className="space-y-2">
              {memories.length === 0 ? (
                <Card className="p-6 rounded-2xl border-border/50 bg-card text-center">
                  <Brain className="size-6 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    No memories yet. Your agent will remember things automatically.
                  </p>
                </Card>
              ) : (
                memories.slice(0, 3).map((memory) => (
                  <ListItem
                    key={memory.id}
                    title={memory.content.substring(0, 80) + (memory.content.length > 80 ? '...' : '')}
                    description={`${memory.type} · ${formatTimeAgo(memory.created_at)}`}
                    leftElement={<Brain className="size-4 text-purple-500" />}
                  />
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
