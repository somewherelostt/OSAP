// Database types
export interface DbUser {
  id: string;
  clerk_id?: string;
  email: string;
  name?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface DbTask {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  input: string;
  plan?: TaskPlan;
  result?: unknown;
  error?: string;
  created_at: string;
  updated_at: string;
}

export interface DbTaskStep {
  id: string;
  task_id: string;
  step_order: number;
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_output?: unknown;
  status: 'pending' | 'running' | 'success' | 'failed';
  error?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

export interface DbExecution {
  id: string;
  task_id?: string;
  step_id?: string;
  user_id: string;
  action: string;
  input?: Record<string, unknown>;
  output?: unknown;
  status: 'success' | 'failed';
  error?: string;
  created_at: string;
}

export interface DbMemoryNode {
  id: string;
  user_id: string;
  type: 'fact' | 'preference' | 'context' | 'interaction' | 'task_summary' | 'key_output';
  content: string;
  source?: string;
  metadata: Record<string, unknown>;
  importance: number;
  created_at: string;
  updated_at: string;
}

// AI Types
export interface TaskPlan {
  goal: string;
  answer?: string | null;
  steps: PlanStep[];
  reasoning?: string;
}

export interface PlanStep {
  id: string;
  order: number;
  tool: string;
  input: Record<string, unknown>;
  description: string;
  depends_on: string[];
  status?: 'pending' | 'running' | 'success' | 'failed';
}

// Tool Types
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
}

export interface ToolExecution {
  tool_name: string;
  input: Record<string, unknown>;
  output?: unknown;
  error?: string;
  duration_ms?: number;
}

// API Types
export interface CreateTaskInput {
  input: string;
  user_id: string;
}

export interface CreateTaskOutput {
  task: DbTask;
}

export interface TaskWithSteps extends DbTask {
  steps: DbTaskStep[];
}

export interface MemorySearchResult {
  nodes: DbMemoryNode[];
  query: string;
  total: number;
}

// Session types for Composio
export interface ToolSession {
  id: string;
  user_id: string;
  connected_toolkits: string[];
  created_at: string;
  expires_at: string;
}
