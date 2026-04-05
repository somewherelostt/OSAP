import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import {
  getRegisteredTools,
  initializeTools,
  type ToolResult,
} from '@/lib/tools-enhanced';
import { searchTools } from '@/lib/composio';
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

    if (query) {
      const results = await searchTools(query);
      return NextResponse.json({
        tools: results.tools,
        total: results.total,
        query: results.query,
        searchMode: 'composio',
      });
    }

    const tools = getRegisteredTools(DEFAULT_POLICY);

    const filteredTools = category
      ? tools.filter((tool) => getToolCategory(tool.name) === category)
      : tools;

    return NextResponse.json({
      tools: filteredTools,
      total: filteredTools.length,
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
    const { toolName, input } = body;

    if (!toolName || !input) {
      return NextResponse.json(
        { error: 'Missing toolName or input' },
        { status: 400 }
      );
    }

    const user = await getOrCreateClerkUser(clerkUserId);
    const { executeTool } = await import('@/lib/tools-enhanced');
    const result: ToolResult = await executeTool(
      toolName,
      input,
      user.id,
      DEFAULT_POLICY
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('[API] Tool execution error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Tool execution failed' },
      { status: 500 }
    );
  }
}
