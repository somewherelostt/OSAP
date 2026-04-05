import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { 
  getMemoryNodes, 
  searchMemoryNodes, 
  storeMemory, 
  getMemoryStats, 
  getOrCreateClerkUser,
  deleteMemoryNode,
} from '@/lib/database';
import { recallMemories, isHydraConfigured } from '@/lib/hydra';
import type { DbMemoryNode } from '@/types/database';

export async function GET(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query');
    const type = searchParams.get('type') as DbMemoryNode['type'] | null;

    const user = await getOrCreateClerkUser(clerkUserId);
    const userIdToUse = user.id;

    if (query) {
      const results = await searchMemoryNodes(userIdToUse, query);
      return NextResponse.json({ memories: results, total: results.length, userId: userIdToUse });
    }

    // Try HydraDB first - only if we have a query
    let memories: Array<{ id: string; content: string; type: string; createdAt: string }> = [];

    if (isHydraConfigured()) {
      try {
        // HydraDB requires a non-empty query, so we skip it for listing all memories
        const hydraResults = await recallMemories('memory', { userId: userIdToUse, maxResults: 20 });
        if (hydraResults?.chunks && hydraResults.chunks.length > 0) {
          memories = hydraResults.chunks.map((m) => ({
            id: String(m.chunk_uuid || m.source_id || 'unknown'),
            content: String(m.chunk_content || m.source_title || ''),
            type: String(m.source_type || 'general'),
            createdAt: String(m.source_upload_time || new Date().toISOString()),
          }));
        }
      } catch {
        console.warn('HydraDB recall failed, using Supabase');
      }
    }

    // Always also get from Supabase (fallback + supplement)
    try {
      const supabaseMemories = await getMemoryNodes(userIdToUse, type || undefined);
      const supabaseMapped = supabaseMemories.map(m => ({
        id: m.id,
        content: m.content,
        type: m.type,
        createdAt: m.created_at,
      }));
      // Merge, deduplicate by content
      const existing = new Set(memories.map(m => m.content));
      for (const m of supabaseMapped) {
        if (!existing.has(m.content)) memories.push(m);
      }
    } catch (e) {
      console.warn('Supabase memory fetch failed:', e);
    }

    // Sort newest first
    memories.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA;
    });

    const stats = await getMemoryStats(userIdToUse);

    return NextResponse.json({ memories, stats, userId: userIdToUse });
  } catch (error) {
    console.error('[API] Memory fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch memories' },
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
    const { content, type = 'context', source, importance = 5 } = body;

    if (!content) {
      return NextResponse.json({ error: 'Missing content' }, { status: 400 });
    }

    const user = await getOrCreateClerkUser(clerkUserId);
    const userIdToUse = user.id;

    const memory = await storeMemory({
      user_id: userIdToUse,
      content,
      type,
      source,
      metadata: {},
      importance,
    });

    return NextResponse.json({ memory, userId: userIdToUse });
  } catch (error) {
    console.error('[API] Memory store error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to store memory' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing memory ID' }, { status: 400 });
    }

    await deleteMemoryNode(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Memory delete error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete memory' },
      { status: 500 }
    );
  }
}
