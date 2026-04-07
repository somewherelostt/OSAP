import { ComposioToolRouter } from "./router";
import { ToolRouterConfigSchema } from "./config";

let toolRouterInstance: ComposioToolRouter | null = null;

/**
 * Singleton getter for the ComposioToolRouter
 */
export function getToolRouter(): ComposioToolRouter {
  if (!toolRouterInstance) {
    const config = ToolRouterConfigSchema.parse({
      apiKey: process.env.COMPOSIO_API_KEY,
      baseUrl: process.env.COMPOSIO_BASE_URL || "https://backend.composio.dev",
    });
    toolRouterInstance = new ComposioToolRouter(config);
  }
  return toolRouterInstance;
}

// Re-export core types and components for convenience
export * from "./router";
export * from "./config";
export * from "./session";
export * from "./errors";
export * from "./types";
export * from "./file-operations";

/**
 * Compatibility wrapper for existing executor
 */
export async function executeComposioToolCall(clerkUserId: string, toolCall: { name: string; parameters: any }) {
  try {
    const router = getToolRouter();
    // Using Clerk ID as entityId for Composio session
    const session = await router.getOrCreateSession(process.env.COMPOSIO_PROJECT_NAME || "osap-main", clerkUserId);
    
    // Normalization: Ensure name is lowercase for session execution
    const toolName = toolCall.name.toLowerCase();
    
    const result = await router.executeTool(session.id, toolName, {
      arguments: toolCall.parameters
    });
    
    return result;
  } catch (error: any) {
    console.error(`[ComposioIndex] Execution failed for ${toolCall.name}:`, error);
    
    // Check for 4302 (No Connection)
    const errorCode = error.code || (error.originalError as any)?.code;
    const errorMessage = error.message || "";
    
    if (errorCode === "4302" || errorMessage.includes("No active connection found")) {
      console.log(`[ComposioIndex] Detected missing connection for ${toolCall.name}. Initiating auth for ${clerkUserId}...`);
      
      // Extract toolkit slug from error message or tool name
      // Example message: "No active connection found for toolkit(s) 'gmail' in this session..."
      let toolkitSlug = toolCall.name.split('_')[0]; // Default fallback
      const match = errorMessage.match(/toolkit\(s\)\s+'([^']+)'/);
      if (match && match[1]) {
        toolkitSlug = match[1];
      }

      try {
        const authInfo = await initiateComposioAuth(clerkUserId, toolkitSlug);
        if (authInfo.linkUrl) {
          return {
            success: false,
            authRequired: true,
            toolkit: toolkitSlug,
            authUrl: authInfo.linkUrl,
            error: {
              message: `I need permission to access ${toolkitSlug.toUpperCase()}. Please click the link to connect your account.`,
              code: "AUTH_REQUIRED"
            }
          };
        }
      } catch (authError) {
        console.error(`[ComposioIndex] Failed to initiate auto-auth for ${toolkitSlug}:`, authError);
      }
    }

    return {
      success: false,
      error: {
        message: error.message || String(error),
        code: errorCode || "EXECUTION_ERROR"
      }
    };
  }
}

/**
 * Initiate auth for a specific toolkit and user
 */
export async function initiateComposioAuth(clerkUserId: string, toolkit: string) {
  const router = getToolRouter();
  const session = await router.getOrCreateSession(process.env.COMPOSIO_PROJECT_NAME || "osap-main", clerkUserId);
  return await router.initiateAuth(session.id, toolkit);
}

/**
 * Compatibility wrapper for tool search
 */
export async function searchTools(query: string, limit = 20, clerkUserId: string = "anonymous") {
  const router = getToolRouter();
  const session = await router.getOrCreateSession(process.env.COMPOSIO_PROJECT_NAME || "osap-main", clerkUserId);
  
  let results = await router.searchTools(session.id, query);
  
  // Fallback: If search returns nothing, try a more aggressive approach
  if (results.length === 0) {
    const words = query.split(/\s+/);
    // 1. Try the first word (likely the app name)
    if (words.length > 0) {
      console.log(`[ComposioIndex] Search failed for "${query}", falling back to keyword: "${words[0]}"`);
      results = await router.searchTools(session.id, words[0]);
    }
    
    // 2. If still nothing, try common toolkit prefixes
    if (results.length === 0 && query.toLowerCase().includes('mail')) {
      results = await router.searchTools(session.id, 'gmail');
    }
  }
  
  return {
    tools: results.slice(0, limit).map((t: any) => ({
      name: t.slug,
      description: t.description,
      inputSchema: t.inputSchema || {},
      enabled: true,
      connected: true,
    })),
    total: results.length,
    query,
  };
}

/**
 * Consistency wrapper for meta-tools definitions
 */
export function createComposioMetaTools() {
  return [
    {
      name: 'composio_search_tools',
      description: 'Search for available tools using natural language',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Natural language search query' },
          limit: { type: 'number', default: 20 },
        },
        required: ['query'],
      },
    },
    {
      name: 'composio_execute_tool',
      description: 'Execute a tool from the Composio toolkit',
      input_schema: {
        type: 'object',
        properties: {
          toolName: { type: 'string', description: 'Name of the tool to execute' },
          input: { type: 'object', description: 'Tool input parameters' },
        },
        required: ['toolName', 'input'],
      },
    }
  ];
}
