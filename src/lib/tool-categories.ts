export type ToolCategory = 
  | 'read'       // View, search, retrieve - always allowed
  | 'write'      // Create, edit, modify - ask permission
  | 'delete'     // Remove, destroy - ask permission  
  | 'execute'    // Run commands, code - restricted
  | 'mcp'        // MCP server tools - ask permission
  | 'composio'   // Composio meta-tools - policy-based
  | 'critical'; // Dangerous operations - YOLO only

export interface ToolCapability {
  name: string;
  category: ToolCategory;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  requiresAuth?: boolean;
  allowedOrigins?: string[];
}

export interface ToolPermission {
  toolName: string;
  category: ToolCategory;
  allowed: boolean;
  reason?: string;
}

export interface CapabilityPolicy {
  allowComposioSearch: boolean;
  allowComposioExecute: boolean;
  allowWorkspace: boolean;
  allowedTools: string[];
  blockedTools: string[];
  maxSteps: number;
}

export const TOOL_CATEGORIES: Record<string, ToolCategory> = {
  // Read tools - always allowed
  'search_memory': 'read',
  'memory_recall': 'read',
  'github_get_issues': 'read',
  'github_get_repo': 'read',
  'http_request': 'read',
  'web_search': 'read',
  
  // Write tools - ask permission
  'github_create_issue': 'write',
  'github_create_pr': 'write',
  'github_comment': 'write',
  'twitter_post': 'write',
  'email_send': 'write',
  'memory_store': 'write',
  
  // Delete tools - ask permission
  'github_delete_issue': 'delete',
  'github_delete_comment': 'delete',
  'memory_delete': 'delete',
  
  // Execute tools - restricted
  'workspace_execute_command': 'execute',
  'code_interpreter': 'execute',
  
  // Composio meta-tools
  'composio_search_tools': 'composio',
  'composio_execute_tool': 'composio',
  'composio_manage_connections': 'composio',
  
  // Critical - YOLO only
  'workspace_delete': 'critical',
  'workspace_format': 'critical',
};

export const DEFAULT_POLICY: CapabilityPolicy = {
  allowComposioSearch: true,
  allowComposioExecute: false,
  allowWorkspace: false,
  allowedTools: [
    'search_memory',
    'memory_recall', 
    'memory_store',
    'github_get_issues',
    'github_create_issue',
    'http_request',
  ],
  blockedTools: [
    'workspace_delete',
    'workspace_execute_command',
    'composio_manage_connections',
  ],
  maxSteps: 10,
};

export function getToolCategory(toolName: string): ToolCategory {
  return TOOL_CATEGORIES[toolName] || 'write';
}

export function isToolAllowed(
  toolName: string, 
  policy: CapabilityPolicy
): boolean {
  if (policy.blockedTools.includes(toolName)) return false;
  if (policy.allowedTools.includes(toolName)) return true;
  if (policy.allowComposioExecute && toolName.startsWith('composio_')) return true;
  return false;
}
