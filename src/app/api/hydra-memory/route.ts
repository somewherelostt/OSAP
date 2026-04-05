import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateClerkUser } from '@/lib/database';

const HYDRA_API_URL = 'https://api.hydradb.com';
const HYDRA_API_KEY = process.env.NEXT_PUBLIC_HYDRA_DB_API_KEY;
const HYDRA_TENANT_ID = process.env.NEXT_PUBLIC_HYDRA_DB_TENANT_ID;

function isHydraConfigured(): boolean {
  return !!(HYDRA_API_KEY && HYDRA_TENANT_ID);
}

function getSubTenantId(userId?: string): string {
  return userId || process.env.NEXT_PUBLIC_HYDRA_DB_SUB_TENANT_ID || 'osap';
}

async function storeMemory(text: string, options: { title?: string; infer?: boolean; taskId?: string; userId?: string } = {}) {
  const response = await fetch(`${HYDRA_API_URL}/memories/add_memory`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': HYDRA_API_KEY!,
      'x-tenant-id': HYDRA_TENANT_ID!,
      'x-sub-tenants': getSubTenantId(options.userId),
    },
    body: JSON.stringify({
      text,
      title: options.title,
      infer: options.infer ?? true,
      task_id: options.taskId,
    }),
  });
  if (!response.ok) {
    throw new Error(`HydraDB store error: ${response.statusText}`);
  }
  return response.json();
}

async function recallMemories(query: string, options: { maxResults?: number; alpha?: number; recencyBias?: number; userId?: string } = {}) {
  const response = await fetch(`${HYDRA_API_URL}/memories/recall_memories`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': HYDRA_API_KEY!,
      'x-tenant-id': HYDRA_TENANT_ID!,
      'x-sub-tenants': getSubTenantId(options.userId),
    },
    body: JSON.stringify({
      text: query,
      max_results: options.maxResults || 10,
      alpha: options.alpha ?? 0.7,
      recency_bias: options.recencyBias ?? 0.1,
    }),
  });
  if (!response.ok) {
    throw new Error(`HydraDB recall error: ${response.statusText}`);
  }
  return response.json();
}

async function searchMemoriesBroad(options: { limit?: number; userId?: string } = {}) {
  const response = await fetch(`${HYDRA_API_URL}/recall/recall_preferences`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': HYDRA_API_KEY!,
      'x-tenant-id': HYDRA_TENANT_ID!,
      'x-sub-tenants': getSubTenantId(options.userId),
    },
    body: JSON.stringify({
      query: '*',
      max_results: options.limit || 20,
      alpha: 0.3,
      recency_bias: 0.5,
    }),
  });
  if (!response.ok) {
    throw new Error(`HydraDB search error: ${response.statusText}`);
  }
  return response.json();
}

function formatMemoryContext(recallResult: { chunks?: unknown[] } | null): string {
  if (!recallResult || !recallResult.chunks || recallResult.chunks.length === 0) {
    return '';
  }
  const contextParts: string[] = ['## Relevant Context from Memory:\n'];
  for (const chunk of recallResult.chunks as { chunk_content?: string }[]) {
    if (chunk.chunk_content) {
      contextParts.push(`- ${chunk.chunk_content}`);
    }
  }
  return contextParts.join('\n');
}

export async function POST(request: NextRequest) {
  try {
    if (!isHydraConfigured()) {
      return NextResponse.json(
        { error: 'HydraDB not configured' },
        { status: 400 }
      );
    }

    const { userId: clerkUserId } = await auth();
    let dbUserId: string | undefined;
    
    if (clerkUserId) {
      const dbUser = await getOrCreateClerkUser(clerkUserId);
      dbUserId = dbUser.id;
    }

    const body = await request.json();
    const { action, text, query, maxResults } = body;

    if (action === 'store') {
      if (!text) {
        return NextResponse.json(
          { error: 'Missing text for store action' },
          { status: 400 }
        );
      }

      const result = await storeMemory(text, {
        title: body.title,
        infer: body.infer ?? true,
        taskId: body.taskId,
        userId: dbUserId,
      });

      return NextResponse.json(result);
    }

    if (action === 'recall') {
      if (!query) {
        return NextResponse.json(
          { error: 'Missing query for recall action' },
          { status: 400 }
        );
      }

      const result = await recallMemories(query, {
        maxResults: maxResults || 10,
        alpha: body.alpha ?? 0.7,
        recencyBias: body.recencyBias ?? 0.1,
        userId: dbUserId,
      });

      if (!result) {
        return NextResponse.json(
          { error: 'Failed to recall memories' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        chunks: result.chunks,
        sources: result.sources,
        context: formatMemoryContext(result),
        graphContext: result.graph_context,
      });
    }

    if (action === 'list') {
      const result = await searchMemoriesBroad({
        limit: body.limit || 50,
        userId: dbUserId,
      });

      return NextResponse.json({
        chunks: result?.chunks || [],
        sources: result?.sources || [],
      });
    }

    return NextResponse.json(
      { error: 'Invalid action. Use store, recall, or list' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[API] HydraDB error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'HydraDB operation failed' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!isHydraConfigured()) {
      return NextResponse.json(
        { memories: [], configured: false }
      );
    }

    const { userId: clerkUserId } = await auth();
    let dbUserId: string | undefined;
    
    if (clerkUserId) {
      const dbUser = await getOrCreateClerkUser(clerkUserId);
      dbUserId = dbUser.id;
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query');
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    if (query) {
      const result = await recallMemories(query, { maxResults: limit, userId: dbUserId });
      return NextResponse.json({
        memories: result?.chunks || [],
        configured: true,
      });
    }

    const result = await searchMemoriesBroad({ limit, userId: dbUserId });
    return NextResponse.json({
      memories: result?.chunks || [],
      sources: result?.sources || [],
      configured: true,
    });
  } catch (error) {
    console.error('[API] HydraDB list error:', error);
    return NextResponse.json(
      { memories: [], configured: false, error: 'Failed to fetch memories' },
      { status: 500 }
    );
  }
}
