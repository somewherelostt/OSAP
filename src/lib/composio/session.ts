import { ToolRouterConfig } from "./config";
import { SessionExpiredError, SessionLimitExceededError } from "./errors";

class Semaphore {
  private tasks: (() => void)[] = [];
  private count: number;

  constructor(count: number) {
    this.count = count;
  }

  async acquire(): Promise<void> {
    if (this.count > 0) {
      this.count--;
      return Promise.resolve();
    }

    return new Promise<void>(resolve => {
      this.tasks.push(() => {
        this.count--;
        resolve();
      });
    });
  }

  release(): void {
    this.count++;
    if (this.tasks.length > 0) {
      const nextTask = this.tasks.shift();
      if (nextTask) nextTask();
    }
  }
}

// ============================================================================
// Session ID Validation (SEC-003: Prevent SSRF via Session ID Injection)
// ============================================================================

function validateSessionId(sessionId: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(sessionId) && sessionId.length <= 128;
}

function sanitizeSessionId(sessionId: string): string {
  return sessionId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
}

/**
 * Session data structure
 */
export interface ToolRouterSession {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  projectId: string;
  userId?: string;
  metadata: Record<string, unknown>;
}

/**
 * Session authentication state
 */
export interface SessionAuthState {
  sessionId: string;
  toolkitSlug: string;
  authScheme: string;
  status: "pending" | "link_required" | "authenticated" | "failed";
  linkUrl?: string;
  connectedAccountId?: string;
  linkedAt?: Date;
}

/**
 * Parameters for creating a new session
 */
export interface CreateSessionParams {
  projectId: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  ttlSeconds?: number;
}

/**
 * Internal cache entry for session storage
 */
interface SessionCacheEntry {
  session: ToolRouterSession;
  lastAccessedAt: Date;
  authStates: Map<string, SessionAuthState>;
}

/**
 * Simple LRU (Least Recently Used) Cache implementation with TTL support
 */
class LRUCache<K, V> {
  private cache: Map<K, V>;
  private maxSize: number;

  constructor(maxSize: number) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  size(): number {
    return this.cache.size;
  }

  keys(): IterableIterator<K> {
    return this.cache.keys();
  }

  entries(): IterableIterator<[K, V]> {
    return this.cache.entries();
  }

  clear(): void {
    this.cache.clear();
  }
}

/**
 * SessionManager handles caching and lifecycle of Tool Router sessions
 */
export class SessionManager {
  private cache: LRUCache<string, SessionCacheEntry>;
  private config: ToolRouterConfig;
  private cleanupInterval?: ReturnType<typeof setInterval>;
  private sessionCounts: Map<string, number> = new Map();
  private projectSemaphores: Map<string, Semaphore> = new Map();

  constructor(config: ToolRouterConfig) {
    this.config = config;
    this.cache = new LRUCache(config.cache.maxSize);

    if (config.cache.cleanupIntervalMinutes > 0) {
      this.startCleanupInterval();
    }
  }

  private async acquireSession(projectId: string): Promise<boolean> {
    let sem = this.projectSemaphores.get(projectId);
    if (!sem) {
      sem = new Semaphore(this.config.session.maxSessions);
      this.projectSemaphores.set(projectId, sem);
    }
    try {
      await sem.acquire();
      return true;
    } catch {
      return false;
    }
  }
  
  private releaseSession(projectId: string): void {
    const sem = this.projectSemaphores.get(projectId);
    if (sem) {
      sem.release();
    }
  }

  startCleanupInterval(): void {
    this.stopCleanupInterval();
    const intervalMs = this.config.cache.cleanupIntervalMinutes * 60 * 1000;
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, intervalMs);
  }

  stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  private getSessionKey(projectId: string, userId?: string): string {
    return userId ? `${projectId}:${userId}` : projectId;
  }

  async createSession(
    sessionId: string,
    params: CreateSessionParams
  ): Promise<ToolRouterSession> {
    const sanitizedId = sanitizeSessionId(sessionId);
    if (!validateSessionId(sanitizedId)) {
      throw new Error('Invalid session ID format');
    }

    const projectKey = this.getSessionKey(params.projectId, params.userId);

    const currentCount = this.sessionCounts.get(params.projectId) || 0;
    if (currentCount >= this.config.session.maxSessions) {
      throw new SessionLimitExceededError(
        params.projectId,
        this.config.session.maxSessions
      );
    }

    const acquired = await this.acquireSession(params.projectId);
    if (!acquired) {
      throw new SessionLimitExceededError(
        params.projectId,
        this.config.session.maxSessions
      );
    }

    const postAcquireCount = this.sessionCounts.get(params.projectId) || 0;
    if (postAcquireCount >= this.config.session.maxSessions) {
      this.releaseSession(params.projectId);
      throw new SessionLimitExceededError(
        params.projectId,
        this.config.session.maxSessions
      );
    }

    const ttlSeconds = params.ttlSeconds !== undefined ? params.ttlSeconds : this.config.session.ttlSeconds;
    const now = new Date();
    const session: ToolRouterSession = {
      id: sessionId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + ttlSeconds * 1000),
      projectId: params.projectId,
      userId: params.userId,
      metadata: params.metadata || {},
    };

    const entry: SessionCacheEntry = {
      session,
      lastAccessedAt: now,
      authStates: new Map(),
    };

    this.cache.set(projectKey, entry);
    this.sessionCounts.set(params.projectId, currentCount + 1);

    return session;
  }

  getSession(projectId: string, userId?: string): ToolRouterSession | null {
    const key = this.getSessionKey(projectId, userId);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    if (new Date() > entry.session.expiresAt) {
      this.cache.delete(key);
      this.decrementSessionCount(entry.session.projectId);
      throw new SessionExpiredError(entry.session.id);
    }

    entry.lastAccessedAt = new Date();

    if (this.config.session.extendOnActivity) {
      this.extendSession(entry);
    }

    return entry.session;
  }

  updateSession(session: ToolRouterSession): boolean {
    const key = this.getSessionKey(session.projectId, session.userId);
    const entry = this.cache.get(key);

    if (entry) {
      entry.session = session;
      entry.lastAccessedAt = new Date();
      return true;
    }
    return false;
  }

  deleteSession(projectId: string, userId?: string): boolean {
    const key = this.getSessionKey(projectId, userId);
    const entry = this.cache.get(key);

    if (entry) {
      this.cache.delete(key);
      this.decrementSessionCount(entry.session.projectId);
      return true;
    }

    return false;
  }

  private extendSession(entry: SessionCacheEntry): void {
    const extensionSeconds = this.config.session.ttlSeconds;
    entry.session.expiresAt = new Date(
      Date.now() + extensionSeconds * 1000
    );
  }

  private decrementSessionCount(projectId: string): void {
    const count = this.sessionCounts.get(projectId) || 0;
    if (count > 0) {
      this.sessionCounts.set(projectId, count - 1);
      this.releaseSession(projectId);
    }
  }

  getAuthState(
    projectId: string,
    toolkitSlug: string,
    userId?: string
  ): SessionAuthState | undefined {
    const key = this.getSessionKey(projectId, userId);
    const entry = this.cache.get(key);
    return entry?.authStates.get(toolkitSlug);
  }

  setAuthState(
    projectId: string,
    toolkitSlug: string,
    authState: SessionAuthState,
    userId?: string
  ): void {
    const key = this.getSessionKey(projectId, userId);
    const entry = this.cache.get(key);

    if (entry) {
      entry.authStates.set(toolkitSlug, authState);
      entry.lastAccessedAt = new Date();
    }
  }

  findSessionById(
    sessionId: string
  ): { projectId: string; userId?: string; session: ToolRouterSession } | null {
    const sanitizedId = sanitizeSessionId(sessionId);
    if (!validateSessionId(sanitizedId)) {
      return null;
    }

    const entries = Array.from(this.cache.entries());
    for (const [key, entry] of entries) {
      if (entry.session.id === sanitizedId) {
        return {
          projectId: entry.session.projectId,
          userId: entry.session.userId,
          session: entry.session,
        };
      }
    }
    return null;
  }

  setAuthPending(
    sessionId: string,
    toolkitSlug: string,
    linkUrl: string,
    authScheme: string = "OAUTH2"
  ): boolean {
    const sanitizedId = sanitizeSessionId(sessionId);
    if (!validateSessionId(sanitizedId)) {
      return false;
    }

    const sessionInfo = this.findSessionById(sanitizedId);
    if (!sessionInfo) {
      return false;
    }

    const authState: SessionAuthState = {
      sessionId,
      toolkitSlug,
      authScheme,
      status: "link_required",
      linkUrl,
    };

    this.setAuthState(
      sessionInfo.projectId,
      toolkitSlug,
      authState,
      sessionInfo.userId
    );

    return true;
  }

  setAuthComplete(
    sessionId: string,
    toolkitSlug: string,
    connectedAccountId?: string
  ): boolean {
    const sanitizedId = sanitizeSessionId(sessionId);
    if (!validateSessionId(sanitizedId)) {
      return false;
    }

    const sessionInfo = this.findSessionById(sanitizedId);
    if (!sessionInfo) {
      return false;
    }

    const authState: SessionAuthState = {
      sessionId,
      toolkitSlug,
      authScheme:
        this.getAuthState(sessionInfo.projectId, toolkitSlug, sessionInfo.userId)
          ?.authScheme || "OAUTH2",
      status: "authenticated",
      connectedAccountId,
      linkedAt: new Date(),
    };

    this.setAuthState(
      sessionInfo.projectId,
      toolkitSlug,
      authState,
      sessionInfo.userId
    );

    return true;
  }

  setAuthFailed(
    sessionId: string,
    toolkitSlug: string,
    error: string | Error
  ): boolean {
    const sanitizedId = sanitizeSessionId(sessionId);
    if (!validateSessionId(sanitizedId)) {
      return false;
    }

    const sessionInfo = this.findSessionById(sanitizedId);
    if (!sessionInfo) {
      return false;
    }

    const errorMessage = error instanceof Error ? error.message : error;

    const authState: SessionAuthState = {
      sessionId,
      toolkitSlug,
      authScheme:
        this.getAuthState(sessionInfo.projectId, toolkitSlug, sessionInfo.userId)
          ?.authScheme || "OAUTH2",
      status: "failed",
    };

    this.setAuthState(
      sessionInfo.projectId,
      toolkitSlug,
      authState,
      sessionInfo.userId
    );

    console.error(
      `[SessionManager] Auth failed for ${toolkitSlug} (session: ${sessionId}): ${errorMessage}`
    );

    return true;
  }

  getAuthStateBySessionId(
    sessionId: string,
    toolkitSlug: string
  ): SessionAuthState | undefined {
    const sanitizedId = sanitizeSessionId(sessionId);
    if (!validateSessionId(sanitizedId)) {
      return undefined;
    }

    const sessionInfo = this.findSessionById(sanitizedId);
    if (!sessionInfo) {
      return undefined;
    }

    return this.getAuthState(
      sessionInfo.projectId,
      toolkitSlug,
      sessionInfo.userId
    );
  }

  private cleanupExpiredSessions(): void {
    const now = new Date();
    let cleaned = 0;

    const keys = Array.from(this.cache.keys());
    for (const key of keys) {
      const entry = this.cache.get(key);
      if (entry && now > entry.session.expiresAt) {
        this.cache.delete(key);
        this.decrementSessionCount(entry.session.projectId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[SessionManager] Cleaned up ${cleaned} expired sessions`);
    }
  }

  destroy(): void {
    this.stopCleanupInterval();
  }
}
