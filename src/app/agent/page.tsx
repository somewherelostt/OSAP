'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
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
  Activity,
  Sparkles,
  Target,
  TrendingUp,
  Cpu,
  Moon,
  Sun,
  Volume2,
  VolumeX,
  RefreshCw,
  Trash2,
  MessageSquare,
  GitBranch,
  Calendar,
  FileText,
  Send,
  Mail,
  Eye,
  EyeOff,
  Timer,
  Infinity as InfinityIcon,
  Bell,
  BellOff,
  Check,
  X,
  Plus,
  Settings,
  AlertTriangle,
  Info,
  Bot,
  ListTodo,
  Cog,
  Shield,
  Workflow,
  TimerReset,
  ActivitySquare,
} from 'lucide-react';
import type { Agent, AgentThought, AgentPlan, AgentStep, BackgroundTask } from '@/lib/agent';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

const AUTONOMOUS_MODES = [
  {
    id: 'continuous',
    icon: InfinityIcon,
    title: 'Continuous Execution',
    description: 'Run until manually stopped',
    color: 'from-emerald-500 to-teal-500',
  },
  {
    id: 'timed',
    icon: Timer,
    title: 'Timed Execution',
    description: 'Run for a specific duration',
    color: 'from-blue-500 to-indigo-500',
  },
  {
    id: 'interval',
    icon: TimerReset,
    title: 'Interval Monitoring',
    description: 'Check every X minutes',
    color: 'from-purple-500 to-pink-500',
  },
];

export default function AgentPage() {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);
  const [taskInput, setTaskInput] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [expandedThoughts, setExpandedThoughts] = useState(true);
  const [expandedPlan, setExpandedPlan] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'thoughts' | 'tasks'>('overview');
  
  // Autonomous mode state
  const [mode, setMode] = useState<'continuous' | 'timed' | 'interval'>('continuous');
  const [duration, setDuration] = useState(15);
  const [intervalMinutes, setIntervalMinutes] = useState(5);
  const [isAutonomousRunning, setIsAutonomousRunning] = useState(false);
  const [autonomousStartTime, setAutonomousStartTime] = useState<Date | null>(null);
  const [executionCount, setExecutionCount] = useState(0);
  const [lastCheckTime, setLastCheckTime] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const autonomousIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timedIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    createAgent();
    loadTasks();
  }, []);

  // Countdown timer for timed mode
  useEffect(() => {
    if (mode === 'timed' && isAutonomousRunning && timeRemaining !== null && timeRemaining > 0) {
      countdownRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev === null || prev <= 1) {
            stopAutonomous();
            return 0;
          }
          return prev - 1;
        });
      }, 60000);
    }
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [mode, isAutonomousRunning, timeRemaining]);

  const pollAgent = useCallback(async () => {
    if (!agent?.id) return;
    try {
      const response = await fetch(`/api/agent?agentId=${agent.id}`);
      const data = await response.json();
      if (data.agent) {
        setAgent(data.agent);
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
      interval = setInterval(loadTasks, 10000);
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

  const executeSingleTask = async (input: string): Promise<boolean> => {
    if (!agent || !input.trim()) return false;
    
    // Wait if a task is already running
    if (isRunning) {
      console.log('[Autonomous] Task already running, waiting...');
      return false;
    }
    
    setIsRunning(true);
    setLastCheckTime(new Date().toLocaleTimeString());
    
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
      if (data.agent) setAgent(data.agent);
      if (data.task) setTasks(prev => [data.task, ...prev]);
      setExecutionCount(prev => prev + 1);
      return true;
    } catch (error) {
      console.error('Failed to execute task:', error);
      return false;
    } finally {
      setIsRunning(false);
    }
  };

  const runAutonomousLoop = useCallback(async () => {
    if (!isAutonomousRunning || !taskInput.trim()) return;
    
    console.log('[Autonomous] Running task cycle...');
    const success = await executeSingleTask(taskInput);
    
    if (success) {
      console.log('[Autonomous] Task completed, scheduling next run...');
    }
    
    // Schedule next run if still autonomous and in interval mode
    if (isAutonomousRunning && mode === 'interval') {
      autonomousIntervalRef.current = setTimeout(() => {
        runAutonomousLoop();
      }, intervalMinutes * 60 * 1000);
    }
  }, [isAutonomousRunning, taskInput, mode, intervalMinutes, agent?.id]);

  const startAutonomous = () => {
    if (!taskInput.trim()) return;
    
    setIsAutonomousRunning(true);
    setAutonomousStartTime(new Date());
    setExecutionCount(0);
    setTimeRemaining(mode === 'timed' ? duration : null);
    
    // Execute immediately
    executeSingleTask(taskInput).then(() => {
      // For continuous mode, keep running indefinitely
      if (mode === 'continuous') {
        const continuousLoop = () => {
          if (!isAutonomousRunning) return;
          executeSingleTask(taskInput).then(() => {
            // Wait for task to finish, then schedule next after 30 seconds
            autonomousIntervalRef.current = setTimeout(continuousLoop, 30000);
          });
        };
        continuousLoop();
      }
      
      // For interval mode, schedule next run after interval
      if (mode === 'interval') {
        autonomousIntervalRef.current = setTimeout(() => {
          runAutonomousLoop();
        }, intervalMinutes * 60 * 1000);
      }
      
      // For timed mode, run at intervals until duration expires
      if (mode === 'timed') {
        let runsCompleted = 0;
        const totalRuns = Math.max(1, Math.ceil(duration / intervalMinutes));
        
        const timedLoop = () => {
          if (!isAutonomousRunning) return;
          runsCompleted++;
          setExecutionCount(runsCompleted);
          
          if (runsCompleted < totalRuns) {
            timedIntervalRef.current = setTimeout(() => {
              executeSingleTask(taskInput).then(() => {
                timedLoop();
              });
            }, intervalMinutes * 60 * 1000);
          } else {
            stopAutonomous();
          }
        };
        
        // Start timed loop after first interval
        if (totalRuns > 1) {
          timedIntervalRef.current = setTimeout(timedLoop, intervalMinutes * 60 * 1000);
        } else {
          stopAutonomous();
        }
      }
    });
  };

  const stopAutonomous = useCallback(() => {
    setIsAutonomousRunning(false);
    setIsRunning(false);
    setTimeRemaining(null);
    
    // Clear all timers
    if (autonomousIntervalRef.current) {
      clearTimeout(autonomousIntervalRef.current);
      autonomousIntervalRef.current = null;
    }
    if (timedIntervalRef.current) {
      clearTimeout(timedIntervalRef.current);
      timedIntervalRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    
    // Abort the current agent execution
    if (agent?.id) {
      fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'abort', agentId: agent.id }),
      });
    }
  }, [agent?.id]);

  const pauseAgent = async () => {
    if (!agent) return;
    try {
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pause', agentId: agent.id }),
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
        body: JSON.stringify({ action: 'resume', agentId: agent.id }),
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
        body: JSON.stringify({ action: 'abort', agentId: agent.id }),
      });
      const data = await response.json();
      if (data.agent) {
        setAgent(data.agent);
        setIsRunning(false);
        setIsAutonomousRunning(false);
      }
    } catch (error) {
      console.error('Failed to abort agent:', error);
    }
  };

  const resetAgent = async () => {
    if (!agent) return;
    stopAutonomous();
    try {
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset', agentId: agent.id }),
      });
      const data = await response.json();
      if (data.agent) {
        setAgent(data.agent);
        setTasks([]);
        setIsRunning(false);
        setExecutionCount(0);
        setLastCheckTime(null);
      }
    } catch (error) {
      console.error('Failed to reset agent:', error);
    }
  };

  const getStatusColor = (status: Agent['status']) => {
    switch (status) {
      case 'idle': return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
      case 'planning': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'executing': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'paused': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'completed': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'failed': return 'bg-red-500/20 text-red-400 border-red-500/30';
      default: return 'bg-slate-500/20 text-slate-400';
    }
  };

  const getStatusIcon = (status: Agent['status']) => {
    switch (status) {
      case 'idle': return <Moon className="size-4" />;
      case 'planning': return <Cpu className="size-4 animate-pulse" />;
      case 'executing': return <Sparkles className="size-4" />;
      case 'paused': return <Pause className="size-4" />;
      case 'completed': return <CheckCircle2 className="size-4" />;
      case 'failed': return <AlertCircle className="size-4" />;
      default: return <Brain className="size-4" />;
    }
  };

  const getStepStatusIcon = (step: AgentStep) => {
    switch (step.status) {
      case 'completed': return <CheckCircle2 className="size-4 text-emerald-400" />;
      case 'failed': return <AlertCircle className="size-4 text-red-400" />;
      case 'running': return <Loader2 className="size-4 animate-spin text-blue-400" />;
      case 'pending': return <Clock className="size-4 text-slate-400" />;
      case 'skipped': return <Square className="size-4 text-slate-500" />;
      default: return <Clock className="size-4 text-slate-400" />;
    }
  };

  const getTaskStatusColor = (status: BackgroundTask['status']) => {
    switch (status) {
      case 'running': return 'bg-blue-500';
      case 'completed': return 'bg-emerald-500';
      case 'failed': return 'bg-red-500';
      case 'paused': return 'bg-amber-500';
      default: return 'bg-slate-500';
    }
  };

  const successRate = agent?.metrics.totalExecutions 
    ? Math.round((agent.metrics.successfulExecutions / agent.metrics.totalExecutions) * 100)
    : 0;

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-background via-background to-primary/5">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="px-4 py-3 md:px-6 md:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="hidden md:flex size-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 items-center justify-center">
                <Bot className="size-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-bold tracking-tight">Autonomous Agent</h1>
                <p className="text-xs md:text-sm text-muted-foreground">
                  AI-powered automation for any task
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isAutonomousRunning && (
                <Badge className="bg-red-500/20 text-red-400 border-red-500/30 animate-pulse gap-1">
                  <div className="size-2 rounded-full bg-red-400 animate-pulse" />
                  Autonomous: {executionCount} runs
                </Badge>
              )}
              {lastCheckTime && (
                <Badge variant="outline" className="text-xs">
                  Last: {lastCheckTime}
                </Badge>
              )}
              <Button size="sm" variant="outline" onClick={loadTasks}>
                <RefreshCw className="size-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile Tab Bar */}
        <div className="flex border-t border-border/50 px-4 md:hidden">
          {(['overview', 'thoughts', 'tasks'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex-1 py-2.5 text-xs font-medium capitalize border-b-2 transition-colors",
                activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row h-[calc(100vh-8rem)]">
        {/* Main Content */}
        <div className="flex-1 overflow-auto p-4 md:p-6 space-y-4">
          {/* Autonomous Control Panel */}
          <Card className="p-4 md:p-5 border-border/50 bg-gradient-to-br from-card to-card/80">
            <div className="flex items-center gap-3 mb-4">
              <div className="size-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
                <Workflow className="size-5 text-white" />
              </div>
              <div>
                <h3 className="font-bold">Autonomous Control</h3>
                <p className="text-xs text-muted-foreground">Configure how the agent runs</p>
              </div>
            </div>

            {/* Mode Selection */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {AUTONOMOUS_MODES.map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    onClick={() => setMode(m.id as any)}
                    disabled={isAutonomousRunning}
                    className={cn(
                      "p-3 rounded-xl border-2 text-left transition-all",
                      mode === m.id
                        ? "border-primary bg-primary/10"
                        : "border-border/50 hover:border-primary/50",
                      isAutonomousRunning && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <Icon className={cn("size-5 mb-1", mode === m.id ? "text-primary" : "text-muted-foreground")} />
                    <h4 className="font-medium text-xs">{m.title}</h4>
                    <p className="text-[10px] text-muted-foreground line-clamp-1">{m.description}</p>
                  </button>
                );
              })}
            </div>

            {/* Mode Settings */}
            {mode === 'timed' && (
              <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-muted/30">
                <Timer className="size-4 text-muted-foreground" />
                <span className="text-sm">Duration:</span>
                <Input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(Math.max(1, parseInt(e.target.value) || 1))}
                  disabled={isAutonomousRunning}
                  className="w-20 h-8"
                />
                <span className="text-sm text-muted-foreground">minutes</span>
                {timeRemaining !== null && isAutonomousRunning && (
                  <Badge className="ml-auto bg-blue-500/20 text-blue-400">
                    {timeRemaining}m remaining
                  </Badge>
                )}
              </div>
            )}

            {mode === 'interval' && (
              <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-muted/30">
                <TimerReset className="size-4 text-muted-foreground" />
                <span className="text-sm">Check every:</span>
                <Input
                  type="number"
                  value={intervalMinutes}
                  onChange={(e) => setIntervalMinutes(Math.max(1, parseInt(e.target.value) || 1))}
                  disabled={isAutonomousRunning}
                  className="w-20 h-8"
                />
                <span className="text-sm text-muted-foreground">minutes</span>
              </div>
            )}

            {/* Task Input */}
            <div className="space-y-3">
              <Textarea
                placeholder="Enter your autonomous task... 

Examples:
- Monitor my Gmail for new emails from clients and draft responses
- Check GitHub issues every 5 minutes and respond to bugs
- Monitor Notion database for new entries and send notifications
- Watch Slack for mentions and summarize them
- Check calendar for upcoming events and send reminders"
                value={taskInput}
                onChange={(e) => setTaskInput(e.target.value)}
                disabled={isAutonomousRunning && mode !== 'interval'}
                className="min-h-[120px] resize-none"
              />
              
              <div className="flex gap-2">
                {!isAutonomousRunning ? (
                  <Button
                    className="flex-1"
                    onClick={startAutonomous}
                    disabled={!taskInput.trim() || isRunning || !agent}
                  >
                    {isRunning ? (
                      <>
                        <Loader2 className="size-4 mr-2 animate-spin" />
                        Executing...
                      </>
                    ) : (
                      <>
                        <Play className="size-4 mr-2" />
                        Start Autonomous Agent
                      </>
                    )}
                  </Button>
                ) : (
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={stopAutonomous}
                  >
                    <Square className="size-4 mr-2" />
                    Stop Autonomous
                  </Button>
                )}
              </div>
            </div>
          </Card>

          {/* Agent Status */}
          {agent && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="overflow-hidden border-border/50 bg-gradient-to-br from-card to-card/80">
                <div className="p-4 md:p-5">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
                    <div className="flex items-center gap-3">
                      <div className={cn("size-12 md:size-14 rounded-2xl flex items-center justify-center border-2", getStatusColor(agent.status))}>
                        {getStatusIcon(agent.status)}
                      </div>
                      <div>
                        <h3 className="font-bold text-base md:text-lg">{agent.config.name}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge className={cn("text-[10px] px-1.5 py-0", getStatusColor(agent.status))}>
                            {agent.status}
                          </Badge>
                          {isAutonomousRunning && (
                            <Badge className="text-[10px] px-1.5 py-0 bg-red-500/20 text-red-400 border-red-500/30">
                              <div className="size-1.5 rounded-full bg-red-400 mr-1 animate-pulse" />
                              LIVE
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Control Buttons */}
                    <div className="flex flex-wrap gap-1.5">
                      {agent.status === 'executing' && !isAutonomousRunning && (
                        <Button size="sm" variant="outline" onClick={pauseAgent}>
                          <Pause className="size-3" />
                        </Button>
                      )}
                      {agent.status === 'paused' && (
                        <Button size="sm" variant="outline" onClick={resumeAgent}>
                          <Play className="size-3" />
                        </Button>
                      )}
                      {(agent.status === 'executing' || agent.status === 'paused') && (
                        <Button size="sm" variant="destructive" onClick={abortAgent}>
                          <Square className="size-3" />
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={resetAgent}>
                        <RotateCcw className="size-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="grid grid-cols-4 gap-2">
                    <MetricCard
                      icon={<TrendingUp className="size-4 text-blue-400" />}
                      label="Success"
                      value={`${successRate}%`}
                    />
                    <MetricCard
                      icon={<Sparkles className="size-4 text-amber-400" />}
                      label="Corrections"
                      value={agent.metrics.selfCorrections.toString()}
                    />
                    <MetricCard
                      icon={<Brain className="size-4 text-purple-400" />}
                      label="Memories"
                      value={agent.memories.length.toString()}
                    />
                    <MetricCard
                      icon={<ActivitySquare className="size-4 text-emerald-400" />}
                      label="Runs"
                      value={executionCount.toString()}
                    />
                  </div>
                </div>

                {/* Progress Bar */}
                {agent.status === 'executing' && (
                  <div className="h-1 bg-muted overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-emerald-500 via-blue-500 to-purple-500"
                      animate={{ x: ['-100%', '100%'] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                    />
                  </div>
                )}
              </Card>
            </motion.div>
          )}

          {/* Mobile Content */}
          <div className="lg:hidden space-y-4">
            {activeTab === 'overview' && agent?.currentPlan && (
              <Card className="p-4 border-border/50">
                <button
                  className="flex items-center justify-between w-full mb-3"
                  onClick={() => setExpandedPlan(!expandedPlan)}
                >
                  <div className="flex items-center gap-2">
                    <Zap className="size-4 text-amber-500" />
                    <h4 className="font-medium text-sm">Plan</h4>
                    <Badge variant="secondary" className="text-[10px]">
                      {agent.currentPlan.steps.length} steps
                    </Badge>
                  </div>
                  {expandedPlan ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                </button>
                {expandedPlan && (
                  <div className="space-y-2 max-h-[200px] overflow-auto">
                    {agent.currentPlan.steps.slice(0, 5).map((step) => (
                      <div
                        key={step.id}
                        className={cn(
                          "p-2 rounded-lg text-xs flex items-start gap-2",
                          step.status === 'running' ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-muted/50'
                        )}
                      >
                        {getStepStatusIcon(step)}
                        <div className="flex-1 min-w-0">
                          <span className="text-muted-foreground">#{step.order}</span>
                          <span className="ml-1 font-medium">{step.action}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}

            {activeTab === 'thoughts' && (
              <Card className="p-4 border-border/50">
                <div className="flex items-center gap-2 mb-3">
                  <Lightbulb className="size-4 text-purple-500" />
                  <h4 className="font-medium text-sm">Reasoning</h4>
                </div>
                <div className="space-y-2 max-h-[300px] overflow-auto">
                  {agent?.thoughts.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">No thoughts yet</p>
                  ) : (
                    agent?.thoughts.slice(-5).reverse().map((thought) => (
                      <div key={thought.id} className="p-3 rounded-lg bg-muted/30 text-xs">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-muted-foreground">{new Date(thought.timestamp).toLocaleTimeString()}</span>
                          <span className="text-muted-foreground">{Math.round(thought.confidence * 100)}%</span>
                        </div>
                        <p className="font-medium">{thought.thought}</p>
                        <p className="text-muted-foreground text-[10px]">{thought.reasoning}</p>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            )}

            {activeTab === 'tasks' && (
              <Card className="p-4 border-border/50">
                <div className="space-y-2">
                  {tasks.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">No tasks yet</p>
                  ) : (
                    tasks.slice(0, 10).map((task) => (
                      <div key={task.id} className="p-3 rounded-lg bg-muted/50 text-xs">
                        <div className="flex items-center gap-2 mb-2">
                          <div className={cn("size-2 rounded-full", getTaskStatusColor(task.status))} />
                          <span className="font-medium truncate flex-1">{task.name}</span>
                        </div>
                        <Progress value={task.progress} className="h-1 mb-1" />
                        <span className="text-muted-foreground">{task.progress}%</span>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            )}
          </div>

          {/* Desktop: Plan and Thoughts */}
          <div className="hidden lg:grid lg:grid-cols-2 gap-4">
            {agent?.currentPlan && (
              <Card className="p-4 border-border/50">
                <button
                  className="flex items-center justify-between w-full mb-3"
                  onClick={() => setExpandedPlan(!expandedPlan)}
                >
                  <div className="flex items-center gap-2">
                    <Zap className="size-4 text-amber-500" />
                    <h4 className="font-medium">Execution Plan</h4>
                    <Badge variant="secondary">{agent.currentPlan.steps.length} steps</Badge>
                  </div>
                  {expandedPlan ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                </button>
                {expandedPlan && (
                  <div className="space-y-2 max-h-[250px] overflow-auto">
                    {agent.currentPlan.steps.map((step) => (
                      <div
                        key={step.id}
                        className={cn(
                          "p-3 rounded-lg flex items-start gap-3",
                          step.status === 'running' ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-muted/30'
                        )}
                      >
                        {getStepStatusIcon(step)}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">#{step.order}</span>
                            <span className="font-medium text-sm">{step.action}</span>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{step.expectedOutcome}</p>
                          {step.error && <p className="text-xs text-red-400 mt-1">{step.error}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}

            <Card className="p-4 border-border/50">
              <button
                className="flex items-center justify-between w-full mb-3"
                onClick={() => setExpandedThoughts(!expandedThoughts)}
              >
                <div className="flex items-center gap-2">
                  <Lightbulb className="size-4 text-purple-500" />
                  <h4 className="font-medium">Reasoning</h4>
                  <Badge variant="secondary">{agent?.thoughts.length || 0}</Badge>
                </div>
                {expandedThoughts ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              </button>
              {expandedThoughts && (
                <div className="space-y-3 max-h-[250px] overflow-auto">
                  {agent?.thoughts.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No thoughts yet. Start a task to see the agent reasoning.</p>
                  ) : (
                    agent?.thoughts.slice(-5).reverse().map((thought) => (
                      <motion.div
                        key={thought.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
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
                        <p className="text-xs text-primary font-medium">{thought.decision}</p>
                      </motion.div>
                    ))
                  )}
                </div>
              )}
            </Card>
          </div>
        </div>

        {/* Sidebar - Background Tasks */}
        <div className="lg:w-80 border-t lg:border-t-0 lg:border-l border-border/50 bg-card/30 backdrop-blur-sm p-4 overflow-auto">
          <h3 className="font-medium mb-4 flex items-center gap-2">
            <Activity className="size-4" />
            Execution History
            <Badge variant="secondary" className="ml-auto">{tasks.length}</Badge>
          </h3>
          
          {tasks.length === 0 ? (
            <div className="text-center py-8">
              <div className="size-12 rounded-full bg-muted mx-auto mb-3 flex items-center justify-center">
                <ListTodo className="size-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">No executions yet</p>
              <p className="text-xs text-muted-foreground mt-1">Start an autonomous task</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tasks.slice(0, 20).map((task) => (
                <Card key={task.id} className="p-3 bg-card/80 border-border/50">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={cn("size-2 rounded-full", getTaskStatusColor(task.status))} />
                    <span className="text-sm font-medium truncate flex-1">{task.name}</span>
                  </div>
                  <Progress value={task.progress} className="h-1.5 mb-2" />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground capitalize">{task.status}</span>
                    <span className="text-xs text-muted-foreground">{task.progress}%</span>
                  </div>
                  {task.progressMessage && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">{task.progressMessage}</p>
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

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className="p-2.5 rounded-xl bg-muted/30 border border-border/50 text-center"
    >
      <div className="flex items-center justify-center mb-1.5">{icon}</div>
      <p className="text-lg font-bold">{value}</p>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
    </motion.div>
  );
}
