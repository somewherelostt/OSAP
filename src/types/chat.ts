export type MessageRole = 'user' | 'agent' | 'system';
export type MessageStatus = 'sending' | 'thinking' | 'streaming' | 'done' | 'error';

export interface ToolExecutionCard {
  tool: string;           // e.g. "GMAIL_FETCH_EMAILS"
  description: string;    // e.g. "Fetching your last 5 emails..."
  status: 'running' | 'done' | 'error';
  result?: unknown;
  formattedResult?: string;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;             // text content
  status: MessageStatus;
  timestamp: Date | string;
  taskId?: string;             // linked task ID if this message spawned a task
  toolExecutions?: ToolExecutionCard[];  // shown as inline cards
  planSteps?: Array<{ tool: string; description: string; status: string }>;
  authInfo?: {
    type: 'REQUIRES_AUTH';
    toolkit: string;
    authUrl: string;
    message: string;
  };
}
