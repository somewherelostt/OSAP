import type { DbMemoryNode } from '@/types/database';
import {
  createMemoryNode,
  getMemoryNodes,
  searchMemoryNodes,
  updateMemoryNode,
  deleteMemoryNode,
} from './database';

export interface MemoryContext {
  recentTasks?: string[];
  preferences?: string[];
  facts?: string[];
  interactions?: string[];
}

// Get memory context for a user (for AI prompts)
export async function getMemoryContext(
  userId: string,
  limit = 20
): Promise<MemoryContext> {
  const nodes = await getMemoryNodes(userId, undefined, limit);

  const context: MemoryContext = {
    recentTasks: [],
    preferences: [],
    facts: [],
    interactions: [],
  };

  for (const node of nodes) {
    switch (node.type) {
      case 'task_summary':
        context.recentTasks?.push(node.content);
        break;
      case 'preference':
        context.preferences?.push(node.content);
        break;
      case 'fact':
        context.facts?.push(node.content);
        break;
      case 'interaction':
        context.interactions?.push(node.content);
        break;
    }
  }

  return context;
}

// Store a new memory
export async function storeMemory(
  userId: string,
  content: string,
  type: DbMemoryNode['type'],
  source?: string,
  importance = 5
): Promise<DbMemoryNode> {
  return createMemoryNode({
    user_id: userId,
    type,
    content,
    source,
    metadata: {},
    importance,
  });
}

// Recall memories based on query
export async function recallMemory(
  userId: string,
  query: string,
  type?: DbMemoryNode['type']
): Promise<DbMemoryNode[]> {
  if (type) {
    const nodes = await getMemoryNodes(userId, type);
    // Simple keyword matching
    const queryLower = query.toLowerCase();
    return nodes.filter(
      (node) =>
        node.content.toLowerCase().includes(queryLower) ||
        node.source?.toLowerCase().includes(queryLower)
    );
  }

  return searchMemoryNodes(userId, query);
}

// Update memory importance (for decay)
export async function updateImportance(
  nodeId: string,
  importance: number
): Promise<DbMemoryNode> {
  return updateMemoryNode(nodeId, { importance });
}

// Decay old memories
export async function decayOldMemories(
  userId: string,
  daysOld = 7,
  decayAmount = 1
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  const nodes = await getMemoryNodes(userId);
  let decayedCount = 0;

  for (const node of nodes) {
    if (new Date(node.created_at) < cutoffDate && node.importance > 1) {
      await updateImportance(node.id, Math.max(1, node.importance - decayAmount));
      decayedCount++;
    }
  }

  return decayedCount;
}

// Delete a memory
export async function removeMemory(nodeId: string): Promise<void> {
  await deleteMemoryNode(nodeId);
}

// Get memory statistics
export async function getMemoryStats(userId: string): Promise<{
  total: number;
  byType: Record<string, number>;
  avgImportance: number;
}> {
  const nodes = await getMemoryNodes(userId, undefined, 1000);

  const byType: Record<string, number> = {};
  let totalImportance = 0;

  for (const node of nodes) {
    byType[node.type] = (byType[node.type] || 0) + 1;
    totalImportance += node.importance;
  }

  return {
    total: nodes.length,
    byType,
    avgImportance: nodes.length > 0 ? totalImportance / nodes.length : 0,
  };
}
