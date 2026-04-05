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

function getClient() {
  if (!isComposioConfigured()) {
    throw new Error('COMPOSIO_API_KEY not configured');
  }
  const { Composio } = require('@composio/core');
  return new Composio({ apiKey: process.env.COMPOSIO_API_KEY! });
}

const sessionCache = new Map<string, ReturnType<ReturnType<typeof getClient>['createSession']>>();

export async function getComposioSession(userId: string) {
  if (!isComposioConfigured()) {
    throw new Error('COMPOSIO_API_KEY not configured');
  }

  const { Composio } = await import('@composio/core');
  const client = new Composio({ apiKey: process.env.COMPOSIO_API_KEY! });

  if (!sessionCache.has(userId)) {
    const session = await client.createSession({ entityId: userId });
    sessionCache.set(userId, session);
  }

  return sessionCache.get(userId)!;
}

export async function getComposioTools(userId: string): Promise<ComposioTool[]> {
  if (!isComposioConfigured()) {
    console.log('[Composio] Not configured - returning empty tool list');
    return [];
  }

  try {
    const session = await getComposioSession(userId);
    const tools = await session.tools();
    
    return tools.map((tool: any) => ({
      name: tool.name,
      description: tool.description || `Execute ${tool.name}`,
      inputSchema: tool.parameters || {},
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
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  if (!isComposioConfigured()) {
    return { success: false, error: 'Composio not configured' };
  }

  try {
    const session = await getComposioSession(userId);
    
    const result = await session.tools.execute({
      name: toolCall.name,
      parameters: toolCall.parameters,
    });

    return { success: true, data: result };
  } catch (error: any) {
    console.error(`[Composio] Tool execution failed for ${toolCall.name}:`, error);
    
    const errorMessage = error?.message || String(error);
    const isNotConnected = 
      errorMessage.includes('no connected account') ||
      errorMessage.includes('not connected') ||
      errorMessage.includes('authentication') ||
      errorMessage.includes('OAuth');
    
    return {
      success: false,
      error: isNotConnected 
        ? `${toolCall.name} failed: ${errorMessage}. User needs to connect their ${getAppNameFromTool(toolCall.name)} account in Profile → Connected Apps.`
        : errorMessage,
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
  
  for (const [app, name] of Object.entries(appMap)) {
    if (toolName.toUpperCase().includes(app)) {
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
    const session = await getComposioSession('test_connection');
    const tools = await session.tools();
    return { success: true, toolCount: tools.length };
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
    const { Composio } = await import('@composio/core');
    const client = new Composio({ apiKey: process.env.COMPOSIO_API_KEY! });

    const session = await getComposioSession(userId);
    
    const authUrl = await session.appAccount.getConnectionUrl({
      app: toolkit.toUpperCase(),
    });

    return { authUrl };
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
    
    const accounts = await session.connectedAccounts.list();
    
    const connected = accounts
      .map((acc: any) => acc.app?.toLowerCase?.() || acc.appName?.toLowerCase?.() || '')
      .filter(Boolean);

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
    
    const accounts = await session.connectedAccounts.list();
    const account = accounts.find(
      (acc: any) => {
        const app = acc.app?.toLowerCase?.() || acc.appName?.toLowerCase?.() || '';
        return app === toolkit.toLowerCase();
      }
    );

    if (account) {
      await account.disconnect();
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
    
    const results = await client.tools.search({ query });
    const resultArray = Array.isArray(results) ? results : [];

    return {
      tools: resultArray.slice(0, limit).map((tool: any) => ({
        name: tool.name,
        description: tool.description || `Execute ${tool.name}`,
        inputSchema: tool.parameters || {},
        enabled: true,
        connected: true,
      })),
      total: resultArray.length,
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

export async function initializeComposio(integrations: string[]): Promise<void> {
  if (!isComposioConfigured()) {
    console.log('[Composio] No API key configured, skipping initialization');
    return;
  }

  try {
    const { Composio } = await import('@composio/core');
    const client = new Composio({ apiKey: process.env.COMPOSIO_API_KEY! });
    
    for (const integration of integrations) {
      await client.integrations.get({ integrationId: integration });
    }
    console.log('[Composio] Initialized with integrations:', integrations);
  } catch (error) {
    console.error('[Composio] Initialization failed:', error);
  }
}
