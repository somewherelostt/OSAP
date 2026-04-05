'use client';

export interface FeedbackEntry {
  id: string;
  agentId: string;
  type: 'success' | 'failure' | 'strategy' | 'pattern' | 'context';
  
  input: string;
  action: string;
  outcome: 'positive' | 'negative' | 'neutral';
  
  result?: string;
  error?: string;
  
  successRate: number;
  attemptCount: number;
  lastAttempt: string;
  createdAt: string;
  
  tags: string[];
  context: {
    domain?: string;
    complexity?: 'low' | 'medium' | 'high';
    timeOfDay?: string;
    userId?: string;
    [key: string]: unknown;
  };
  
  embeddings?: number[];
}

export interface LearningPattern {
  id: string;
  pattern: string;
  description: string;
  successRate: number;
  useCount: number;
  lastUsed: string;
  source: 'inferred' | 'explicit' | 'learned';
}

export interface FeedbackLoopConfig {
  maxEntries: number;
  minSuccessRate: number;
  decayRate: number;
  similarityThreshold: number;
  enableClustering: boolean;
  enableInferencing: boolean;
}

const defaultConfig: FeedbackLoopConfig = {
  maxEntries: 1000,
  minSuccessRate: 0.5,
  decayRate: 0.95,
  similarityThreshold: 0.8,
  enableClustering: true,
  enableInferencing: true,
};

function generateId(): string {
  return `fb_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function simpleEmbedding(text: string): number[] {
  const embedding = new Array(32).fill(0);
  const words = text.toLowerCase().split(/\s+/);
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    for (let j = 0; j < Math.min(word.length, 32); j++) {
      embedding[(i + j) % 32] += word.charCodeAt(j) / (i + 1);
    }
  }
  
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] /= magnitude;
    }
  }
  
  return embedding;
}

export class MemoryFeedbackLoop {
  private entries: Map<string, FeedbackEntry> = new Map();
  private patterns: Map<string, LearningPattern> = new Map();
  private config: FeedbackLoopConfig;
  private onLearning?: (pattern: LearningPattern) => void;

  constructor(config: Partial<FeedbackLoopConfig> = {}, onLearning?: (pattern: LearningPattern) => void) {
    this.config = { ...defaultConfig, ...config };
    this.onLearning = onLearning;
  }

  record(entry: Omit<FeedbackEntry, 'id' | 'successRate' | 'attemptCount' | 'lastAttempt' | 'createdAt' | 'embeddings'>): FeedbackEntry {
    const existingKey = this.findExistingEntry(entry.agentId, entry.input, entry.action);
    
    const embeddings = simpleEmbedding(`${entry.input} ${entry.action}`);
    
    if (existingKey) {
      const existing = this.entries.get(existingKey)!;
      existing.attemptCount++;
      existing.lastAttempt = new Date().toISOString();
      existing.result = entry.result;
      existing.error = entry.error;
      
      if (entry.outcome === 'positive') {
        existing.successRate = Math.min(100, existing.successRate + 5);
      } else if (entry.outcome === 'negative') {
        existing.successRate = Math.max(0, existing.successRate - 10);
      }
      
      this.entries.set(existingKey, existing);
      return existing;
    }

    const newEntry: FeedbackEntry = {
      ...entry,
      id: generateId(),
      successRate: entry.outcome === 'positive' ? 100 : entry.outcome === 'negative' ? 0 : 50,
      attemptCount: 1,
      lastAttempt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      embeddings,
    };

    this.entries.set(newEntry.id, newEntry);
    this.pruneOldEntries();
    
    if (newEntry.successRate >= this.config.minSuccessRate * 100) {
      this.inferPattern(newEntry);
    }

    this.updatePatternSuccessRates();

    return newEntry;
  }

  private findExistingEntry(agentId: string, input: string, action: string): string | undefined {
    for (const [id, entry] of this.entries) {
      if (
        entry.agentId === agentId &&
        entry.input === input &&
        entry.action === action
      ) {
        return id;
      }
    }
    return undefined;
  }

  private inferPattern(entry: FeedbackEntry): void {
    if (!this.config.enableInferencing) return;

    const patternKey = this.generatePatternKey(entry);
    const existing = this.patterns.get(patternKey);

    if (existing) {
      existing.useCount++;
      existing.lastUsed = new Date().toISOString();
      existing.successRate = (existing.successRate * (existing.useCount - 1) + entry.successRate) / existing.useCount;
    } else {
      const pattern: LearningPattern = {
        id: generateId(),
        pattern: patternKey,
        description: this.generatePatternDescription(entry),
        successRate: entry.successRate,
        useCount: 1,
        lastUsed: new Date().toISOString(),
        source: 'learned',
      };

      this.patterns.set(patternKey, pattern);
      this.onLearning?.(pattern);
    }
  }

  private generatePatternKey(entry: FeedbackEntry): string {
    const inputWords = entry.input.toLowerCase().split(/\s+/).slice(0, 5);
    return `${entry.action}:${inputWords.join(' ')}`;
  }

  private generatePatternDescription(entry: FeedbackEntry): string {
    return `When ${entry.input.substring(0, 50)}... then ${entry.action} (${entry.successRate}% success)`;
  }

  private updatePatternSuccessRates(): void {
    for (const [key, pattern] of this.patterns) {
      const matchingEntries = Array.from(this.entries.values()).filter(
        e => this.generatePatternKey(e) === key
      );

      if (matchingEntries.length > 0) {
        const avgSuccess = matchingEntries.reduce((sum, e) => sum + e.successRate, 0) / matchingEntries.length;
        pattern.successRate = avgSuccess;
      }

      const daysSinceLastUse = (Date.now() - new Date(pattern.lastUsed).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceLastUse > 7) {
        pattern.successRate *= Math.pow(this.config.decayRate, daysSinceLastUse - 7);
      }
    }
  }

  private pruneOldEntries(): void {
    if (this.entries.size <= this.config.maxEntries) return;

    const entriesArray = Array.from(this.entries.values());
    entriesArray.sort((a, b) => {
      const aScore = a.successRate * Math.log(a.attemptCount + 1);
      const bScore = b.successRate * Math.log(b.attemptCount + 1);
      return bScore - aScore;
    });

    const toDelete = entriesArray.slice(this.config.maxEntries);
    toDelete.forEach(e => this.entries.delete(e.id));
  }

  recall(query: string, options?: {
    agentId?: string;
    type?: FeedbackEntry['type'];
    minSuccessRate?: number;
    limit?: number;
  }): FeedbackEntry[] {
    const queryEmbedding = simpleEmbedding(query);
    
    let results = Array.from(this.entries.values());

    if (options?.agentId) {
      results = results.filter(e => e.agentId === options.agentId);
    }

    if (options?.type) {
      results = results.filter(e => e.type === options.type);
    }

    if (options?.minSuccessRate !== undefined) {
      results = results.filter(e => e.successRate >= options.minSuccessRate! * 100);
    }

    results = results
      .map(entry => ({
        entry,
        similarity: entry.embeddings ? cosineSimilarity(queryEmbedding, entry.embeddings) : 0,
      }))
      .filter(({ similarity }) => similarity >= this.config.similarityThreshold)
      .sort((a, b) => b.similarity - a.similarity)
      .map(({ entry }) => entry);

    if (options?.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  getPatterns(options?: {
    minSuccessRate?: number;
    limit?: number;
  }): LearningPattern[] {
    let patterns = Array.from(this.patterns.values());

    if (options?.minSuccessRate !== undefined) {
      patterns = patterns.filter(p => p.successRate >= options.minSuccessRate! * 100);
    }

    patterns.sort((a, b) => {
      const aScore = a.successRate * Math.log(a.useCount + 1);
      const bScore = b.successRate * Math.log(b.useCount + 1);
      return bScore - aScore;
    });

    if (options?.limit) {
      patterns = patterns.slice(0, options.limit);
    }

    return patterns;
  }

  getSuggestions(context: {
    agentId: string;
    task: string;
    previousActions?: string[];
  }): string[] {
    const suggestions: string[] = [];
    const previousActionsSet = new Set(context.previousActions || []);

    const relevantEntries = this.recall(context.task, {
      agentId: context.agentId,
      limit: 10,
    });

    for (const entry of relevantEntries) {
      if (
        entry.successRate >= this.config.minSuccessRate * 100 &&
        !previousActionsSet.has(entry.action)
      ) {
        suggestions.push(entry.action);
      }
    }

    const patterns = this.getPatterns({ minSuccessRate: this.config.minSuccessRate });
    for (const pattern of patterns) {
      if (
        pattern.successRate >= this.config.minSuccessRate * 100 &&
        pattern.pattern.toLowerCase().includes(context.task.toLowerCase().substring(0, 20))
      ) {
        const action = pattern.pattern.split(':')[0];
        if (!previousActionsSet.has(action) && !suggestions.includes(action)) {
          suggestions.push(action);
        }
      }
    }

    return suggestions.slice(0, 5);
  }

  getMetrics(): {
    totalEntries: number;
    totalPatterns: number;
    averageSuccessRate: number;
    highPerformers: number;
    lowPerformers: number;
  } {
    const entries = Array.from(this.entries.values());
    const patterns = Array.from(this.patterns.values());

    const avgSuccess = entries.length > 0
      ? entries.reduce((sum, e) => sum + e.successRate, 0) / entries.length
      : 0;

    return {
      totalEntries: entries.length,
      totalPatterns: patterns.length,
      averageSuccessRate: avgSuccess,
      highPerformers: entries.filter(e => e.successRate >= 80).length,
      lowPerformers: entries.filter(e => e.successRate <= 20).length,
    };
  }

  clear(olderThan?: string): void {
    if (!olderThan) {
      this.entries.clear();
      this.patterns.clear();
      return;
    }

    const cutoff = new Date(olderThan).getTime();
    for (const [id, entry] of this.entries) {
      if (new Date(entry.createdAt).getTime() < cutoff) {
        this.entries.delete(id);
      }
    }

    for (const [id, pattern] of this.patterns) {
      if (new Date(pattern.lastUsed).getTime() < cutoff) {
        this.patterns.delete(id);
      }
    }
  }

  exportData(): { entries: FeedbackEntry[]; patterns: LearningPattern[] } {
    return {
      entries: Array.from(this.entries.values()),
      patterns: Array.from(this.patterns.values()),
    };
  }

  importData(data: { entries?: FeedbackEntry[]; patterns?: LearningPattern[] }): void {
    if (data.entries) {
      data.entries.forEach(entry => {
        this.entries.set(entry.id, entry);
      });
    }

    if (data.patterns) {
      data.patterns.forEach(pattern => {
        this.patterns.set(pattern.id, pattern);
      });
    }

    this.pruneOldEntries();
  }

  updateConfig(config: Partial<FeedbackLoopConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

let feedbackLoopInstance: MemoryFeedbackLoop | null = null;

export function getMemoryFeedbackLoop(): MemoryFeedbackLoop {
  if (!feedbackLoopInstance) {
    feedbackLoopInstance = new MemoryFeedbackLoop();
  }
  return feedbackLoopInstance;
}

export function resetMemoryFeedbackLoop(): void {
  feedbackLoopInstance = null;
}
