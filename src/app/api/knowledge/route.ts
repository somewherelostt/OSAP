import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateClerkUser } from '@/lib/database';

const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v2';
const FIRECRAWL_API_KEY = process.env.NEXT_PUBLIC_FIRECRAWL_API_KEY;
const HYDRA_API_URL = 'https://api.hydradb.com';
const HYDRA_API_KEY = process.env.NEXT_PUBLIC_HYDRA_DB_API_KEY;
const HYDRA_TENANT_ID = process.env.NEXT_PUBLIC_HYDRA_DB_TENANT_ID;

function isFirecrawlConfigured(): boolean {
  return !!FIRECRAWL_API_KEY;
}

function isHydraConfigured(): boolean {
  return !!(HYDRA_API_KEY && HYDRA_TENANT_ID);
}

function getSubTenantId(userId?: string): string {
  return userId || process.env.NEXT_PUBLIC_HYDRA_DB_SUB_TENANT_ID || 'osap';
}

interface FirecrawlScrapeResult {
  success: boolean;
  knowledge?: {
    sourceId: string;
    title: string;
    content: string;
    url: string;
    links: string[];
    summary?: string;
  };
  error?: string;
}

async function scrapeAndPrepareForIngestion(url: string): Promise<FirecrawlScrapeResult> {
  try {
    const response = await fetch(`${FIRECRAWL_API_URL}/scrape`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
      },
      body: JSON.stringify({
        url,
        formats: ['markdown', 'links'],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `Firecrawl error: ${response.status} - ${errorText}` };
    }

    const data = await response.json();
    
    const title = data.data?.metadata?.title || new URL(url).hostname;
    const content = data.data?.markdown || '';
    const cleanedContent = content.replace(/[#*`_~\[\]]/g, '').trim();
    
    return {
      success: true,
      knowledge: {
        sourceId: `fc_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        title: Array.isArray(title) ? title[0] : title,
        content: cleanedContent,
        url,
        links: data.data?.links || [],
        summary: cleanedContent.substring(0, 200) + (cleanedContent.length > 200 ? '...' : ''),
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Scrape failed' };
  }
}

async function storeKnowledge(knowledge: {
  id: string;
  title: string;
  source: string;
  description?: string;
  url: string;
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
  userId?: string;
}) {
  const response = await fetch(`${HYDRA_API_URL}/ingestion/upload_knowledge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': HYDRA_API_KEY!,
      'x-tenant-id': HYDRA_TENANT_ID!,
      'x-sub-tenants': getSubTenantId(knowledge.userId),
    },
    body: JSON.stringify({
      source_id: knowledge.id,
      title: knowledge.title,
      content: knowledge.content,
      source: knowledge.source,
      url: knowledge.url,
      description: knowledge.description,
      timestamp: knowledge.timestamp,
      metadata: knowledge.metadata,
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    return { success: false, error: errorText };
  }
  return { success: true };
}

async function recallKnowledge(query: string, options: { maxResults?: number; alpha?: number; userId?: string } = {}) {
  const response = await fetch(`${HYDRA_API_URL}/recall/recall_preferences`, {
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
      alpha: options.alpha ?? 0.5,
    }),
  });
  
  if (!response.ok) {
    throw new Error(`HydraDB recall error: ${response.statusText}`);
  }
  return response.json();
}

function formatKnowledgeContext(recallResult: { chunks?: unknown[] } | null): string {
  if (!recallResult || !recallResult.chunks || recallResult.chunks.length === 0) {
    return '';
  }
  const contextParts: string[] = ['## Relevant Knowledge:\n'];
  for (const chunk of recallResult.chunks as { chunk_content?: string; source_title?: string }[]) {
    if (chunk.chunk_content) {
      contextParts.push(`**${chunk.source_title || 'Knowledge'}**: ${chunk.chunk_content.substring(0, 150)}...`);
    }
  }
  return contextParts.join('\n');
}

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    let dbUserId: string | undefined;
    
    if (clerkUserId) {
      const dbUser = await getOrCreateClerkUser(clerkUserId);
      dbUserId = dbUser.id;
    }

    const body = await request.json();
    const { action, url, query } = body;

    if (action === 'ingest') {
      if (!url) {
        return NextResponse.json(
          { error: 'Missing URL for ingestion' },
          { status: 400 }
        );
      }

      if (!isFirecrawlConfigured()) {
        return NextResponse.json(
          { error: 'Firecrawl API key not configured' },
          { status: 400 }
        );
      }

      if (!isHydraConfigured()) {
        return NextResponse.json(
          { error: 'HydraDB not configured' },
          { status: 400 }
        );
      }

      const scrapeResult = await scrapeAndPrepareForIngestion(url);

      if (!scrapeResult.success || !scrapeResult.knowledge) {
        return NextResponse.json(
          { error: scrapeResult.error || 'Failed to scrape URL' },
          { status: 500 }
        );
      }

      const { knowledge } = scrapeResult;

      const storeResult = await storeKnowledge({
        id: knowledge.sourceId,
        title: knowledge.title,
        source: 'firecrawl',
        description: knowledge.summary,
        url: knowledge.url,
        content: knowledge.content,
        timestamp: new Date().toISOString(),
        metadata: {
          originalUrl: url,
          linksCount: knowledge.links.length,
        },
        userId: dbUserId,
      });

      if (!storeResult.success) {
        return NextResponse.json(
          { error: storeResult.error || 'Failed to store in HydraDB' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        knowledge: {
          id: knowledge.sourceId,
          title: knowledge.title,
          url: knowledge.url,
          summary: knowledge.summary,
          contentLength: knowledge.content?.length || 0,
        },
      });
    }

    if (action === 'search') {
      if (!query) {
        return NextResponse.json(
          { error: 'Missing query for search' },
          { status: 400 }
        );
      }

      if (!isHydraConfigured()) {
        return NextResponse.json(
          { error: 'HydraDB not configured' },
          { status: 400 }
        );
      }

      const result = await recallKnowledge(query, {
        maxResults: 10,
        alpha: 0.5,
        userId: dbUserId,
      });

      if (!result) {
        return NextResponse.json({
          knowledge: [],
          context: '',
        });
      }

      const knowledgeItems = (result.chunks || [])
        .filter((chunk: { source_title?: string }) => chunk.source_title)
        .map((chunk: { source_id?: string; source_title?: string; chunk_content?: string; relevancy_score?: number }) => ({
          id: chunk.source_id,
          title: chunk.source_title,
          content: chunk.chunk_content,
          score: chunk.relevancy_score,
        }));

      const uniqueBySource = knowledgeItems.reduce((acc: typeof knowledgeItems, item: { id?: string }) => {
        if (!acc.find((i: { id?: string }) => i.id === item.id)) {
          acc.push(item);
        }
        return acc;
      }, [] as typeof knowledgeItems);

      return NextResponse.json({
        knowledge: uniqueBySource,
        context: formatKnowledgeContext(result),
      });
    }

    return NextResponse.json(
      { error: 'Invalid action. Use ingest or search' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[API] Knowledge error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Knowledge operation failed' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    let dbUserId: string | undefined;
    
    if (clerkUserId) {
      const dbUser = await getOrCreateClerkUser(clerkUserId);
      dbUserId = dbUser.id;
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query');
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    if (!isHydraConfigured()) {
      return NextResponse.json({ knowledge: [], configured: false });
    }

    if (!query) {
      return NextResponse.json({ knowledge: [], configured: true });
    }

    const result = await recallKnowledge(query, { maxResults: limit, userId: dbUserId });

    if (!result) {
      return NextResponse.json({ knowledge: [], configured: true });
    }

    const knowledgeItems = (result.chunks || [])
      .filter((chunk: { source_title?: string }) => chunk.source_title)
      .map((chunk: { source_id?: string; source_title?: string; chunk_content?: string; relevancy_score?: number }) => ({
        id: chunk.source_id,
        title: chunk.source_title,
        content: chunk.chunk_content?.substring(0, 300),
        score: chunk.relevancy_score,
      }));

    return NextResponse.json({
      knowledge: knowledgeItems,
      configured: true,
    });
  } catch (error) {
    console.error('[API] Knowledge search error:', error);
    return NextResponse.json(
      { knowledge: [], configured: false, error: 'Failed to search knowledge' },
      { status: 500 }
    );
  }
}
