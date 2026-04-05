
import type { DbTask } from '@/types/database';

export interface HydraMemory {
  id?: string;
  text: string;
  title?: string;
  infer?: boolean;
  source_id?: string;
  status?: 'queued' | 'processing' | 'completed' | 'errored';
}

export interface HydraRecallResult {
  chunk_uuid: string;
  source_id: string;
  chunk_content: string;
  source_type?: string;
  source_upload_time?: string;
  source_title?: string;
  relevancy_score?: number;
}

export interface HydraSearchResult {
  chunks: HydraRecallResult[];
  sources: Array<{
    id: string;
    title: string;
    type: string;
    description?: string;
  }>;
  graph_context?: {
    query_paths: Array<{
      triplets: Array<{
        source: { name: string; type: string };
        relation: { canonical_predicate: string; context: string };
        target: { name: string; type: string };
      }>;
      relevancy_score: number;
    }>;
    chunk_relations: unknown[];
  };
}

export interface HydraKnowledge {
  id: string;
  title: string;
  source: string;
  description?: string;
  url?: string;
  content?: string;
  timestamp?: string;
}

export interface ProcessingStatus {
  file_id: string;
  indexing_status: 'queued' | 'processing' | 'completed' | 'errored' | 'graph_creation';
  success: boolean;
  message: string;
}

const HYDRA_API_URL = 'https://api.hydradb.com';
const HYDRA_API_KEY = process.env.NEXT_PUBLIC_HYDRA_DB_API_KEY;
const HYDRA_TENANT_ID = process.env.NEXT_PUBLIC_HYDRA_DB_TENANT_ID;

function getBaseParams(userId?: string) {
  return {
    tenant_id: HYDRA_TENANT_ID,
    sub_tenant_id: userId || process.env.NEXT_PUBLIC_HYDRA_DB_SUB_TENANT_ID || 'osap',
  };
}

function getHeaders(): HeadersInit {
  return {
    'Authorization': `Bearer ${HYDRA_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

export async function storeMemory(
  text: string,
  options?: {
    title?: string;
    infer?: boolean;
    userId?: string;
    taskId?: string;
  }
): Promise<{ success: boolean; source_id?: string; error?: string }> {
  if (!HYDRA_API_KEY || !HYDRA_TENANT_ID) {
    console.warn('[HydraDB] Not configured, skipping memory store');
    return { success: false, error: 'HydraDB not configured' };
  }

  try {
    const response = await fetch(`${HYDRA_API_URL}/memories/add_memory`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        memories: [
          {
            text,
            infer: options?.infer ?? true,
            title: options?.title || `Memory from OSAP`,
            source_id: options?.taskId ? `task_${options.taskId}` : (options?.userId ? `user_${options.userId}` : undefined),
          },
        ],
        ...getBaseParams(options?.userId),
        upsert: true,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.detail?.message || 'Failed to store memory' };
    }

    const result = await response.json();
    return { 
      success: true, 
      source_id: result.results?.[0]?.source_id 
    };
  } catch (error) {
    console.error('[HydraDB] Store error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function recallMemories(
  query: string,
  options?: {
    maxResults?: number;
    alpha?: number;
    recencyBias?: number;
    userId?: string;
  }
): Promise<HydraSearchResult | null> {
  if (!HYDRA_API_KEY || !HYDRA_TENANT_ID) {
    console.warn('[HydraDB] Not configured, skipping memory recall');
    return null;
  }

  try {
    const response = await fetch(`${HYDRA_API_URL}/recall/recall_preferences`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        query,
        max_results: options?.maxResults || 10,
        alpha: options?.alpha ?? 0.8,
        recency_bias: options?.recencyBias ?? 0.1,
        graph_context: true,
        ...getBaseParams(options?.userId),
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('[HydraDB] Recall error:', error);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('[HydraDB] Recall error:', error);
    return null;
  }
}

export async function verifyProcessing(sourceIds: string[], userId?: string): Promise<ProcessingStatus[]> {
  if (!HYDRA_API_KEY || !HYDRA_TENANT_ID) {
    return [];
  }

  try {
    const params = new URLSearchParams();
    sourceIds.forEach(id => params.append('file_ids', id));
    params.append('tenant_id', HYDRA_TENANT_ID);
    const subTenantId = userId || process.env.NEXT_PUBLIC_HYDRA_DB_SUB_TENANT_ID || 'osap';
    params.append('sub_tenant_id', subTenantId);

    const response = await fetch(`${HYDRA_API_URL}/ingestion/verify_processing?${params}`, {
      method: 'POST',
      headers: getHeaders(),
    });

    if (!response.ok) {
      return [];
    }

    const result = await response.json();
    return result.statuses || [];
  } catch (error) {
    console.error('[HydraDB] Verify processing error:', error);
    return [];
  }
}

export async function listMemories(options?: {
  limit?: number;
  offset?: number;
  userId?: string;
}): Promise<{ sources: Array<{ id: string; title: string; type: string; timestamp: string }>; total: number } | null> {
  if (!HYDRA_API_KEY || !HYDRA_TENANT_ID) {
    return null;
  }

  try {
    const response = await fetch(`${HYDRA_API_URL}/list/data`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        ...getBaseParams(options?.userId),
        limit: options?.limit || 50,
        offset: options?.offset || 0,
      }),
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('[HydraDB] List error:', error);
    return null;
  }
}

export async function deleteMemory(sourceId: string, userId?: string): Promise<boolean> {
  if (!HYDRA_API_KEY || !HYDRA_TENANT_ID) {
    return false;
  }

  try {
    const response = await fetch(`${HYDRA_API_URL}/memories/delete_memory`, {
      method: 'DELETE',
      headers: getHeaders(),
      body: JSON.stringify({
        source_id: sourceId,
        ...getBaseParams(userId),
      }),
    });

    return response.ok;
  } catch (error) {
    console.error('[HydraDB] Delete error:', error);
    return false;
  }
}

export function isHydraConfigured(): boolean {
  return !!(HYDRA_API_KEY && HYDRA_TENANT_ID);
}

export function formatMemoryContext(recallResult: HydraSearchResult | null): string {
  if (!recallResult || recallResult.chunks.length === 0) {
    return '';
  }

  const contextParts: string[] = [];

  contextParts.push('## Relevant Context from Memory:\n');

  for (const chunk of recallResult.chunks) {
    if (chunk.chunk_content) {
      contextParts.push(`- ${chunk.chunk_content}`);
    }
  }

  if (recallResult.graph_context?.query_paths?.length) {
    contextParts.push('\n## Related Knowledge:\n');
    for (const path of recallResult.graph_context.query_paths.slice(0, 3)) {
      for (const triplet of path.triplets) {
        contextParts.push(
          `- ${triplet.source.name} ${triplet.relation.canonical_predicate} ${triplet.target.name}`
        );
      }
    }
  }

  return contextParts.join('\n');
}

export async function storeTaskMemory(
  task: DbTask,
  context?: string
): Promise<void> {
  const contentParts: string[] = [];

  contentParts.push(`User Input: ${task.input}`);

  if (task.title) {
    contentParts.push(`Task: ${task.title}`);
  }

  if (task.result) {
    contentParts.push(`Result: ${JSON.stringify(task.result)}`);
  }

  if (task.error) {
    contentParts.push(`Error: ${task.error}`);
  }

  if (context) {
    contentParts.push(`Context: ${context}`);
  }

  const fullText = contentParts.join('\n');

  await storeMemory(fullText, {
    title: task.title || `Task: ${task.input.substring(0, 50)}...`,
    infer: true,
    taskId: task.id,
  });
}

export async function getContextForTask(
  userInput: string,
  userId: string
): Promise<{ context: string; memories: HydraSearchResult | null }> {
  const searchResult = await recallMemories(userInput, {
    maxResults: 5,
    alpha: 0.7,
    recencyBias: 0.2,
    userId,
  });

  const context = formatMemoryContext(searchResult);

  return { context, memories: searchResult };
}

export async function storeKnowledge(
  knowledge: {
    id: string;
    title: string;
    source: string;
    description?: string;
    url?: string;
    content?: string;
    timestamp?: string;
    metadata?: Record<string, unknown>;
    userId?: string;
  }
): Promise<{ success: boolean; source_id?: string; error?: string }> {
  if (!HYDRA_API_KEY || !HYDRA_TENANT_ID) {
    console.warn('[HydraDB] Not configured, skipping knowledge store');
    return { success: false, error: 'HydraDB not configured' };
  }

  try {
    const response = await fetch(`${HYDRA_API_URL}/ingestion/upload_knowledge`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        tenant_id: HYDRA_TENANT_ID,
        sub_tenant_id: knowledge.userId || process.env.NEXT_PUBLIC_HYDRA_DB_SUB_TENANT_ID || 'osap',
        upsert: true,
        app_sources: [
          {
            id: knowledge.id,
            title: knowledge.title,
            source: knowledge.source,
            description: knowledge.description || '',
            url: knowledge.url || '',
            timestamp: knowledge.timestamp || new Date().toISOString(),
            content: {
              text: knowledge.content || '',
            },
            metadata: knowledge.metadata || {},
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.detail?.message || 'Failed to store knowledge' };
    }

    const result = await response.json();
    return {
      success: true,
      source_id: result.results?.[0]?.source_id || knowledge.id,
    };
  } catch (error) {
    console.error('[HydraDB] Store knowledge error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function recallKnowledge(
  query: string,
  options?: {
    maxResults?: number;
    alpha?: number;
    userId?: string;
  }
): Promise<HydraSearchResult | null> {
  if (!HYDRA_API_KEY || !HYDRA_TENANT_ID) {
    console.warn('[HydraDB] Not configured, skipping knowledge recall');
    return null;
  }

  try {
    const response = await fetch(`${HYDRA_API_URL}/recall/full_recall`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        query,
        max_results: options?.maxResults || 10,
        alpha: options?.alpha ?? 0.5,
        graph_context: true,
        ...getBaseParams(options?.userId),
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('[HydraDB] Knowledge recall error:', error);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('[HydraDB] Knowledge recall error:', error);
    return null;
  }
}

export function formatKnowledgeContext(recallResult: HydraSearchResult | null): string {
  if (!recallResult || recallResult.chunks.length === 0) {
    return '';
  }

  const contextParts: string[] = [];

  contextParts.push('## Relevant Knowledge from Web Sources:\n');

  const seenSources = new Set<string>();
  for (const chunk of recallResult.chunks) {
    if (chunk.source_title && !seenSources.has(chunk.source_id)) {
      seenSources.add(chunk.source_id);
      contextParts.push(`\n### ${chunk.source_title}`);
      if (chunk.chunk_content) {
        contextParts.push(`\n${chunk.chunk_content.substring(0, 800)}${chunk.chunk_content.length > 800 ? '...' : ''}`);
      }
    }
  }

  return contextParts.join('\n');
}

export async function getContextForTaskWithKnowledge(
  userInput: string,
  userId: string
): Promise<{ memoryContext: string; knowledgeContext: string }> {
  const [memoryResult, knowledgeResult] = await Promise.all([
    recallMemories(userInput, { maxResults: 3, alpha: 0.7, recencyBias: 0.2, userId }),
    recallKnowledge(userInput, { maxResults: 5, alpha: 0.5, userId }),
  ]);

  const memoryContext = formatMemoryContext(memoryResult);
  const knowledgeContext = formatKnowledgeContext(knowledgeResult);

  return { memoryContext, knowledgeContext };
}
