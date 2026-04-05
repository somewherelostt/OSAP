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

  async think(agentId: string, context: ExecutionContext): Promise<AgentThought> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    const thought: AgentThought = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      thought: '',
      reasoning: '',
      decision: '',
      confidence: 0,
    };

    const prompt = this.buildThoughtPrompt(agent, context);
    
    try {
      const response = await this.callLLM(prompt);
      Object.assign(thought, response);
    } catch (error) {
      thought.reasoning = `Error in reasoning: ${error instanceof Error ? error.message : 'Unknown'}`;
      thought.confidence = 0;
    }

    agent.thoughts.push(thought);
    agent.updatedAt = new Date().toISOString();
    
    this.onThought?.(agentId, thought);
    
    return thought;
  }

  private buildThoughtPrompt(agent: Agent, context: ExecutionContext): string {
    const relevantMemories = this.getRelevantMemories(agent, context.input);
    const memoryContext = relevantMemories.length > 0 
      ? `\nRelevant past experiences:\n${relevantMemories.map(m => `- ${m.content} (success rate: ${m.successRate}%)`).join('\n')}`
      : '';

    return `You are ${agent.config.name}, an autonomous agent with the following capabilities:
${agent.config.capabilities.join(', ')}

Current objective: ${context.input}
${memoryContext}

Think through this step by step:
1. What is the goal?
2. What are the sub-tasks needed?
3. What could go wrong?
4. How will you measure success?

Output your thought process, reasoning, and decision in JSON format:
{
  "thought": "What you're thinking about",
  "reasoning": "Why you think this approach will work",
  "decision": "What you've decided to do",
  "confidence": 0.0-1.0
}`;
  }

  async plan(agentId: string, context: ExecutionContext): Promise<AgentPlan> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    agent.status = 'planning';
    agent.updatedAt = new Date().toISOString();
    this.onStatusChange?.(agentId, 'planning');

    const thought = await this.think(agentId, context);
    
    const plan: AgentPlan = {
      id: generateId(),
      objective: context.input,
      steps: [],
      currentStepIndex: 0,
      status: 'pending',
      reasoning: thought.reasoning,
    };

    const stepsPrompt = `Based on your thought process, create a detailed execution plan.

Objective: ${context.input}
Reasoning: ${thought.reasoning}

For each step provide:
- action: what to do
- input: what inputs are needed
- expectedOutcome: what success looks like

Output as JSON array of steps:
[
  {
    "action": "action name",
    "input": {"key": "value"},
    "expectedOutcome": "description"
  }
]`;

    try {
      const stepsResponse = await this.callLLM(stepsPrompt);
      const steps = Array.isArray(stepsResponse.steps) ? stepsResponse.steps : [];
      
      plan.steps = steps.map((step: Record<string, unknown>, index: number) => ({
        id: generateId(),
        order: index + 1,
        action: step.action as string || 'unknown',
        input: (step.input as Record<string, unknown>) || {},
        expectedOutcome: step.expectedOutcome as string || '',
        status: 'pending',
        retryCount: 0,
        maxRetries: agent.config.maxRetries,
      }));
      
      plan.status = 'in_progress';
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
      userId: agent.id,
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

      const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || content.match(/(\{[\s\S]*\})/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;
      
      return JSON.parse(jsonStr);
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
