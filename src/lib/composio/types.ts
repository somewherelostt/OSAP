import { z } from "zod";

// ============================================================================
// Tool Router Tool Interfaces
// ============================================================================

/**
 * Interface for a toolkit (a collection of tools, e.g. "Gmail")
 */
export interface Toolkit {
  slug: string;
  name: string;
  description: string;
  logo?: string;
  authSchemes: string[];
  category?: string;
  tags?: string[];
  connection?: {
    is_active: boolean;
    connected_account?: any;
  } | null;
}

/**
 * Interface for a single tool
 */
export interface Tool {
  slug: string;
  name?: string;
  description: string;
  toolkit?: {
    slug: string;
    name: string;
  };
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

/**
 * Result of a tool execution
 */
export interface ToolExecutionResult<T = unknown> {
  success: boolean;
  data: T;
  error?: {
    message: string;
    code: string;
    details?: Record<string, unknown>;
  };
  executionId: string;
  metadata?: {
    durationMs?: number;
    toolSlug?: string;
    retryCount?: number;
  };
}

/**
 * Options for creating a Tool Router tool
 */
export interface ToolRouterToolOptions {
  enableAuthRetry?: boolean;
  onAuthRequired?: (toolkitSlug: string, authUrl: string) => void;
  maxRetries?: number;
  timeoutMs?: number;
  includeRawResponse?: boolean;
}

// ============================================================================
// Zod Schemas for Validation
// ============================================================================

/**
 * Zod schema for ToolExecutionResult
 */
export const ZToolExecutionResult = z.object({
  success: z.boolean(),
  data: z.any(),
  error: z
    .object({
      message: z.string(),
      code: z.string(),
      details: z.record(z.string(), z.any()).optional(),
    })
    .optional(),
  executionId: z.string(),
  metadata: z
    .object({
      durationMs: z.number().optional(),
      toolSlug: z.string().optional(),
      retryCount: z.number().optional(),
    })
    .optional(),
});
