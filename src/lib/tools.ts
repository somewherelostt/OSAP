import type { ToolDefinition, ToolExecution } from '@/types/database';

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  executionId?: string;
}

export interface BaseTool {
  name: string;
  description: string;
  execute(input: Record<string, unknown>): Promise<ToolResult>;
}

// Tool Registry
const toolRegistry = new Map<string, BaseTool>();

// Register a tool
export function registerTool(tool: BaseTool): void {
  toolRegistry.set(tool.name, tool);
}

// Get all registered tools
export function getRegisteredTools(): ToolDefinition[] {
  const tools: ToolDefinition[] = [];
  toolRegistry.forEach((tool, name) => {
    tools.push({
      name: tool.name,
      description: tool.description,
      input_schema: {},
    });
  });
  return tools;
}

// Get tool by name
export function getTool(name: string): BaseTool | undefined {
  return toolRegistry.get(name);
}

// Execute a tool by name
export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  userId: string
): Promise<ToolResult> {
  const tool = toolRegistry.get(toolName);
  
  if (!tool) {
    return { success: false, error: `Tool not found: ${toolName}` };
  }

  try {
    const result = await tool.execute(input);
    return {
      ...result,
      executionId: `${toolName}-${Date.now()}`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown execution error',
    };
  }
}

// GitHub Tool
export class GitHubTool implements BaseTool {
  name = 'github_create_issue';
  description = 'Create a GitHub issue in a repository';

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const { owner, repo, title, body, labels } = input;

    if (!owner || !repo || !title) {
      return { success: false, error: 'Missing required fields: owner, repo, title' };
    }

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return { success: false, error: 'GITHUB_TOKEN not configured' };
    }

    try {
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/vnd.github.v3+json',
        },
        body: JSON.stringify({
          title,
          body: body || '',
          labels: labels || [],
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.message || 'GitHub API error' };
      }

      const issue = await response.json();
      return {
        success: true,
        data: {
          id: issue.id,
          number: issue.number,
          title: issue.title,
          url: issue.html_url,
          state: issue.state,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'GitHub request failed',
      };
    }
  }
}

export class GitHubListIssuesTool implements BaseTool {
  name = 'github_get_issues';
  description = 'List GitHub issues in a repository';

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const { owner, repo, state = 'open', per_page = 10 } = input;

    if (!owner || !repo) {
      return { success: false, error: 'Missing required fields: owner, repo' };
    }

    const token = process.env.GITHUB_TOKEN;

    try {
      const params = new URLSearchParams({ state: String(state), per_page: String(per_page) });
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github.v3+json',
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/issues?${params}`,
        { headers }
      );

      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.message || 'GitHub API error' };
      }

      const issues = await response.json();
      return {
        success: true,
        data: issues.map((issue: Record<string, unknown>) => ({
          id: issue.id,
          number: issue.number,
          title: issue.title,
          state: issue.state,
          url: issue.html_url,
          created_at: issue.created_at,
        })),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'GitHub request failed',
      };
    }
  }
}

// Twitter Tool (using Twitter API v2)
export class TwitterTool implements BaseTool {
  name = 'twitter_post';
  description = 'Post a tweet';

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const { text } = input;

    if (!text) {
      return { success: false, error: 'Missing required field: text' };
    }

    const bearerToken = process.env.TWITTER_BEARER_TOKEN;
    const apiKey = process.env.TWITTER_API_KEY;
    const apiSecret = process.env.TWITTER_API_SECRET;
    const accessToken = process.env.TWITTER_ACCESS_TOKEN;
    const accessSecret = process.env.TWITTER_ACCESS_SECRET;

    if (!bearerToken || !apiKey || !apiSecret || !accessToken || !accessSecret) {
      return { success: false, error: 'Twitter API credentials not fully configured' };
    }

    try {
      // Get OAuth 2.0 access token first if not using app-only
      const response = await fetch('https://api.twitter.com/2/tweets', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: String(text).substring(0, 280) }),
      });

      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.detail || 'Twitter API error' };
      }

      const tweet = await response.json();
      return {
        success: true,
        data: {
          id: tweet.data?.id,
          text: tweet.data?.text,
          created_at: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Twitter request failed',
      };
    }
  }
}

// Email Tool (using SMTP)
export class EmailTool implements BaseTool {
  name = 'email_send';
  description = 'Send an email';

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const { to, subject, body } = input;

    if (!to || !subject || !body) {
      return { success: false, error: 'Missing required fields: to, subject, body' };
    }

    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT || '587';
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const fromEmail = process.env.SMTP_FROM || 'osap@agent.ai';

    if (!smtpHost || !smtpUser || !smtpPass) {
      return { success: false, error: 'SMTP not configured' };
    }

    // In a real implementation, you'd use nodemailer or similar
    // For now, we'll simulate the email send
    console.log(`[EmailTool] Sending email to ${to}`);
    console.log(`[EmailTool] Subject: ${subject}`);
    console.log(`[EmailTool] Body: ${String(body).substring(0, 100)}...`);

    return {
      success: true,
      data: {
        message_id: `email-${Date.now()}@osap.ai`,
        to,
        subject,
        sent_at: new Date().toISOString(),
      },
    };
  }
}

// Memory Tools (local implementation)
export class MemoryStoreTool implements BaseTool {
  name = 'memory_store';
  description = 'Store information in memory';

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const { content, type = 'context', importance = 5, source } = input;

    if (!content) {
      return { success: false, error: 'Missing required field: content' };
    }

    // This will be handled by the task execution layer
    return {
      success: true,
      data: {
        stored: true,
        content,
        type,
        importance,
        source,
      },
    };
  }
}

export class MemoryRecallTool implements BaseTool {
  name = 'memory_recall';
  description = 'Recall information from memory';

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const { query, type, limit = 10 } = input;

    // This will be handled by the task execution layer
    return {
      success: true,
      data: {
        query: query || '',
        type: type || 'all',
        limit,
        results: [],
      },
    };
  }
}

// HTTP Request Tool
export class HTTPRequestTool implements BaseTool {
  name = 'http_request';
  description = 'Make HTTP requests';

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const { url, method = 'GET', headers = {}, body } = input;

    if (!url) {
      return { success: false, error: 'Missing required field: url' };
    }

    try {
      const response = await fetch(url as string, {
        method: method as string,
        headers: headers as Record<string, string>,
        body: body ? JSON.stringify(body) : undefined,
      });

      const contentType = response.headers.get('content-type') || '';
      let data;
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      return {
        success: true,
        data: {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          body: data,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'HTTP request failed',
      };
    }
  }
}

// Initialize tools
export function initializeTools(): void {
  registerTool(new GitHubTool());
  registerTool(new GitHubListIssuesTool());
  registerTool(new TwitterTool());
  registerTool(new EmailTool());
  registerTool(new MemoryStoreTool());
  registerTool(new MemoryRecallTool());
  registerTool(new HTTPRequestTool());
}
