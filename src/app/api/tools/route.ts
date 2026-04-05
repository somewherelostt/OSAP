import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import {
  getRegisteredTools,
  initializeTools,
  type ToolResult,
} from '@/lib/tools-enhanced';
import { searchTools, getComposioTools, executeComposioToolCall } from '@/lib/composio';
import { getToolCategory, DEFAULT_POLICY } from '@/lib/tool-categories';
import { getOrCreateClerkUser } from '@/lib/database';

initializeTools();

export async function GET(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query');
    const category = searchParams.get('category');
    const source = searchParams.get('source');

    const user = await getOrCreateClerkUser(clerkUserId);

    if (query) {
      if (source === 'composio' || !source) {
        const results = await searchTools(query);
        return NextResponse.json({
          tools: results.tools,
          total: results.total,
          query: results.query,
          source: 'composio',
        });
      }
    }

    if (category === 'composio' || category === 'all') {
      try {
        const composioTools = await getComposioTools(user.id);
        return NextResponse.json({
          tools: composioTools,
          total: composioTools.length,
          source: 'composio',
          categories: ['read', 'write', 'delete', 'execute', 'composio', 'critical'],
        });
      } catch (e) {
        console.warn('[API] Composio tools fetch failed:', e);
      }
    }

    const tools = getRegisteredTools(DEFAULT_POLICY);

    const filteredTools = category && category !== 'all'
      ? tools.filter((tool) => getToolCategory(tool.name) === category)
      : tools;

    return NextResponse.json({
      tools: filteredTools,
      total: filteredTools.length,
      source: 'built-in',
      categories: ['read', 'write', 'delete', 'execute', 'composio', 'critical'],
    });
  } catch (error) {
    console.error('[API] Tools fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch tools' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { toolName, parameters, source } = body;

    if (!toolName) {
      return NextResponse.json(
        { error: 'Missing toolName' },
        { status: 400 }
      );
    }

    const user = await getOrCreateClerkUser(clerkUserId);
    const BUILT_IN_TOOLS = ['memory_store', 'memory_recall', 'http_request', 'github_create_issue', 'github_get_issues', 'email_send', 'twitter_post'];

    if (BUILT_IN_TOOLS.includes(toolName)) {
      const { executeTool } = await import('@/lib/tools-enhanced');
      const result: ToolResult = await executeTool(
        toolName,
        parameters || {},
        user.id,
        DEFAULT_POLICY
      );
      return NextResponse.json(result);
    }

    const result = await executeComposioToolCall(user.id, {
      name: toolName,
      parameters: parameters || {},
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[API] Tool execution error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Tool execution failed' },
      { status: 500 }
    );
  }
}
