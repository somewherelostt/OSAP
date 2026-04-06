import { generatePlan } from '@/lib/glm';
import { getContextForTaskWithKnowledge, storeMemory as hydraStoreMemory } from '@/lib/hydra';
import { createMemoryNode } from '@/lib/database';
import { summarizeForMemory } from '@/lib/executor-enhanced';
import { executeTool } from '@/lib/tools-enhanced';
import { executeComposioToolCall } from '@/lib/composio';
import { DEFAULT_POLICY } from '@/lib/tool-categories';
import { extractJSON } from '../json';

export type AgentStatus = 'idle' | 'planning' | 'executing' | 'paused' | 'completed' | 'failed';
export type AgentPriority = 'low' | 'medium' | 'high' | 'critical';

export interface AgentThought {
  id: string;
  timestamp: string;
  thought: string;
  reasoning: string;
  decision: string;
  confidence: number;
}

export interface AgentPlan {
  id: string;
  objective: string;
  steps: AgentStep[];
  currentStepIndex: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  reasoning: string;
}

export interface AgentStep {
  id: string;
  order: number;
  action: string;
  input: Record<string, unknown>;
  expectedOutcome: string;
  actualOutcome?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  retryCount: number;
  maxRetries: number;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface AgentMemory {
  id: string;
  agentId: string;
  type: 'success' | 'failure' | 'strategy' | 'context';
  content: string;
  context: string;
  outcome: 'positive' | 'negative' | 'neutral';
  successRate: number;
  useCount: number;
  lastUsed: string;
  createdAt: string;
}

export interface AgentConfig {
  id: string;
  name: string;
  capabilities: string[];
  maxRetries: number;
  timeoutMs: number;
  selfCorrect: boolean;
  learnFromMistakes: boolean;
  priority: AgentPriority;
}

export interface Agent {
  id: string;
  config: AgentConfig;
  status: AgentStatus;
  currentPlan: AgentPlan | null;
  thoughts: AgentThought[];
  memories: AgentMemory[];
  metrics: AgentMetrics;
  createdAt: string;
  updatedAt: string;
  lastActiveAt: string;
}

export interface AgentMetrics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTimeMs: number;
  totalTokensUsed: number;
  selfCorrections: number;
  learnedStrategies: number;
}

export interface ExecutionContext {
  userId: string;
  sessionId: string;
  input: string;
  context: Record<string, unknown>;
  constraints?: string[];
  deadline?: string;
}

export interface ExecutionResult {
  success: boolean;
  agentId: string;
  planId: string;
  output: unknown;
  error?: string;
  corrections: Correction[];
  metrics: {
    durationMs: number;
    tokensUsed: number;
    stepsCompleted: number;
    selfCorrections: number;
  };
}

export interface Correction {
  type: 'retry' | 'replan' | 'abort' | 'escalate';
  reason: string;
  originalStep?: string;
  newApproach?: string;
  success: boolean;
}

const defaultAgentConfig: AgentConfig = {
  id: '',
  name: 'OSAP Agent',
  capabilities: ['reasoning', 'planning', 'execution', 'learning'],
  maxRetries: 3,
  timeoutMs: 300000,
  selfCorrect: true,
  learnFromMistakes: true,
  priority: 'medium',
};

const defaultMetrics: AgentMetrics = {
  totalExecutions: 0,
  successfulExecutions: 0,
  failedExecutions: 0,
  averageExecutionTimeMs: 0,
  totalTokensUsed: 0,
  selfCorrections: 0,
  learnedStrategies: 0,
};

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export class AgentOrchestrator {
  private agents: Map<string, Agent> = new Map();
  private executionQueue: ExecutionContext[] = [];
  private isProcessing = false;
  private onThought?: (agentId: string, thought: AgentThought) => void;
  private onStatusChange?: (agentId: string, status: AgentStatus) => void;

  constructor(options?: {
    onThought?: (agentId: string, thought: AgentThought) => void;
    onStatusChange?: (agentId: string, status: AgentStatus) => void;
  }) {
    this.onThought = options?.onThought;
    this.onStatusChange = options?.onStatusChange;
  }

  createAgent(config: Partial<AgentConfig> = {}): Agent {
    const id = config.id || generateId();
    const fullConfig = { ...defaultAgentConfig, ...config, id };
    
    const agent: Agent = {
      id,
      config: fullConfig,
      status: 'idle',
      currentPlan: null,
      thoughts: [],
      memories: [],
      metrics: { ...defaultMetrics },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    };

    this.agents.set(id, agent);
    return agent;
  }

  getAgent(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  getAllAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  async think(agentId: string, context: ExecutionContext, event?: string): Promise<AgentThought> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    let memoryContext = '';
    try {
      const { memoryContext: memCtx, knowledgeContext: knowCtx } = await getContextForTaskWithKnowledge(context.input, context.userId);
      memoryContext = [memCtx, knowCtx].filter(Boolean).join('\n\n');
    } catch (e) {
      console.warn('[Orchestrator] Failed to fetch context for thinking:', e);
    }

    const thought: AgentThought = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      thought: '',
      reasoning: '',
      decision: '',
      confidence: 0,
    };

    const prompt = this.buildThoughtPrompt(agent, context, memoryContext, event);
    
    try {
      const response = await this.callLLM(prompt);
      thought.thought = (response.thought as string) || (event ? `Responding to ${event}` : 'Thinking about the goal');
      thought.reasoning = (response.reasoning as string) || 'Analyzing current state and objectives';
      thought.decision = (response.decision as string) || 'Proceed with current plan';
      thought.confidence = typeof response.confidence === 'number' ? response.confidence : 0.8;
    } catch (error) {
      thought.thought = 'Error in reasoning';
      thought.reasoning = `AI call failed: ${error instanceof Error ? error.message : 'Unknown'}`;
      thought.decision = 'Retry or abort';
      thought.confidence = 0.1;
    }

    agent.thoughts.push(thought);
    if (agent.thoughts.length > 20) agent.thoughts.shift();
    
    agent.updatedAt = new Date().toISOString();
    this.onThought?.(agentId, thought);
    
    return thought;
  }

  private buildThoughtPrompt(agent: Agent, context: ExecutionContext, memoryContext: string, event?: string): string {
    const status = agent.status;
    const planProgress = agent.currentPlan 
      ? `Current Plan Progress: ${agent.currentPlan.currentStepIndex + 1}/${agent.currentPlan.steps.length}`
      : 'No active plan';

    const recentThoughts = agent.thoughts.slice(-3).map(t => `- ${t.thought}: ${t.decision}`).join('\n');

    return `You are ${agent.config.name}, an autonomous agent.
Status: ${status}
Objective: ${context.input}
${planProgress}
${event ? `Recent Event: ${event}` : ''}

${memoryContext ? `Relevant Context:\n${memoryContext}` : ''}
${recentThoughts ? `Recent Reasoning:\n${recentThoughts}` : ''}

Think through this situation:
1. What is the immediate next priority?
2. Are there any risks or failures to address?
3. How does this align with the overall objective?

Output your thought process in JSON format:
{
  "thought": "Short summary of current state",
  "reasoning": "Detailed reasoning for next step",
  "decision": "Your immediate decision",
  "confidence": 0.0-1.0
}`;
  }

  async plan(agentId: string, context: ExecutionContext): Promise<AgentPlan> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    agent.status = 'planning';
    agent.updatedAt = new Date().toISOString();
    this.onStatusChange?.(agentId, 'planning');

    await this.think(agentId, context, 'Starting planning phase');
    
    let memoryContext = '';
    try {
      const { memoryContext: memCtx, knowledgeContext: knowCtx } = await getContextForTaskWithKnowledge(context.input, context.userId);
      memoryContext = [memCtx, knowCtx].filter(Boolean).join('\n\n');
    } catch (e) {
      console.warn('[Orchestrator] Planning context fetch failed:', e);
    }

    const plan: AgentPlan = {
      id: generateId(),
      objective: context.input,
      steps: [],
      currentStepIndex: 0,
      status: 'pending',
      reasoning: 'Initializing plan based on objectives and context...',
    };

    try {
      const result = await generatePlan(context.input, memoryContext);
      
      if ('error' in result) {
        throw new Error(result.error);
      }

      plan.steps = result.plan.steps.map((step, index) => ({
        id: step.id || generateId(),
        order: step.order || index + 1,
        action: step.tool,
        input: step.input || {},
        expectedOutcome: step.description || '',
        status: 'pending',
        retryCount: 0,
        maxRetries: agent.config.maxRetries,
      }));
      
      plan.status = 'in_progress';
      plan.reasoning = result.reasoning;
    } catch (error) {
      plan.status = 'failed';
      plan.steps = [{
        id: generateId(),
        order: 1,
        action: 'error',
        input: {},
        expectedOutcome: '',
        status: 'failed',
        retryCount: 0,
        maxRetries: 0,
        error: error instanceof Error ? error.message : 'Planning failed',
      }];
    }

    agent.currentPlan = plan;
    agent.updatedAt = new Date().toISOString();
    
    return plan;
  }

  async executeStep(agentId: string, stepId: string, executor: (step: AgentStep, context: ExecutionContext) => Promise<unknown>): Promise<{ success: boolean; output?: unknown; error?: string }> {
    const agent = this.agents.get(agentId);
    if (!agent || !agent.currentPlan) throw new Error('Agent or plan not found');

    const step = agent.currentPlan.steps.find(s => s.id === stepId);
    if (!step) throw new Error(`Step ${stepId} not found`);

    const context: ExecutionContext = {
      userId: agent.id, // Keep agent context or pass user context if needed
      sessionId: generateId(),
      input: agent.currentPlan.objective,
      context: {},
    };

    step.status = 'running';
    step.startedAt = new Date().toISOString();
    agent.status = 'executing';
    agent.updatedAt = new Date().toISOString();
    this.onStatusChange?.(agentId, 'executing');

    try {
      const output = await Promise.race([
        executor(step, context),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Step timeout')), agent.config.timeoutMs)
        ),
      ]);

      step.status = 'completed';
      step.actualOutcome = JSON.stringify(output);
      step.completedAt = new Date().toISOString();
      
      return { success: true, output };
    } catch (error) {
      step.status = 'failed';
      step.error = error instanceof Error ? error.message : 'Unknown error';
      step.completedAt = new Date().toISOString();
      
      return { success: false, error: step.error };
    }
  }

  async correct(agentId: string, failedStepId: string, corrector: (step: AgentStep, error: string) => Promise<Correction>): Promise<Correction> {
    const agent = this.agents.get(agentId);
    if (!agent || !agent.currentPlan) throw new Error('Agent or plan not found');

    const failedStep = agent.currentPlan.steps.find(s => s.id === failedStepId);
    if (!failedStep) throw new Error(`Step ${failedStepId} not found`);

    const correction = await corrector(failedStep, failedStep.error || 'Unknown error');
    
    agent.metrics.selfCorrections++;

    this.recordOutcome(agent, {
      type: correction.type,
      reason: correction.reason,
      originalStep: correction.originalStep || failedStep.action,
      newApproach: correction.newApproach,
      success: correction.success,
    });

    return correction;
  }

  private async callLLM(prompt: string): Promise<Record<string, unknown>> {
    const apiKey = process.env.GLM_API_KEY;
    const apiUrl = process.env.GLM_API_URL || 'https://api.z.ai/api/coding/paas/v4';

    if (!apiKey) {
      return {
        thought: 'API key not configured - operating in fallback mode',
        reasoning: 'Cannot call LLM without API key',
        decision: 'Use simple heuristics',
        confidence: 0.3,
      };
    }

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'glm-5.1',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 1024,
        }),
      });

      if (!response.ok) {
        throw new Error(`LLM API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      
      if (!content) throw new Error('No response from LLM');

      return extractJSON(content);
    } catch (error) {
      console.error('[AgentOrchestrator] LLM call failed:', error);
      throw error;
    }
  }

  private getRelevantMemories(agent: Agent, context: string): AgentMemory[] {
    const contextLower = context.toLowerCase();
    
    return agent.memories
      .filter(m => {
        const contentMatch = m.content.toLowerCase().includes(contextLower.substring(0, 50));
        const typeMatch = m.type === 'success' || m.type === 'failure';
        return contentMatch && typeMatch;
      })
      .sort((a, b) => {
        const scoreA = a.successRate * (1 / (a.useCount + 1));
        const scoreB = b.successRate * (1 / (b.useCount + 1));
        return scoreB - scoreA;
      })
      .slice(0, 3);
  }

  private recordOutcome(agent: Agent, outcome: {
    type: string;
    reason: string;
    originalStep?: string;
    newApproach?: string;
    success: boolean;
  }): void {
    const memory: AgentMemory = {
      id: generateId(),
      agentId: agent.id,
      type: outcome.success ? 'success' : 'failure',
      content: `${outcome.originalStep || 'Step'} -> ${outcome.newApproach || outcome.type}: ${outcome.reason}`,
      context: agent.currentPlan?.objective || '',
      outcome: outcome.success ? 'positive' : 'negative',
      successRate: outcome.success ? 100 : 0,
      useCount: 0,
      lastUsed: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    const existingIndex = agent.memories.findIndex(
      m => m.content === memory.content && m.agentId === agent.id
    );

    if (existingIndex >= 0) {
      const existing = agent.memories[existingIndex];
      existing.useCount++;
      existing.lastUsed = new Date().toISOString();
      existing.successRate = outcome.success 
        ? Math.min(100, existing.successRate + 10)
        : Math.max(0, existing.successRate - 20);
    } else {
      agent.memories.push(memory);
      if (agent.memories.length > 100) {
        agent.memories.sort((a, b) => b.useCount - a.useCount);
        agent.memories = agent.memories.slice(0, 100);
      }
    }

    agent.updatedAt = new Date().toISOString();
  }

  updateMetrics(agentId: string, metrics: Partial<AgentMetrics>): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    agent.metrics = { ...agent.metrics, ...metrics };
    agent.updatedAt = new Date().toISOString();
  }

  setStatus(agentId: string, status: AgentStatus): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    agent.status = status;
    agent.updatedAt = new Date().toISOString();
    if (status !== 'idle') {
      agent.lastActiveAt = new Date().toISOString();
    }
    this.onStatusChange?.(agentId, status);
  }

  pause(agentId: string): void {
    this.setStatus(agentId, 'paused');
  }

  resume(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent?.currentPlan) {
      this.setStatus(agentId, 'executing');
    }
  }

  abort(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    if (agent.currentPlan) {
      agent.currentPlan.status = 'failed';
      agent.currentPlan.steps.forEach(step => {
        if (step.status === 'running' || step.status === 'pending') {
          step.status = 'skipped';
        }
      });
    }
    
    this.setStatus(agentId, 'failed');
  }

  clearThoughts(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    agent.thoughts = [];
    agent.updatedAt = new Date().toISOString();
  }

  clearPlan(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    agent.currentPlan = null;
    this.setStatus(agentId, 'idle');
  }

  deleteAgent(agentId: string): boolean {
    return this.agents.delete(agentId);
  }

  getReasoning(agentId: string): { thoughts: AgentThought[]; plan: AgentPlan | null } {
    const agent = this.agents.get(agentId);
    if (!agent) return { thoughts: [], plan: null };
    return {
      thoughts: agent.thoughts.slice(-10),
      plan: agent.currentPlan,
    };
  }
}

let orchestratorInstance: AgentOrchestrator | null = null;

export function getAgentOrchestrator(): AgentOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new AgentOrchestrator();
  }
  return orchestratorInstance;
}

export function resetAgentOrchestrator(): void {
  orchestratorInstance = null;
}
