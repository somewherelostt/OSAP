import type { ToolDefinition } from '@/types/database';
import { isToolAllowed, type CapabilityPolicy } from './tool-categories';

export interface ComposioTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  enabled: boolean;
  connected: boolean;
  authType?: string;
}

export interface ToolSearchResult {
  tools: ComposioTool[];
  total: number;
  query: string;
}

export interface ComposioConnectedAccount {
  id: string;
  app: string;
  status: string;
  createdAt: string;
  accountId: string;
}

function isComposioConfigured(): boolean {
  return !!process.env.COMPOSIO_API_KEY;
}

const sessionCache = new Map<string, any>();
const clientCache = new Map<string, any>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getClient(): any {
  if (!isComposioConfigured()) {
    throw new Error('COMPOSIO_API_KEY not configured');
  }
  
  const cacheKey = 'default';
  if (!clientCache.has(cacheKey)) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Composio } = require('@composio/core');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    clientCache.set(cacheKey, new Composio({ apiKey: process.env.COMPOSIO_API_KEY! }));
  }
  return clientCache.get(cacheKey)!;
}

export async function getComposioSession(userId: string) {
  if (!isComposioConfigured()) {
    throw new Error('COMPOSIO_API_KEY not configured');
  }

  if (sessionCache.has(userId)) {
    return sessionCache.get(userId)!;
  }

  const client = getClient();
  const session = await client.create(userId, { manageConnections: true });
  sessionCache.set(userId, session);
  return session;
}

export async function getComposioTools(userId: string): Promise<ComposioTool[]> {
  if (!isComposioConfigured()) {
    console.log('[Composio] Not configured - returning empty tool list');
    return [];
  }

  try {
    const session = await getComposioSession(userId);
    const tools = await session.tools();
    
    if (!tools || !Array.isArray(tools)) {
      return [];
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return tools.map((tool: any) => ({
      name: tool.name || tool.function?.name || String(tool),
      description: tool.description || `Execute tool`,
      inputSchema: tool.parameters || tool.function?.parameters || {},
      enabled: true,
      connected: true,
    }));
  } catch (error) {
    console.error('[Composio] Failed to fetch tools:', error);
    return [];
  }
}

export async function executeComposioToolCall(
  userId: string,
  toolCall: { name: string; parameters: Record<string, unknown> }
): Promise<{ success: boolean; data?: unknown; error: string }> {
  if (!isComposioConfigured()) {
    return { success: false, error: 'Composio not configured' };
  }

  try {
    const session = await getComposioSession(userId);
    
    const result = await session.execute(toolCall.name, toolCall.parameters);

    return { success: true, data: result, error: '' };
  } catch (error: any) {
    console.error(`[Composio] Tool execution failed for ${toolCall.name}:`, error);
    
    let errorMessage = error?.message || String(error);
    
    try {
      if (typeof error === 'object' && error !== null) {
        if (error?.error?.error?.message) {
          errorMessage = error.error.error.message;
        } else if (error?.error?.message) {
          errorMessage = error.error.message;
        } else if (error?.message) {
          errorMessage = error.message;
        }
      } else if (errorMessage.startsWith('{')) {
        const parsed = JSON.parse(errorMessage);
        if (parsed?.error?.message) {
          errorMessage = parsed.error.message;
        } else if (parsed?.message) {
          errorMessage = parsed.message;
        }
      }
    } catch {}
    
    const isNotConnected = 
      errorMessage.includes('no connected account') ||
      errorMessage.includes('not connected') ||
      errorMessage.includes('authentication') ||
      errorMessage.includes('OAuth') ||
      errorMessage.includes('UNAUTHORIZED') ||
      errorMessage.includes('4302') ||
      errorMessage.includes('403');
    
    return {
      success: false,
      error: isNotConnected 
        ? `${getAppNameFromTool(toolCall.name)} not connected — Connect in Profile → Connected Apps to enable this action`
        : errorMessage.substring(0, 200),
    };
  }
}

function getAppNameFromTool(toolName: string): string {
  const appMap: Record<string, string> = {
    GMAIL: 'Gmail',
    GITHUB: 'GitHub',
    SLACK: 'Slack',
    TWITTER: 'Twitter/X',
    GOOGLECALENDAR: 'Google Calendar',
    NOTION: 'Notion',
    LINEAR: 'Linear',
    JIRA: 'Jira',
    HUBSPOT: 'HubSpot',
    SALESFORCE: 'Salesforce',
  };
  
  const upper = toolName.toUpperCase();
  for (const [app, name] of Object.entries(appMap)) {
    if (upper.includes(app)) {
      return name;
    }
  }
  return 'the app';
}

export async function testComposioConnection(): Promise<{ 
  success: boolean; 
  toolCount: number; 
  error?: string 
}> {
  if (!isComposioConfigured()) {
    return { success: false, toolCount: 0, error: 'COMPOSIO_API_KEY not set' };
  }

  try {
    const { Composio } = await import('@composio/core');
    const client = new Composio({ apiKey: process.env.COMPOSIO_API_KEY! });
    const session = await client.create('test_connection', { manageConnections: true });
    const tools = await session.tools();
    return { success: true, toolCount: Array.isArray(tools) ? tools.length : 0 };
  } catch (error: any) {
    return { 
      success: false, 
      toolCount: 0, 
      error: error?.message || 'Connection test failed' 
    };
  }
}

export async function getComposioAuthUrl(
  userId: string,
  toolkit: string
): Promise<{ authUrl: string; error?: string }> {
  if (!isComposioConfigured()) {
    return { authUrl: '', error: 'Composio not configured' };
  }

  try {
    const session = await getComposioSession(userId);
    
    const connectionRequest = await session.authorize(toolkit.toUpperCase(), {
      callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/composio-callback`,
    });

    const redirectUrl = (connectionRequest as any).redirectUrl || (connectionRequest as any).data?.redirectUrl || '';
    
    if (!redirectUrl) {
      return { authUrl: '', error: 'No redirect URL returned from Composio' };
    }

    return { authUrl: redirectUrl };
  } catch (error: any) {
    console.error(`[Composio] Failed to get auth URL for ${toolkit}:`, error);
    return { 
      authUrl: '', 
      error: error?.message || 'Failed to get auth URL' 
    };
  }
}

export async function getComposioConnectionStatus(
  userId: string
): Promise<{
  connected: string[];
  available: string[];
}> {
  if (!isComposioConfigured()) {
    return { connected: [], available: [] };
  }

  try {
    const session = await getComposioSession(userId);
    const client = getClient();
    
    let connected: string[] = [];
    
    // Try session.toolkits() first - returns { items: [...], nextCursor, totalPages }
    try {
      const toolkitsResult = await session.toolkits();
      if (toolkitsResult?.items && Array.isArray(toolkitsResult.items)) {
        connected = toolkitsResult.items
          .filter((t: any) => t.connection?.isActive)
          .map((t: any) => (t.slug || t.name || '').toLowerCase())
          .filter(Boolean);
      }
    } catch (tErr) {
      // Try client.connectedAccounts.list as fallback
      try {
        const accountsResult = await (client.connectedAccounts as any).list({ user_ids: [userId] });
        if (accountsResult?.items && Array.isArray(accountsResult.items)) {
          connected = accountsResult.items
            .map((acc: any) => {
              const slug = acc.toolkit?.slug || acc.app;
              return slug ? slug.toLowerCase() : '';
            })
            .filter(Boolean);
        }
      } catch (aErr) {
        // silently fail
      }
    }

    const allApps = ['gmail', 'github', 'slack', 'googlecalendar', 'twitter', 'notion', 'linear', 'jira'];
    const available = allApps.filter(app => !connected.includes(app));

    return { connected, available };
  } catch (error: any) {
    console.error('[Composio] Failed to get connection status:', error);
    return { connected: [], available: ['gmail', 'github', 'slack', 'googlecalendar', 'twitter', 'notion'] };
  }
}

export async function disconnectComposioApp(
  userId: string,
  toolkit: string
): Promise<{ success: boolean; error?: string }> {
  if (!isComposioConfigured()) {
    return { success: false, error: 'Composio not configured' };
  }

  try {
    const session = await getComposioSession(userId);
    const client = getClient();
    
    // Try client.connectedAccounts.delete first (uses user_ids filter)
    try {
      const accountsResult = await (client.connectedAccounts as any).list({ 
        user_ids: [userId],
        toolkit_slugs: [toolkit.toLowerCase()]
      });
      const account = (accountsResult.items || []).find((acc: any) => {
        const slug = (acc.toolkit?.slug || acc.app || '').toLowerCase();
        return slug === toolkit.toLowerCase();
      });

      if (account?.id) {
        await (client.connectedAccounts as any).delete(account.id);
      }
    } catch (e) {
      // Try toolkit disable as fallback
      try {
        await session.toolkits({ disable: [toolkit.toUpperCase()] });
      } catch (tErr) {
        // silently fail
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error(`[Composio] Failed to disconnect ${toolkit}:`, error);
    return { success: false, error: error?.message || 'Failed to disconnect' };
  }
}

export async function searchTools(
  query: string,
  limit = 20
): Promise<ToolSearchResult> {
  if (!isComposioConfigured()) {
    return { tools: [], total: 0, query };
  }

  try {
    const { Composio } = await import('@composio/core');
    const client = new Composio({ apiKey: process.env.COMPOSIO_API_KEY! });
    const session = await client.create('search_user');
    
    const results = await session.search({ query, toolkits: [] });
    
    const items = (results as any).items || [];
    return {
      tools: items.slice(0, limit).map((tool: any) => ({
        name: tool.name || tool.toolSlug || String(tool),
        description: tool.description || `Execute ${tool.name || tool.toolSlug}`,
        inputSchema: {},
        enabled: true,
        connected: true,
      })),
      total: items.length,
      query,
    };
  } catch (error) {
    console.error('[Composio] Tool search failed:', error);
    return { tools: [], total: 0, query };
  }
}

export function filterToolsByPolicy(
  tools: ToolDefinition[],
  policy: CapabilityPolicy
): ToolDefinition[] {
  return tools.filter((tool) => isToolAllowed(tool.name, policy));
}

export function createComposioMetaTools(): ToolDefinition[] {
  return [
    {
      name: 'composio_search_tools',
      description: 'Search for available tools using natural language',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Natural language search query' },
          limit: { type: 'number', default: 20 },
        },
        required: ['query'],
      },
    },
    {
      name: 'composio_execute_tool',
      description: 'Execute a tool from the Composio toolkit',
      input_schema: {
        type: 'object',
        properties: {
          toolName: { type: 'string', description: 'Name of the tool to execute' },
          input: { type: 'object', description: 'Tool input parameters' },
        },
        required: ['toolName', 'input'],
      },
    },
    {
      name: 'composio_manage_connections',
      description: 'Manage OAuth connections for tool integrations',
      input_schema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['connect', 'disconnect', 'status'] },
          toolName: { type: 'string' },
        },
        required: ['action'],
      },
    },
  ];
}
