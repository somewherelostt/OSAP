import type { TaskPlan, PlanStep } from '@/types/database';

const GLM_API_URL = process.env.GLM_API_URL || 'https://api.z.ai/api/coding/paas/v4/chat/completions';
const GLM_API_KEY = process.env.GLM_API_KEY;

interface GLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GLMResponse {
  id: string;
  choices: {
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface GeneratePlanInput {
  userInput: string;
  userContext?: {
    recentTasks?: string[];
    preferences?: string[];
    facts?: string[];
  };
  memoryContext?: string;
  availableTools?: string[];
}

export interface GeneratePlanOutput {
  plan: TaskPlan;
  reasoning: string;
  error?: never;
}

export interface GLMError {
  error: string;
  plan?: never;
  reasoning?: never;
}

export async function generatePlan(
  input: string,
  memoryContext: string = ''
): Promise<{ plan: TaskPlan; reasoning: string } | { error: string }> {
  if (!GLM_API_KEY) {
    return { error: 'GLM_API_KEY not configured' };
  }

  const systemPrompt = `You are a task planning AI. Generate a JSON execution plan for the given task.
Return ONLY valid JSON, no markdown fences, no explanation.

Format:
{
  "goal": "string describing the overall goal",
  "answer": "direct answer if this is a simple question, otherwise null",
  "steps": [
    {
      "id": "step_1",
      "order": 1,
      "tool": "tool_name",
      "input": { "param": "value" },
      "description": "what this step does",
      "depends_on": []
    }
  ]
}

Built-in tools (use these directly, no auth needed):
- memory_store: { content: string } — store something in memory
- memory_recall: { query: string } — search memory
- http_request: { url: string, method: string, body?: object } — make HTTP request

Composio tools (use these for external services, requires user auth):
- GMAIL_FETCH_EMAILS: { max_results: number, query?: string } — fetch emails from Gmail
- GMAIL_SEND_EMAIL: { to: string, subject: string, body: string } — send email
- GMAIL_GET_EMAIL_BY_ID: { message_id: string } — get specific email
- GITHUB_CREATE_ISSUE: { owner: string, repo: string, title: string, body?: string }
- GITHUB_LIST_ISSUES: { owner: string, repo: string, state?: string }
- GITHUB_GET_PULL_REQUESTS: { owner: string, repo: string }
- SLACK_SEND_MESSAGE: { channel: string, text: string }
- TWITTER_CREATE_TWEET: { text: string }
- GOOGLECALENDAR_LIST_EVENTS: { max_results?: number }
- GOOGLECALENDAR_CREATE_EVENT: { summary: string, start: string, end: string }

For tasks involving email, calendar, GitHub, Slack, Twitter — use Composio tools.
For simple questions — answer directly in the "answer" field with no steps or a single memory_store step.`;

  const userInput = input;
  const userContext = '';
  const memorySection = memoryContext
    ? `\n\nRelevant memories from past interactions:\n${memoryContext}`
    : '';

  const messages: GLMMessage[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `Break down this request into steps:\n\n"${userInput}"${userContext}${memorySection}`,
    },
  ];

  try {
    console.log('[GLM] Calling API with model glm-5.1 at:', GLM_API_URL);
    const response = await fetch(GLM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'glm-5.1',
        messages,
        temperature: 0.3,
        max_tokens: 2048,
      }),
    });

    console.log('[GLM] Response status:', response.status);
    if (!response.ok) {
      const errorText = await response.text();
      return { error: `GLM API error: ${response.status} - ${errorText}` };
    }

    const data: GLMResponse = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      return { error: 'No response from GLM' };
    }

    // Parse the JSON response
    let parsed;
    try {
      // Try to extract JSON from markdown if present
      const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || content.match(/(\{[\s\S]*\})/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;
      parsed = JSON.parse(jsonStr);
    } catch {
      return { error: `Failed to parse GLM response: ${content.substring(0, 200)}` };
    }

    // Validate the plan structure - new format has top-level steps
    if (!parsed.steps || !Array.isArray(parsed.steps)) {
      return { error: `Invalid plan structure: ${JSON.stringify(parsed).substring(0, 200)}` };
    }

    // Ensure all required fields are present
    const validatedSteps: PlanStep[] = parsed.steps.map((step: PlanStep, index: number) => {
      const stepAny = step as unknown as Record<string, unknown>;
      return {
        id: step.id || `step_${index + 1}`,
        order: step.order || index + 1,
        tool: step.tool,
        input: stepAny.params as Record<string, unknown> || step.input || {},
        description: step.description || '',
        depends_on: step.depends_on || [],
      };
    });

    return {
      plan: { 
        goal: parsed.goal || userInput, 
        answer: parsed.answer || null,
        steps: validatedSteps 
      },
      reasoning: parsed.reasoning || 'Plan generated successfully',
    };
  } catch (error) {
    return {
      error: `GLM request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

export interface AnalyzeInputInput {
  userInput: string;
}

export interface AnalyzeIntentOutput {
  intent: 'task_create' | 'task_query' | 'memory_store' | 'memory_recall' | 'composio_tool' | 'unknown';
  entities: Record<string, string>;
  confidence: number;
}

export async function analyzeIntent(
  input: AnalyzeInputInput
): Promise<AnalyzeIntentOutput | GLMError> {
  if (!GLM_API_KEY) {
    return { error: 'GLM_API_KEY not configured' };
  }

  const systemPrompt = `Analyze user input and determine their intent. Output JSON:
{
  "intent": "task_create|task_query|memory_store|memory_recall|composio_tool|unknown",
  "entities": {"key": "value"},
  "confidence": 0.0-1.0
}

Intents:
- task_create: User wants to create/execute a task
- task_query: User is asking about tasks
- memory_store: User wants to store information
- memory_recall: User wants to recall stored information
- composio_tool: User wants to use an external service (Gmail, GitHub, Slack, Twitter, Google Calendar, etc.)
- unknown: Cannot determine intent`;

  try {
    const response = await fetch(GLM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'glm-5.1',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: input.userInput },
        ],
        temperature: 0.1,
        max_tokens: 512,
      }),
    });

    if (!response.ok) {
      return { error: `GLM API error: ${response.status}` };
    }

    const data: GLMResponse = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      return { error: 'No response from GLM' };
    }

    const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || content.match(/(\{[\s\S]*\})/);
    const jsonStr = jsonMatch ? jsonMatch[1] : content;
    const parsed = JSON.parse(jsonStr);

    return {
      intent: parsed.intent || 'unknown',
      entities: parsed.entities || {},
      confidence: parsed.confidence || 0,
    };
  } catch (error) {
    return {
      error: `Intent analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

export async function testGlmConnection(): Promise<{ success: boolean; error?: string }> {
  if (!GLM_API_KEY) {
    return { success: false, error: 'GLM_API_KEY not configured' };
  }

  try {
    const response = await fetch(GLM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'glm-5.1',
        messages: [
          { role: 'user', content: 'Say "OK" if you can hear me.' },
        ],
        max_tokens: 10,
      }),
    });

    if (!response.ok) {
      return { success: false, error: `GLM API error: ${response.status}` };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
