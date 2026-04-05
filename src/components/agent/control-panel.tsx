'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Play,
  Pause,
  Square,
  RotateCcw,
  Brain,
  Zap,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Eye,
  Lightbulb,
  TrendingUp,
  Bug,
  X,
} from 'lucide-react';
import type { Agent, AgentThought, AgentPlan, AgentStep } from '@/lib/agent';

interface AgentControlPanelProps {
  agent: Agent | null;
  onPause?: () => void;
  onResume?: () => void;
  onAbort?: () => void;
  onReset?: () => void;
  onOverride?: (decision: string) => void;
  isRunning?: boolean;
}

export function AgentControlPanel({
  agent,
  onPause,
  onResume,
  onAbort,
  onReset,
  onOverride,
  isRunning = false,
}: AgentControlPanelProps) {
  const [expandedThoughts, setExpandedThoughts] = useState(true);
  const [expandedPlan, setExpandedPlan] = useState(true);
  const [overrideInput, setOverrideInput] = useState('');
  const [showOverride, setShowOverride] = useState(false);

  if (!agent) {
    return (
      <Card className="p-4 rounded-xl border-border/50">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Brain className="size-5" />
          <span>No agent active</span>
        </div>
      </Card>
    );
  }

  const getStatusColor = (status: Agent['status']) => {
    switch (status) {
      case 'idle': return 'bg-muted text-muted-foreground';
      case 'planning': return 'bg-blue-500/10 text-blue-500';
      case 'executing': return 'bg-green-500/10 text-green-500';
      case 'paused': return 'bg-yellow-500/10 text-yellow-500';
      case 'completed': return 'bg-green-500/10 text-green-500';
      case 'failed': return 'bg-red-500/10 text-red-500';
      default: return 'bg-muted';
    }
  };

  const getStepStatusIcon = (step: AgentStep) => {
    switch (step.status) {
      case 'completed':
        return <CheckCircle2 className="size-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="size-4 text-red-500" />;
      case 'running':
        return <Loader2 className="size-4 animate-spin text-blue-500" />;
      case 'pending':
        return <Clock className="size-4 text-muted-foreground" />;
      case 'skipped':
        return <X className="size-4 text-muted-foreground" />;
      default:
        return <Clock className="size-4 text-muted-foreground" />;
    }
  };

  const handleOverride = () => {
    if (overrideInput.trim() && onOverride) {
      onOverride(overrideInput.trim());
      setOverrideInput('');
      setShowOverride(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 rounded-xl border-border/50 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`size-10 rounded-xl flex items-center justify-center ${getStatusColor(agent.status)}`}>
              <Brain className="size-5" />
            </div>
            <div>
              <h3 className="font-medium">{agent.config.name}</h3>
              <div className="flex items-center gap-2">
                <Badge className={getStatusColor(agent.status)}>{agent.status}</Badge>
                <span className="text-xs text-muted-foreground">
                  {agent.metrics.totalExecutions} executions
                </span>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            {agent.status === 'executing' && onPause && (
              <Button size="sm" variant="outline" onClick={onPause}>
                <Pause className="size-4" />
              </Button>
            )}
            {agent.status === 'paused' && onResume && (
              <Button size="sm" variant="outline" onClick={onResume}>
                <Play className="size-4" />
              </Button>
            )}
            {(agent.status === 'executing' || agent.status === 'paused') && onAbort && (
              <Button size="sm" variant="outline" onClick={onAbort}>
                <Square className="size-4" />
              </Button>
            )}
            {onReset && (
              <Button size="sm" variant="outline" onClick={onReset}>
                <RotateCcw className="size-4" />
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">Success Rate</p>
            <p className="font-bold text-lg">
              {agent.metrics.totalExecutions > 0
                ? Math.round((agent.metrics.successfulExecutions / agent.metrics.totalExecutions) * 100)
                : 0}%
            </p>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">Self-Corrections</p>
            <p className="font-bold text-lg">{agent.metrics.selfCorrections}</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">Memories</p>
            <p className="font-bold text-lg">{agent.memories.length}</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">Thoughts</p>
            <p className="font-bold text-lg">{agent.thoughts.length}</p>
          </div>
        </div>
      </Card>

      {agent.currentPlan && (
        <Card className="p-4 rounded-xl border-border/50">
          <button
            className="flex items-center justify-between w-full mb-3"
            onClick={() => setExpandedPlan(!expandedPlan)}
          >
            <div className="flex items-center gap-2">
              <Zap className="size-4 text-yellow-500" />
              <h4 className="font-medium">Execution Plan</h4>
              <Badge variant="secondary">{agent.currentPlan.steps.length} steps</Badge>
            </div>
            {expandedPlan ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>

          {expandedPlan && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground mb-3">
                {agent.currentPlan.objective}
              </p>
              {agent.currentPlan.steps.map((step, index) => (
                <div
                  key={step.id}
                  className={`flex items-start gap-3 p-2 rounded-lg ${
                    step.status === 'running' ? 'bg-blue-500/5 border border-blue-500/20' : 'bg-muted/30'
                  }`}
                >
                  <div className="mt-0.5">{getStepStatusIcon(step)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">#{step.order}</span>
                      <span className="font-medium text-sm">{step.action}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{step.expectedOutcome}</p>
                    {step.error && (
                      <p className="text-xs text-red-500 mt-1">Error: {step.error}</p>
                    )}
                    {step.status === 'running' && step.retryCount > 0 && (
                      <p className="text-xs text-yellow-500 mt-1">
                        Retry {step.retryCount}/{step.maxRetries}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Card className="p-4 rounded-xl border-border/50">
        <button
          className="flex items-center justify-between w-full mb-3"
          onClick={() => setExpandedThoughts(!expandedThoughts)}
        >
          <div className="flex items-center gap-2">
            <Lightbulb className="size-4 text-purple-500" />
            <h4 className="font-medium">Reasoning</h4>
            <Badge variant="secondary">{agent.thoughts.length} thoughts</Badge>
          </div>
          {expandedThoughts ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>

        {expandedThoughts && (
          <div className="space-y-3 max-h-[300px] overflow-auto">
            {agent.thoughts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No thoughts yet. Agent is reasoning...
              </p>
            ) : (
              agent.thoughts.slice(-5).reverse().map((thought) => (
                <div
                  key={thought.id}
                  className="p-3 rounded-lg bg-muted/30 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Brain className="size-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {new Date(thought.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <TrendingUp className="size-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {Math.round(thought.confidence * 100)}%
                      </span>
                    </div>
                  </div>
                  <p className="text-sm font-medium">{thought.thought}</p>
                  <p className="text-xs text-muted-foreground">{thought.reasoning}</p>
                  <p className="text-xs text-primary">{thought.decision}</p>
                </div>
              ))
            )}
          </div>
        )}
      </Card>

      <Card className="p-4 rounded-xl border-border/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Bug className="size-4 text-red-500" />
            <h4 className="font-medium">Agent Override</h4>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowOverride(!showOverride)}
          >
            {showOverride ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </Button>
        </div>

        {showOverride && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Override the agent&apos;s current decision or provide new instructions.
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="Enter override instruction..."
                value={overrideInput}
                onChange={(e) => setOverrideInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleOverride()}
              />
              <Button onClick={handleOverride} disabled={!overrideInput.trim()}>
                Apply
              </Button>
            </div>
          </div>
        )}
      </Card>

      {agent.memories.length > 0 && (
        <Card className="p-4 rounded-xl border-border/50">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="size-4 text-green-500" />
            <h4 className="font-medium">Learned Patterns</h4>
          </div>
          <div className="space-y-2">
            {agent.memories.slice(0, 5).map((memory) => (
              <div
                key={memory.id}
                className={`p-2 rounded-lg ${
                  memory.outcome === 'positive' ? 'bg-green-500/5' : 'bg-red-500/5'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">{memory.type}</span>
                  <span className="text-xs text-muted-foreground">
                    {memory.successRate}% success
                  </span>
                </div>
                <p className="text-sm truncate">{memory.content}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

export function AgentStatusIndicator({ status }: { status: Agent['status'] }) {
  const config = {
    idle: { color: 'bg-muted', label: 'Idle', pulse: false },
    planning: { color: 'bg-blue-500', label: 'Planning', pulse: true },
    executing: { color: 'bg-green-500', label: 'Running', pulse: true },
    paused: { color: 'bg-yellow-500', label: 'Paused', pulse: false },
    completed: { color: 'bg-green-500', label: 'Done', pulse: false },
    failed: { color: 'bg-red-500', label: 'Failed', pulse: false },
  }[status];

  return (
    <div className="flex items-center gap-2">
      <div className={`size-2 rounded-full ${config.color} ${config.pulse ? 'animate-pulse' : ''}`} />
      <span className="text-xs text-muted-foreground">{config.label}</span>
    </div>
  );
}
