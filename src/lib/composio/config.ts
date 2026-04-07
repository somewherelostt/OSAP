import { z } from "zod";

/**
 * Configuration schema for Composio Tool Router
 * Uses Zod for validation and environment variable loading
 */

// Session configuration schema
const SessionConfigSchema = z.object({
  ttlSeconds: z.number().default(3600),
  maxSessions: z.number().default(100),
  extendOnActivity: z.boolean().default(true),
});

// Cache configuration schema
const CacheConfigSchema = z.object({
  enabled: z.boolean().default(true),
  maxSize: z.number().default(100),
  cleanupIntervalMinutes: z.number().default(10),
});

// Timeout configuration schema
const TimeoutConfigSchema = z.object({
  requestMs: z.number().default(30000),
  connectMs: z.number().default(5000),
});

// Main configuration schema
export const ToolRouterConfigSchema = z.object({
  // API Configuration
  apiKey: z.string().min(1, "API key is required"),
  baseUrl: z.string().default("https://backend.composio.dev"),

  // Session Management
  session: SessionConfigSchema.default({
    ttlSeconds: 3600,
    maxSessions: 100,
    extendOnActivity: true
  }),

  // Cache Configuration
  cache: CacheConfigSchema.default({
    enabled: true,
    maxSize: 100,
    cleanupIntervalMinutes: 10
  }),

  // Timeouts
  timeout: TimeoutConfigSchema.default({
    requestMs: 30000,
    connectMs: 5000
  }),
});

// Inferred TypeScript types
export type SessionConfig = z.infer<typeof SessionConfigSchema>;
export type CacheConfig = z.infer<typeof CacheConfigSchema>;
export type TimeoutConfig = z.infer<typeof TimeoutConfigSchema>;
export type ToolRouterConfig = z.infer<typeof ToolRouterConfigSchema>;

/**
 * Load configuration from environment variables
 * @returns Validated ToolRouterConfig
 * @throws z.ZodError if validation fails
 */
export function loadConfig(): ToolRouterConfig {
  const config = ToolRouterConfigSchema.parse({
    apiKey: process.env.COMPOSIO_API_KEY,
    baseUrl: process.env.COMPOSIO_BASE_URL,
    session: {
      ttlSeconds: process.env.COMPOSIO_SESSION_TTL_SECONDS
        ? parseInt(process.env.COMPOSIO_SESSION_TTL_SECONDS, 10)
        : undefined,
      maxSessions: process.env.COMPOSIO_MAX_SESSIONS
        ? parseInt(process.env.COMPOSIO_MAX_SESSIONS, 10)
        : undefined,
    },
  });

  return config;
}

/**
 * Load configuration with defaults (for testing/development)
 * @param overrides - Partial config to override defaults
 * @returns ToolRouterConfig with defaults applied
 */
export function loadConfigWithDefaults(
  overrides: Partial<ToolRouterConfig> = {}
): ToolRouterConfig {
  return ToolRouterConfigSchema.parse({
    apiKey: overrides.apiKey || process.env.COMPOSIO_API_KEY || "",
    baseUrl: overrides.baseUrl || process.env.COMPOSIO_BASE_URL,
    session: overrides.session,
    cache: overrides.cache,
    timeout: overrides.timeout,
  });
}
