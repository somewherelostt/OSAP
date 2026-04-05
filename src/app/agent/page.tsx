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
  Lightbulb,
  TrendingUp,
  Bug,
  Plus,
  Trash2,
  Settings,
  Activity,
} from 'lucide-react';
import type { Agent, AgentThought, AgentPlan, AgentStep, BackgroundTask } from '@/lib/agent';

interface AgentState {
  agent: Agent | null;
  isRunning: boolean;
  tasks: BackgroundTask[];
}

export default function AgentPage() {
  const [agent, setAgent] = useState<AgentState['agent']>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);
  const [taskInput, setTaskInput] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [expandedThoughts, setExpandedThoughts] = useState(true);
  const [expandedPlan, setExpandedPlan] = useState(true);

  useEffect(() => {
    createAgent();
    loadTasks();
  }, []);

  const pollAgent = useCallback(async () => {
    if (!agent?.id) return;
    try {
      const response = await fetch(`/api/agent?agentId=${agent.id}`);
      const data = await response.json();
      if (data.agent) {
        setAgent(data.agent);
        if (data.agent.status === 'completed' || data.agent.status === 'failed') {
          setIsRunning(false);
        }
      }
    } catch (error) {
      console.error('Failed to poll agent:', error);
    }
  }, [agent?.id]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isRunning || (agent && agent.status !== 'idle' && agent.status !== 'completed' && agent.status !== 'failed')) {
      interval = setInterval(pollAgent, 2000);
    } else {
      interval = setInterval(loadTasks, 5000);
    }

    return () => clearInterval(interval);
  }, [isRunning, agent?.status, pollAgent]);

  const createAgent = async () => {
    setIsCreating(true);
    try {
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create' }),
      });
      const data = await response.json();
      if (data.agent) setAgent(data.agent);
    } catch (error) {
      console.error('Failed to create agent:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const loadTasks = async () => {
    try {
      const response = await fetch('/api/agent?type=tasks');
      const data = await response.json();
      setTasks(data.tasks || []);
    } catch (error) {
      console.error('Failed to load tasks:', error);
    }
  };

  const executeTask = async () => {
    if (!taskInput.trim() || !agent) return;

    setIsRunning(true);
    const input = taskInput;
    setTaskInput(''); // Clear input immediately
    
    try {
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'execute',
          agentId: agent.id,
          task: input,
        }),
      });
      const data = await response.json();
      
      if (data.agent) {
        setAgent(data.agent);
      }
      
      if (data.task) {
        setTasks(prev => [data.task, ...prev]);
      }
    } catch (error) {
      console.error('Failed to execute task:', error);
      setIsRunning(false);
    }
  };

  const pauseAgent = async () => {
    if (!agent) return;
    try {
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'pause',
          agentId: agent.id,
        }),
      });
      const data = await response.json();
      if (data.agent) setAgent(data.agent);
    } catch (error) {
      console.error('Failed to pause agent:', error);
    }
  };

  const resumeAgent = async () => {
    if (!agent) return;
    try {
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'resume',
          agentId: agent.id,
        }),
      });
      const data = await response.json();
      if (data.agent) setAgent(data.agent);
    } catch (error) {
      console.error('Failed to resume agent:', error);
    }
  };

  const abortAgent = async () => {
    if (!agent) return;
    try {
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'abort',
          agentId: agent.id,
        }),
      });
      const data = await response.json();
      if (data.agent) {
        setAgent(data.agent);
        setIsRunning(false);
      }
    } catch (error) {
      console.error('Failed to abort agent:', error);
    }
  };

  const resetAgent = async () => {
    if (!agent) return;
    try {
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reset',
          agentId: agent.id,
        }),
      });
      const data = await response.json();
      if (data.agent) {
        setAgent(data.agent);
        setTasks([]);
        setIsRunning(false);
      }
    } catch (error) {
      console.error('Failed to reset agent:', error);
    }
  };

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
      case 'completed': return <CheckCircle2 className="size-4 text-green-500" />;
      case 'failed': return <AlertCircle className="size-4 text-red-500" />;
      case 'running': return <Loader2 className="size-4 animate-spin text-blue-500" />;
      case 'pending': return <Clock className="size-4 text-muted-foreground" />;
      case 'skipped': return <Square className="size-4 text-muted-foreground" />;
      default: return <Clock className="size-4 text-muted-foreground" />;
    }
  };

  const getTaskStatusColor = (status: BackgroundTask['status']) => {
    switch (status) {
      case 'running': return 'bg-green-500';
      case 'completed': return 'bg-green-500';
      case 'failed': return 'bg-red-500';
      case 'paused': return 'bg-yellow-500';
      default: return 'bg-muted';
    }
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Autonomous Agent</h1>
            <p className="text-sm text-muted-foreground">
              AI-powered task execution with self-correction
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={loadTasks}>
              <Activity className="size-4 mr-1" /> Refresh
            </Button>
          </div>
        </div>

        <div className="flex gap-2">
          <Input
            placeholder="Enter autonomous task (e.g., 'Manage my GitHub issues for a week')"
            value={taskInput}
            onChange={(e) => setTaskInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && executeTask()}
            className="flex-1"
          />
          <Button onClick={executeTask} disabled={!taskInput.trim() || isRunning || !agent}>
            {isRunning ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Play className="size-4" />
            )}
            Execute
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 p-4 overflow-auto space-y-4">
          {agent && (
            <>
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
                    {agent.status === 'executing' && (
                      <Button size="sm" variant="outline" onClick={pauseAgent}>
                        <Pause className="size-4" />
                      </Button>
                    )}
                    {agent.status === 'paused' && (
                      <Button size="sm" variant="outline" onClick={resumeAgent}>
                        <Play className="size-4" />
                      </Button>
                    )}
                    {(agent.status === 'executing' || agent.status === 'paused') && (
                      <Button size="sm" variant="outline" onClick={abortAgent}>
                        <Square className="size-4" />
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={resetAgent}>
                      <RotateCcw className="size-4" />
                    </Button>
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
                      {agent.currentPlan.steps.map((step) => (
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
                        No thoughts yet
                      </p>
                    ) : (
                      agent.thoughts.slice(-5).reverse().map((thought) => (
                        <div
                          key={thought.id}
                          className="p-3 rounded-lg bg-muted/30 space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">
                              {new Date(thought.timestamp).toLocaleTimeString()}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {Math.round(thought.confidence * 100)}% confidence
                            </span>
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
            </>
          )}

          {!agent && (
            <Card className="p-8 rounded-xl border-border/50 text-center">
              <Brain className="size-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">No Agent Active</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create an agent to start autonomous task execution
              </p>
              <Button onClick={createAgent} disabled={isCreating}>
                {isCreating ? <Loader2 className="size-4 animate-spin mr-2" /> : <Plus className="size-4 mr-2" />}
                Create Agent
              </Button>
            </Card>
          )}
        </div>

        <div className="w-80 border-l border-border/50 bg-muted/30 overflow-auto p-4">
          <h3 className="font-medium mb-4 flex items-center gap-2">
            <Activity className="size-4" />
            Background Tasks
          </h3>
          
          {tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No background tasks yet
            </p>
          ) : (
            <div className="space-y-2">
              {tasks.map((task) => (
                <Card key={task.id} className="p-3 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`size-2 rounded-full ${getTaskStatusColor(task.status)}`} />
                    <span className="text-sm font-medium truncate flex-1">{task.name}</span>
                  </div>
                  <Progress value={task.progress} className="h-1 mb-2" />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground capitalize">{task.status}</span>
                    <span className="text-xs text-muted-foreground">{task.progress}%</span>
                  </div>
                  {task.progressMessage && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {task.progressMessage}
                    </p>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
