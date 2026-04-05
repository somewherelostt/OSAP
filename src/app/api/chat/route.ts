import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateClerkUser } from '@/lib/database';

const GLM_API_URL = process.env.GLM_API_URL || 'https://api.z.ai/api/coding/paas/v4/chat/completions';
const GLM_API_KEY = process.env.GLM_API_KEY;
const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY;

interface ChatTask {
  id: string;
  input: string;
  reply: string;
  status: string;
  toolsUsed?: string[];
  createdAt: Date;
}

interface InMemoryMemory {
  id: string;
  content: string;
  type: string;
  createdAt: Date;
}

const inMemoryTasks: Map<string, ChatTask[]> = new Map();
const inMemoryMemories: Map<string, InMemoryMemory[]> = new Map();

// In-memory memory store (fallback when HydraDB unavailable)
function storeInMemory(userId: string, content: string, type = 'fact') {
  const memories = inMemoryMemories.get(userId) || [];
  memories.unshift({
    id: `mem_${Date.now()}`,
    content,
    type,
    createdAt: new Date(),
  });
  inMemoryMemories.set(userId, memories.slice(0, 50));
}

function recallInMemory(userId: string, query: string): string {
  const memories = inMemoryMemories.get(userId) || [];
  if (!query) return '';
  
  const queryLower = query.toLowerCase();
  const relevant = memories.filter(m => 
    m.content.toLowerCase().includes(queryLower)
  );
  
  return relevant.slice(0, 5).map(m => m.content).join('\n');
}

// Get available Composio tools
async function getComposioTools() {
  if (!COMPOSIO_API_KEY) return [];
  
  try {
    const { Composio } = await import('composio-core');
    const client = new Composio({ apiKey: COMPOSIO_API_KEY });
    
    const apps = await (client as any).apps.list({});
    const tools = [];
    
    for (const app of apps.slice(0, 5)) {
      try {
        const actions = await (client as any).actions.list({ appId: app.name });
        if (actions && actions.length > 0) {
          tools.push(...actions.slice(0, 3).map((a: any) => ({
            name: a.name,
            description: a.description || `Use ${app.name} ${a.name}`,
            app: app.name,
          })));
        }
      } catch {}
    }
    
    return tools.slice(0, 20);
  } catch (error) {
    console.error('[Composio] Failed to fetch tools:', error);
    return [];
  }
}

// Execute Composio tool
async function executeTool(toolName: string, input: Record<string, unknown>) {
  if (!COMPOSIO_API_KEY) {
    return { success: false, error: 'Composio not configured' };
  }
  
  try {
    const { Composio } = await import('composio-core');
    const client = new Composio({ apiKey: COMPOSIO_API_KEY });
    
    const result = await (client as any).tools.execute({
      action: toolName,
      input,
    });
    
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const dbUser = await getOrCreateClerkUser(clerkUserId);
    const body = await request.json();
    const { input } = body;

    if (!input || typeof input !== 'string') {
      return NextResponse.json({ error: 'Missing input' }, { status: 400 });
    }

    const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const effectiveUserId = dbUser.id;

    // Check for memory commands
    const isMemoryStore = input.toLowerCase().startsWith('remember') || 
                         input.toLowerCase().startsWith('store') ||
                         input.toLowerCase().startsWith('save');
    const isMemoryRecall = input.toLowerCase().startsWith('recall') ||
                          input.toLowerCase().startsWith('what do i') ||
                          input.toLowerCase().startsWith('do you remember');

    // Handle memory storage
    if (isMemoryStore) {
      const memoryText = input.replace(/^(remember|store|save)\s+/i, '').trim();
      storeInMemory(effectiveUserId, memoryText, 'fact');
      
      return NextResponse.json({
        reply: `Got it! I've stored that in memory: "${memoryText}"`,
        taskId,
        memoryStored: true,
      });
    }

    // Handle memory recall
    if (isMemoryRecall) {
      const query = input.replace(/^(recall|what do i|do you remember)\s+/i, '').trim();
      const memories = recallInMemory(effectiveUserId, query);
      
      return NextResponse.json({
        reply: memories ? `Here's what I recall: ${memories}` : "I don't have any memories about that yet.",
        taskId,
        memoriesRecalled: true,
      });
    }

    // Get context from memories
    const memoryContext = recallInMemory(effectiveUserId, input);

    // Get Composio tools
    const composioTools = await getComposioTools();
    const toolDescriptions = composioTools.length > 0 
      ? `\n\nAvailable tools you can use:\n${composioTools.map(t => `- ${t.name}: ${t.description}`).join('\n')}`
      : '';

    // Build messages
    const systemPrompt = `You are OSAP, a helpful AI assistant with access to tools.
${memoryContext ? `Relevant memories from user:\n${memoryContext}\n` : ''}
When user asks to remember/store/save something, acknowledge and confirm.
When appropriate, use available tools to help user.
${toolDescriptions}
Respond directly and concisely.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: input },
    ];

    // Call GLM API
    const response = await fetch(GLM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'glm-5.1',
        messages,
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ error: `GLM error: ${response.status}` }, { status: 500 });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || 'No response';

    // Add task to in-memory storage
    const userTasks = inMemoryTasks.get(effectiveUserId) || [];
    userTasks.unshift({
      id: taskId,
      input,
      reply,
      status: 'success',
      toolsUsed: composioTools.length > 0 ? composioTools.map((t: any) => t.name) : [],
      createdAt: new Date(),
    });
    inMemoryTasks.set(effectiveUserId, userTasks.slice(0, 20));

    return NextResponse.json({ 
      reply, 
      taskId, 
      tasks: inMemoryTasks.get(effectiveUserId) || [],
      toolsAvailable: composioTools.length,
    });
  } catch (error) {
    console.error('[API] Chat error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  
  const tasks = userId ? (inMemoryTasks.get(userId) || []) : [];
  const memories = userId ? (inMemoryMemories.get(userId) || []) : [];
  
  return NextResponse.json({ tasks, memories });
}