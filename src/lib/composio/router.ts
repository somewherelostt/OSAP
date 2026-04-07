import { z } from "zod";
import { ToolRouterConfig } from "./config";
import {
  SessionManager,
  ToolRouterSession,
  CreateSessionParams,
  SessionAuthState,
} from "./session";
import {
  ToolRouterError,
  AuthRequiredError,
  ToolExecutionError,
  withErrorHandling,
} from "./errors";
import {
  FileOperationsManager,
  CreateMountConfig,
  Mount,
  FileMountEntry,
  PresignedUrlResponse,
  ZFileMountEntry as ZFileMount,
} from "./file-operations";
import { Toolkit, Tool, ToolExecutionResult } from "./types";

// ============================================================================
// Zod Schemas for API Responses
// ============================================================================

const ZToolRouterSessionResponse = z.object({
  session_id: z.string(),
  mcp: z.object({ type: z.string(), url: z.string() }).optional(),
  tool_router_tools: z.array(z.string()).optional(),
  config: z.record(z.string(), z.any()).optional(),
  experimental: z.record(z.string(), z.any()).optional(),
});

const ZToolkitResponse = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string().optional().default(''),
  logo: z.string().optional(),
  auth_schemes: z.array(z.string()).optional().default([]),
  meta: z.any().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
}).passthrough();

const ZToolResponse = z.object({
  slug: z.string(),
  name: z.string().optional(),
  description: z.string(),
  toolkit: z.object({
    slug: z.string(),
    name: z.string(),
  }).passthrough().optional(),
  input_schema: z.record(z.string(), z.any()).optional(),
  output_schema: z.record(z.string(), z.any()).optional(),
  input_parameters: z.record(z.string(), z.any()).optional(),
  output_parameters: z.record(z.string(), z.any()).optional(),
}).passthrough();

const ZToolExecutionResultRaw = z.object({
  data: z.any(),
  error: z.string().nullable().optional(),
  log_id: z.string().optional(),
});

const ZLinkSessionResponseRaw = z.object({
  link_token: z.string().optional(),
  redirect_url: z.string().optional(),
  connected_account_id: z.string().optional(),
  link_url: z.string().optional(),
  status: z.enum(["INITIATED", "ACTIVE", "FAILED"]).optional(),
  expires_at: z.string().optional(),
});

/**
 * ComposioToolRouter - Main client for Composio Tool Router API v3
 */
export class ComposioToolRouter {
  private config: ToolRouterConfig;
  private sessionManager: SessionManager;
  private fileOperationsManager: FileOperationsManager;

  private static readonly SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

  constructor(config: ToolRouterConfig) {
    this.config = config;
    this.sessionManager = new SessionManager(config);
    this.fileOperationsManager = new FileOperationsManager(config);
  }

  private validateId(id: string, name: string): void {
    if (!id || !ComposioToolRouter.SAFE_ID_PATTERN.test(id)) {
      throw new ToolRouterError(
        `Invalid ${name}: contains unsafe characters`,
        "INVALID_IDENTIFIER",
        400
      );
    }
  }

  // ============================================================================
  // Session Management
  // ============================================================================

  async createSession(params: CreateSessionParams): Promise<ToolRouterSession> {
    return withErrorHandling(async () => {
      const url = `${this.config.baseUrl}/api/v3/tool_router/session`;

      console.log(`[ComposioToolRouter] Creating session for project: ${params.projectId}`);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "x-api-key": this.config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: params.userId,
        }),
      });

      if (!response.ok) {
        const rawText = await response.text();
        throw new Error(`Failed to create session: ${response.statusText} - ${rawText}`);
      }

      const data = await response.json();
      const parsed = ZToolRouterSessionResponse.parse(data);
      const sessionId = parsed.session_id;
      
      return this.sessionManager.createSession(sessionId, params);
    }, { projectId: params.projectId });
  }

  getSession(projectId: string, userId?: string): ToolRouterSession | null {
    return this.sessionManager.getSession(projectId, userId);
  }

  async getOrCreateSession(
    projectId: string,
    userId?: string
  ): Promise<ToolRouterSession> {
    const existing = this.getSession(projectId, userId);
    if (existing) {
      return existing;
    }

    return this.createSession({ projectId, userId });
  }

  // ============================================================================
  // Tool Discovery
  // ============================================================================

  async listToolkits(sessionId: string): Promise<Toolkit[]> {
    return withErrorHandling(async () => {
      this.validateId(sessionId, 'sessionId');
      
      const allToolkits: any[] = [];
      let cursor: string | null = null;
      let hasMore = true;
      
      while (hasMore) {
        let url = `${this.config.baseUrl}/api/v3/tool_router/session/${sessionId}/toolkits?limit=50`;
        if (cursor) {
          url += `&cursor=${encodeURIComponent(cursor)}`;
        }

        const response = await fetch(url, {
          method: "GET",
          headers: {
            "x-api-key": this.config.apiKey,
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.log(`[ComposioToolRouter] Session toolkits endpoint failed: ${response.status} - ${errorText}`);
          return this.listToolkitsFallback(sessionId);
        }

        const data = await response.json();
        const items = data.items || [];
        allToolkits.push(...items);
        
        cursor = data.next_cursor || null;
        hasMore = cursor !== null;
      }

      return allToolkits.map((t: any) => ({
        slug: t.slug,
        name: t.name,
        description: t.description || t.meta?.description || '',
        logo: t.logo || t.meta?.logo,
        authSchemes: t.auth_schemes || t.composio_managed_auth_schemes || [],
        meta: t.meta,
        category: this.normalizeCategory(typeof t.categories?.[0] === 'object' ? t.categories[0].name : (t.categories?.[0] || t.category || t.meta?.category)),
        tags: t.tags || [],
        connection: t.connected_account ? {
          is_active: t.connected_account.status === 'ACTIVE' || t.connected_account.status === 'connected',
          connected_account: t.connected_account,
        } : null,
      }));
    }, { sessionId });
  }

  /**
   * Helper to normalize category names for UI matching
   */
  private normalizeCategory(raw?: string): string {
    if (!raw) return 'Utility';
    const low = raw.toLowerCase();
    if (low.includes('comm') || low.includes('mail') || low.includes('slack') || low.includes('message')) return 'Communication';
    if (low.includes('dev') || low.includes('code') || low.includes('git') || low.includes('software')) return 'Development';
    if (low.includes('prod') || low.includes('task') || low.includes('manage') || low.includes('notion') || low.includes('calendar')) return 'Productivity';
    if (low.includes('social') || low.includes('twitter') || low.includes('media')) return 'Social';
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  async listToolkitsFallback(sessionId: string): Promise<Toolkit[]> {
    return withErrorHandling(async () => {
      const allToolkits: any[] = [];
      let cursor: string | null = null;
      let hasMore = true;
      
      while (hasMore) {
        let url = `${this.config.baseUrl}/api/v3/toolkits?limit=50`;
        if (cursor) {
          url += `&cursor=${encodeURIComponent(cursor)}`;
        }

        const response = await fetch(url, {
          method: "GET",
          headers: {
            "x-api-key": this.config.apiKey,
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to list toolkits`);
        }

        const data = await response.json();
        const items = data.items || [];
        allToolkits.push(...items);
        
        cursor = data.next_cursor || null;
        hasMore = cursor !== null;
      }

      return allToolkits.map((t: any) => ({
        slug: t.slug,
        name: t.name,
        description: t.description || t.meta?.description || '',
        logo: t.logo || t.meta?.logo,
        authSchemes: t.auth_schemes || [],
        category: this.normalizeCategory(t.categories?.[0]?.name || t.category || t.meta?.category),
        tags: t.tags || [],
      }));
    }, { sessionId });
  }

  async listTools(
    sessionId: string,
    filters?: { toolkitSlug?: string }
  ): Promise<Tool[]> {
    return withErrorHandling(async () => {
      this.validateId(sessionId, 'sessionId');
      let url = `${this.config.baseUrl}/api/v3/tool_router/session/${sessionId}/tools`;
      
      if (filters?.toolkitSlug) {
        url = `${this.config.baseUrl}/api/v3/tools?toolkit_slug=${filters.toolkitSlug}&limit=2000`;
      }

      const response = await fetch(url, {
        headers: {
          "x-api-key": this.config.apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to list tools`);
      }

      const data = await response.json();
      const items: unknown[] = Array.isArray(data) ? data : (data.items || data.tools || []);
      const parsed = z.array(ZToolResponse).parse(items);
      
      return parsed.map((t) => ({
        slug: t.slug,
        name: t.name || t.slug,
        description: t.description,
        toolkit: t.toolkit || { slug: filters?.toolkitSlug || "composio", name: filters?.toolkitSlug || "Composio" },
        inputSchema: t.input_parameters || t.input_schema || {},
        outputSchema: t.output_parameters || t.output_schema,
      }));
    }, { sessionId });
  }

  async searchTools(sessionId: string, query: string): Promise<Tool[]> {
    return withErrorHandling(async () => {
      // Use general toolkits/tools search if session-based search is failing
      // or specifically for broad tool discovery
      const url = `${this.config.baseUrl}/api/v3/tools?search=${encodeURIComponent(query)}&limit=20`;

      const response = await fetch(url, {
        headers: {
          "x-api-key": this.config.apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to search tools`);
      }

      const data = await response.json();
      const items = Array.isArray(data) ? data : (data.items || data.tools || []);
      const parsed = z.array(ZToolResponse).parse(items);
      
      return parsed.map((t) => ({
        slug: t.slug,
        name: t.name || t.slug,
        description: t.description,
        toolkit: t.toolkit || { slug: "composio", name: "Composio" },
        inputSchema: t.input_schema || t.input_parameters || {},
        outputSchema: t.output_schema || t.output_parameters,
      }));
    }, { sessionId });
  }

  // ============================================================================
  // Tool Execution
  // ============================================================================

  async executeTool<T = unknown>(
    sessionId: string,
    toolSlug: string,
    params: { arguments: Record<string, unknown>; fileMounts?: any[] }
  ): Promise<ToolExecutionResult<T>> {
    return withErrorHandling(async () => {
      this.validateId(sessionId, 'sessionId');
      const url = `${this.config.baseUrl}/api/v3/tool_router/session/${sessionId}/execute`;

      // Normalization: Composio slugs are always lowercase. GLM might guess uppercase.
      // We also handle common hallucinations like "google_gmail" or "gmail_get_emails"
      let executionSlug = toolSlug.toLowerCase();
      
      // Remove common app-name prefixes that might be added by the planner
      if (executionSlug.includes('_')) {
        const parts = executionSlug.split('_');
        // If it starts with the app name twice, e.g. "gmail_gmail_list", fix it
        if (parts[0] === parts[1]) {
          executionSlug = parts.slice(1).join('_');
        }
      }
      
      // Expand common guessed names to real slugs for the top 8 toolkits
      const mappings: Record<string, string> = {
        // Gmail
        'gmail_get_emails': 'gmail_fetch_emails',
        'gmail_get_messages': 'gmail_fetch_emails',
        'gmail_fetch_messages': 'gmail_fetch_emails',
        'gmail_list_messages': 'gmail_fetch_emails',
        'gmail_get_last_emails': 'gmail_fetch_emails',
        'google_gmail_list_messages': 'gmail_fetch_emails',
        'gmail_get_email': 'gmail_fetch_message_by_message_id',
        'gmail_read_email': 'gmail_fetch_message_by_message_id',
        'gmail_fetch_message': 'gmail_fetch_message_by_message_id',
        'gmail_get_message': 'gmail_fetch_message_by_message_id',
        'gmail_send_message': 'gmail_send_email',
        
        // GitHub
        'github_get_issues': 'github_list_issues',
        'github_fetch_issues': 'github_list_issues',
        'github_create_issues': 'github_create_issue', 
        'github_add_issue': 'github_create_issue',
        'github_get_repo': 'github_get_repository',
        
        // Notion
        'notion_get_all_pages': 'notion_search',
        'notion_fetch_pages': 'notion_search',
        'notion_list_pages': 'notion_search',
        'notion_get_pages': 'notion_search',
        'notion_create_pages': 'notion_create_page',
        'notion_add_page': 'notion_create_page',
        
        // Google Calendar
        'calendar_get_events': 'googlecalendar_find_event',
        'calendar_list_events': 'googlecalendar_find_event',
        'google_calendar_list_events': 'googlecalendar_find_event',
        'googlecalendar_get_events': 'googlecalendar_find_event',
        'googlecalendar_list_events': 'googlecalendar_find_event',
        'calendar_create_event': 'googlecalendar_create_event',
        'googlecalendar_add_event': 'googlecalendar_create_event',
        'googlecalendar_create_events': 'googlecalendar_create_event',
        
        // Slack
        'slack_post_message': 'slack_send_message',
        'slack_get_channel': 'slack_list_channels',
        'slack_get_channels': 'slack_list_channels',
        
        // Discord
        'discord_create_message': 'discord_send_message',
        'discord_get_channels': 'discord_list_channels',
        
        // Twitter (X)
        'twitter_post_tweet': 'twitter_create_tweet',
        'twitter_send_tweet': 'twitter_create_tweet',
        'x_create_tweet': 'twitter_create_tweet',
        'x_post_tweet': 'twitter_create_tweet',
        
        // Linear
        'linear_create_issues': 'linear_create_issue',
        'linear_fetch_issues': 'linear_list_issues',
        'linear_get_issues': 'linear_list_issues',
      };
      
      if (mappings[executionSlug]) {
        executionSlug = mappings[executionSlug];
      }

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "x-api-key": this.config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tool_slug: executionSlug,
          arguments: params.arguments,
          file_mounts: params.fileMounts,
        }),
      });

      if (response.status === 401) {
        const errorData = await response.json().catch(() => ({}));
        const authUrl = errorData.redirect_url || errorData.link_url || "";
        throw new AuthRequiredError(
          authUrl,
          errorData.toolkit_slug || toolSlug.split("_")[0],
          new Date(errorData.expires_at || Date.now() + 300000)
        );
      }

      if (!response.ok) {
        const rawText = await response.text();
        let errorMessage = `Tool execution failed: ${response.statusText}`;
        let errorCode = "TOOL_EXECUTION_FAILED";
        
        try {
          const errorJson = JSON.parse(rawText);
          const errorDetail = errorJson.error || errorJson;
          
          errorMessage = errorDetail.message || errorMessage;
          errorCode = errorDetail.code ? String(errorDetail.code) : errorCode;
          
          console.error(`[ComposioToolRouter] Execution ${response.status} Detail for ${toolSlug}:`, JSON.stringify(errorJson, null, 2));
        } catch (e) {
          console.error(`[ComposioToolRouter] Execution ${response.status} Raw for ${toolSlug}:`, rawText);
        }

        throw new ToolExecutionError(
          errorMessage,
          toolSlug,
          "unknown",
          undefined,
          undefined,
          errorCode,
          response.status
        );
      }

      const data = await response.json();
      const parsed = ZToolExecutionResultRaw.parse(data);
      const hasError = parsed.error != null && parsed.error !== "";
      return {
        success: !hasError,
        data: parsed.data as T,
        error: hasError ? { message: parsed.error!, code: "TOOL_ERROR" } : undefined,
        executionId: parsed.log_id || `exec_${Date.now()}`,
      };
    }, { sessionId, toolSlug });
  }

  // ============================================================================
  // Authentication Flow
  // ============================================================================

  async initiateAuth(
    sessionId: string,
    toolkitSlug: string,
    authScheme: string = "OAUTH2"
  ): Promise<SessionAuthState> {
    return withErrorHandling(async () => {
      this.validateId(sessionId, 'sessionId');
      const url = `${this.config.baseUrl}/api/v3/tool_router/session/${sessionId}/link`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "x-api-key": this.config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          toolkit: toolkitSlug,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to initiate auth`);
      }

      const data = await response.json();
      const parsed = ZLinkSessionResponseRaw.parse(data);

      const linkUrl = parsed.redirect_url || parsed.link_url;
      const isAuthenticated = !!(parsed.connected_account_id && !parsed.redirect_url && !parsed.link_token);
      
      return {
        sessionId,
        toolkitSlug,
        authScheme,
        status: isAuthenticated ? "authenticated" : (linkUrl ? "link_required" : "pending"),
        linkUrl,
        connectedAccountId: parsed.connected_account_id,
      };
    }, { sessionId });
  }

  async getAuthStatus(
    sessionId: string,
    toolkitSlug: string
  ): Promise<SessionAuthState> {
    return withErrorHandling(async () => {
      this.validateId(sessionId, 'sessionId');
      const url = `${this.config.baseUrl}/api/v3/tool_router/session/${sessionId}/toolkits?toolkits=${toolkitSlug}`;

      const response = await fetch(url, {
        headers: {
          "x-api-key": this.config.apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get auth status`);
      }

      const data = await response.json();
      const items = data.items || [];
      const toolkit = items.find((t: any) => t.slug === toolkitSlug);
      
      const isConnected = toolkit?.connected_account && 
        (toolkit.connected_account.status === 'ACTIVE' || toolkit.connected_account.status === 'connected');
      
      return {
        sessionId,
        toolkitSlug,
        authScheme: "OAUTH2",
        status: isConnected ? "authenticated" : "pending",
        connectedAccountId: toolkit?.connected_account?.id,
      };
    }, { sessionId });
  }

  async deleteConnectedAccount(connectedAccountId: string): Promise<boolean> {
    return withErrorHandling(async () => {
      const url = `${this.config.baseUrl}/api/v3/connected_accounts/${connectedAccountId}`;
      const response = await fetch(url, {
        method: "DELETE",
        headers: {
          "x-api-key": this.config.apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to delete connected account`);
      }
      
      const data = await response.json();
      return !!data.success;
    }, { sessionId: "unknown" });
  }
}
