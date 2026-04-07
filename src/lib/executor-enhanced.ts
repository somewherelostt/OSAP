import {
  createTask,
  updateTask,
  getTask,
  createTaskStep,
  updateTaskStep,
  getTaskSteps,
  logExecution,
  createMemoryNode,
} from './database';
import { generatePlan } from './glm';
import {
  executeTool,
  initializeTools,
  getRegisteredTools,
  type ToolResult,
  type CapabilityPolicy,
} from './tools-enhanced';
import { DEFAULT_POLICY, getToolCategory } from './tool-categories';
import type { TaskPlan, PlanStep, DbTask, DbTaskStep } from '@/types/database';
import {
  getContextForTaskWithKnowledge,
  storeMemory as hydraStoreMemory,
  recallMemories,
  storeKnowledge as hydraStoreKnowledge,
  recallKnowledge,
  isHydraConfigured,
} from './hydra';
import { executeComposioToolCall, searchTools } from './composio/index';

initializeTools();

export function formatStepResult(tool: string, result: any): string {
  if (!result) return 'Completed';
  
  const toolUpper = tool.toUpperCase();
  const data = (result && typeof result === 'object' && 'data' in result && result.data) 
    ? result.data 
    : result;

  const toolLower = tool.toLowerCase();
  if (toolLower.includes('gmail_fetch') || toolLower.includes('gmail_list')) {
    const messages = data.messages || (Array.isArray(data) ? data : []);
    if (messages.length === 0) return 'No emails found.';
    
    // Check if we actually have subject/from data or just IDs
    const hasDetails = messages.some((m: any) => m.from || m.sender || m.subject);
    
    if (!hasDetails) {
      return `Found ${messages.length} email(s) (IDs only). Still need to fetch full details for these messages.`;
    }

    let summary = `Found ${messages.length} email${messages.length > 1 ? 's' : ''}:\n`;
    messages.forEach((msg: any, i: number) => {
      const from = msg.sender || msg.from || 'Unknown';
      const subject = msg.subject || '(No Subject)';
      const date = msg.date || 'Recently';
      summary += `${i + 1}. From: ${from} | Subject: ${subject} | ${date}\n`;
    });
    return summary.trim();
  }

  if (toolUpper.includes('GMAIL_SEND') || toolUpper.includes('GMAIL_CREATE_EMAIL_DRAFT')) {
    const id = data.id || data.messageId || 'Unknown';
    const labels = data.labelIds ? data.labelIds.join(', ') : 'SENT';
    return `✓ Email sent successfully\nMessage ID: ${id}\nLabels: ${labels}`;
  }

  if (toolUpper.includes('GMAIL_GET_EMAIL_BY_ID') || toolUpper.includes('GMAIL_GET_MESSAGE')) {
    const subject = data.subject || '(No Subject)';
    const from = data.sender || data.from || 'Unknown';
    const body = data.messageText || data.snippet || data.body || '';
    return `Subject: ${subject}\nFrom: ${from}\n---\n${body.substring(0, 200)}${body.length > 200 ? '...' : ''}`;
  }

  if (toolUpper === 'GITHUB_CREATE_ISSUE' || toolUpper.includes('GITHUB_CREATE_ISSUE')) {
    const number = data.number || data.id;
    const url = data.html_url || data.url;
    const title = data.title || 'Untitled';
    return `✓ Issue #${number} created: ${title} — ${url}`;
  }

  if (toolUpper === 'GITHUB_GET_ISSUES' || toolUpper.includes('GITHUB_LIST_ISSUES')) {
    const issues = Array.isArray(data) ? data : data.issues || [];
    if (issues.length === 0) return 'No issues found.';
    let summary = `Found ${issues.length} issue${issues.length > 1 ? 's' : ''}:\n`;
    issues.forEach((issue: any, i: number) => {
      summary += `${i + 1}. #${issue.number} ${issue.title} [${issue.state}]\n`;
    });
    return summary.trim();
  }

  if (tool === 'memory_store') {
    const content = data.content || (typeof data === 'string' ? data : 'data');
    return `✓ Stored in memory: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`;
  }

  if (tool === 'memory_recall') {
    if (data.results && Array.isArray(data.results) && data.results.length > 0) {
      return data.results.map((m: any) => m.content || JSON.stringify(m)).join('\n\n');
    }
    if (data.content) return data.content;
    if (Array.isArray(data)) return data.map((m: any) => m.content || JSON.stringify(m)).join('\n\n');
    return 'No memories found';
  }

  if (toolUpper === 'HTTP_REQUEST') {
    const body = data?.data || data?.body || data?.response || data;
    const status = data?.status || data?.statusCode;

    // Check for GitHub auth error
    if (status === 401 || body?.message?.includes('authentication') || body?.message?.includes('Requires authentication')) {
      return '⚠️ **GitHub not connected**\n\nPlease connect your GitHub account to enable this feature.';
    }

    if (status === 403 || body?.message?.includes('Forbidden')) {
      return '⚠️ **Access denied**\n\nGitHub API access was forbidden. Check your permissions or connect your account.';
    }

    if (Array.isArray(body) && body[0]?.name && body[0]?.html_url) {
      return body.map((repo: { name: string; html_url: string; description?: string; updated_at?: string }, i: number) =>
        `${i + 1}. **${repo.name}**\n   ${repo.description || 'No description'}\n   ${repo.html_url}`
      ).join('\n\n');
    }

    if (Array.isArray(body) && body[0]?.full_name) {
      return body.map((repo: { full_name: string; description?: string; stargazers_count?: number; html_url: string }, i: number) =>
        `${i + 1}. ${repo.full_name} ${repo.stargazers_count ? `⭐ ${repo.stargazers_count}` : ''}\n   ${repo.html_url}`
      ).join('\n\n');
    }

    if (typeof body === 'string') return body;

    if (typeof body === 'object' && body !== null) {
      return JSON.stringify(body, null, 2).slice(0, 500);
    }

    return 'Request completed successfully';
  }

  if (tool === 'composio_search_tools') {
    const tools = data.tools || (Array.isArray(data) ? data : []);
    if (tools.length === 0) return 'No matching tools found.';
    let summary = `Found ${tools.length} tool${tools.length > 1 ? 's' : ''} for "${data.query || 'your query'}":\n\n`;
    tools.forEach((t: any) => {
      summary += `• **${t.name}**: ${t.description}\n`;
    });
    return summary.trim();
  }

  if (typeof data === 'object' && data !== null) {
    try {
      // For Composio/Generic tools, if it's an object with messages, return a simple count/summary
      if (data.messages && Array.isArray(data.messages)) {
        return `Found ${data.messages.length} item(s). Use specific fetch tools to see details if needed.`;
      }
      if (data.items && Array.isArray(data.items)) {
        return `Found ${data.items.length} item(s).`;
      }
      if (Object.keys(data).length === 0) return 'Completed successfully (empty result)';
      return JSON.stringify(data, null, 2).slice(0, 800);
    } catch (e) {
      return 'Completed successfully';
    }
  }
  return String(data);
}

export function summarizeForMemory(taskInput: string, result: any): string {
  if (!result) return `Task completed: ${taskInput.substring(0, 100)}`;
  
  const data = (result && typeof result === 'object' && 'data' in result && result.data) 
    ? result.data 
    : result;

  const isGarbage = (text: string) => {
    if (!text || typeof text !== 'string') return false;
    const words = text.split(/\s+/);
    const hasLongWord = words.some(w => w.length > 50);
    const nonAlphaRatio = (text.match(/[^a-zA-Z0-9\s,.!?-]/g) || []).length / text.length;
    return hasLongWord || nonAlphaRatio > 0.4;
  };

  if (data.messages && Array.isArray(data.messages)) {
    const count = data.messages.length;
    const recent = data.messages[0];
    const from = recent?.sender || recent?.from || 'Unknown';
    const subject = recent?.subject || '(No Subject)';
    return `Fetched ${count} email${count > 1 ? 's' : ''}. Most recent from ${from} about "${subject}".`;
  }

  if (data.id || data.messageId) {
    if (taskInput.toLowerCase().includes('send') || taskInput.toLowerCase().includes('email')) {
      const toMatch = taskInput.match(/to\s+([^\s,]+)/i);
      const to = toMatch ? toMatch[1] : 'recipient';
      return `Sent email to ${to}${data.subject ? ` with subject "${data.subject}"` : ''}.`;
    }
  }

  if (data.number && (data.html_url || data.url)) {
    return `Created GitHub issue #${data.number}: "${data.title || 'Untitled'}"`;
  }

  if (typeof data === 'string' && !isGarbage(data)) {
    return `Question: ${taskInput}. Answer: ${data}`;
  }

  return `Task completed: ${taskInput.substring(0, 100)}${taskInput.length > 100 ? '...' : ''}`;
}

export function normalizeStepResult(result: unknown): string {
  if (!result) return '';
  if (typeof result === 'string') return result;
  if (typeof result === 'object' && result !== null) {
    const obj = result as Record<string, unknown>;
    return String(obj.answer || obj.message || obj.text || JSON.stringify(result));
  }
  return String(result);
}

export interface ExecuteTaskInput {
  userId: string;
  userInput: string;
  userContext?: {
    recentTasks?: string[];
    preferences?: string[];
    facts?: string[];
  };
  policy?: CapabilityPolicy;
}

export interface ExecuteTaskOutput {
  taskId: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  plan?: TaskPlan;
  error?: string;
  memoryUsed?: boolean;
  knowledgeUsed?: boolean;
  contextChunks?: number;
}

export async function createAndExecuteTask(
  input: string,
  internalUserId: string
): Promise<ExecuteTaskOutput> {
  const title = input.substring(0, 100) + (input.length > 100 ? '...' : '');
  const task = await createTask(internalUserId, input, title);
  return executeTask(task);
}

export async function executeTask(
  task: DbTask
): Promise<ExecuteTaskOutput> {
  const { input, user_id: internalUserId } = task;
  console.log('[Executor] Executing task:', input, 'for user:', internalUserId);
  
  try {
    await updateTask(task.id, { status: 'running' });

    let memoryContext = '';
    let memoryUsed = false;

    if (isHydraConfigured()) {
      try {
        const { memoryContext: memCtx, knowledgeContext: knowCtx } = await getContextForTaskWithKnowledge(input, internalUserId);
        memoryContext = [memCtx, knowCtx].filter(Boolean).join('\n\n');
        memoryUsed = memoryContext.length > 0;
      } catch (e) {
        console.warn('HydraDB context fetch failed, continuing without memory:', e);
      }
    }

    console.log('[Executor] Memory context length:', memoryContext.length);

    // Resolve Clerk ID for Composio binding
    const { getClerkIdByInternalId } = await import('./database');
    const clerkUserId = (await getClerkIdByInternalId(internalUserId)) || internalUserId;
    console.log(`[Executor] Using clerkUserId: ${clerkUserId} for Composio tools`);

    const BUILT_IN_TOOLS = ['memory_store', 'memory_recall', 'http_request', 'github_create_issue', 'github_get_issues', 'email_send', 'twitter_post'];

    const MAX_ITERATIONS = 4;
    let iterations = 0;
    let executionHistory: any[] = [];
    let stepResults: any[] = [];
    let hasFailure = false;
    let finalAnswer = '';
    let finalPlan: any = null;

    while (iterations < MAX_ITERATIONS) {
      iterations++;
      console.log(`[Executor] Loop iteration ${iterations}/${MAX_ITERATIONS}`);

      const planResult = await generatePlan(input, memoryContext, executionHistory);
      
      if ('error' in planResult) {
        if (iterations === 1) {
          await updateTask(task.id, { status: 'failed', error: planResult.error });
          return { taskId: task.id, status: 'failed', error: planResult.error };
        } else {
          console.warn('[Executor] LLM Planner failed mid-loop. Breaking out of loop.');
          break;
        }
      }
      
      const plan = planResult.plan;
      finalPlan = plan;
      
      if (plan.steps.length === 0 && plan.answer) {
        finalAnswer = plan.answer;
        console.log('[Executor] Agent concluded with direct answer.');
        break;
      }

      await updateTask(task.id, { plan, status: 'running' });

      let loopHadFailure = false;

      for (const step of plan.steps) {
        const stepRecord = await createTaskStep(task.id, {
          step_order: step.order,
          tool_name: step.tool,
          tool_input: step.input || {},
          status: 'pending',
        });

        try {
          await updateTaskStep(stepRecord.id, { status: 'running' });
          
          let result: ToolResult;
          
          if (BUILT_IN_TOOLS.includes(step.tool)) {
            result = await executeTool(step.tool, step.input || {}, internalUserId, DEFAULT_POLICY);
          } else {
            // Attempt Composio call
            let composioResult = await executeComposioToolCall(clerkUserId, {
              name: step.tool,
              parameters: step.input || {},
            });

            // Retry logic
            const errorMsg = composioResult.error?.message || "";
            const errorCode = String((composioResult as any).error?.code || "");
            
            if (!composioResult.success && 
                !(composioResult as any).authRequired && 
                (errorCode === '4301' || 
                 errorMsg.includes('4301') ||
                 errorMsg.includes('not found') ||
                 errorMsg.includes('Bad Request') || 
                 errorMsg.includes('400')
                )) {
              console.log(`[Executor] Tool failed (${step.tool}), attempting semantic search fallback...`);
              const searchResults = await searchTools(step.tool.replace(/_/g, ' '), 5, clerkUserId);
              if (searchResults && searchResults.tools && searchResults.tools.length > 0) {
                const bestMatch = searchResults.tools[0].name;
                console.log(`[Executor] Found better match: ${bestMatch}. Retrying...`);
                composioResult = await executeComposioToolCall(clerkUserId, {
                  name: bestMatch,
                  parameters: step.input || {},
                });
                step.tool = bestMatch;
              }
            }

            // Check auth
            if ((composioResult as any).authRequired) {
              console.log(`[Executor] Authentication required for ${step.tool}. Halting.`);
              const authInfo = composioResult as any;
              
              const authResult = {
                type: 'REQUIRES_AUTH',
                toolkit: authInfo.toolkit,
                authUrl: authInfo.authUrl,
                message: `I need permission to access ${authInfo.toolkit.toUpperCase()}. Please click the link to connect your account.`,
                taskId: task.id
              };

              await updateTask(task.id, { 
                status: 'failed', 
                result: authResult,
                error: `Authentication required for ${authInfo.toolkit}`
              });

              await updateTaskStep(stepRecord.id, { status: 'failed', error: 'Authentication required' });

              return {
                taskId: task.id,
                status: 'failed',
                plan,
                error: 'Authentication required'
              };
            }

            result = {
              success: (composioResult as any).success,
              data: (composioResult as any).data,
              error: (composioResult as any).error?.message || (composioResult as any).error,
            };
          }
          
          if (result.success) {
            const formatted = formatStepResult(step.tool, result.data);
            await updateTaskStep(stepRecord.id, { status: 'success', tool_output: result.data });
            stepResults.push({ step, result: result.data, formatted, status: 'success', iteration: iterations });
            executionHistory.push({ tool: step.tool, result: formatted });
          } else {
            await updateTaskStep(stepRecord.id, { status: 'failed', error: result.error });
            stepResults.push({ step, error: result.error, status: 'failed', iteration: iterations });
            executionHistory.push({ tool: step.tool, error: result.error });
            hasFailure = true;
            loopHadFailure = true;
          }
        } catch (stepError) {
          const errorMsg = stepError instanceof Error ? stepError.message : String(stepError);
          await updateTaskStep(stepRecord.id, { status: 'failed', error: errorMsg });
          stepResults.push({ step, error: errorMsg, status: 'failed', iteration: iterations });
          executionHistory.push({ tool: step.tool, error: errorMsg });
          hasFailure = true;
          loopHadFailure = true;
        }
      }
      
      // If we failed all steps in this loop, break to avoid spinning endlessly
      if (loopHadFailure && plan.steps.length > 0 && stepResults.filter(s => s.iteration === iterations && s.status === 'success').length === 0) {
        console.warn(`[Executor] All steps failed in loop iteration ${iterations}. Breaking loop.`);
        break;
      }
    }

    console.log('[Executor] Step results:', JSON.stringify(stepResults, null, 2));

    let dataSteps = stepResults.filter(s =>
      s.status === 'success' &&
      s.step.tool !== 'memory_store' &&
      s.step.tool !== 'memory_recall'
    );

    if (dataSteps.some(s => s.step.tool !== 'composio_search_tools')) {
      dataSteps = dataSteps.filter(s => s.step.tool !== 'composio_search_tools');
    }

    if (finalAnswer === '' && dataSteps.length > 0) {
      // Group by the latest loop iteration to get all final results
      const maxIteration = Math.max(...dataSteps.map(s => s.iteration));
      const latestSteps = dataSteps.filter(s => s.iteration === maxIteration);
      
      finalAnswer = latestSteps
        .map(s => s.formatted || normalizeStepResult(s.result))
        .join('\n\n---\n\n');
    } else if (finalAnswer === '' && finalPlan?.answer) {
      finalAnswer = finalPlan.answer;
    }

    const formattedAnswer = finalAnswer;


    const finalResult = {
      answer: finalAnswer,
      formatted_answer: formattedAnswer,
      summary: finalAnswer
        ? String(finalAnswer).substring(0, 100)
        : `Completed ${stepResults.length} steps`,
      steps: stepResults,
    };

    console.log('[Executor] Final result:', JSON.stringify(finalResult, null, 2));

    const finalStatus = (hasFailure && stepResults.length === 0) ? 'failed' : 'success';
    await updateTask(task.id, { status: finalStatus, result: finalResult });

    const memoryText = summarizeForMemory(input, finalResult.answer || finalResult);

    try {
      await hydraStoreMemory(memoryText, { userId: internalUserId, taskId: task.id });
      console.log('[Executor] Memory stored in HydraDB');
    } catch (hydraError) {
      console.warn('[Executor] HydraDB storage failed, falling back to Supabase:', hydraError);
      try {
        await createMemoryNode({
          user_id: internalUserId,
          type: 'task_summary',
          content: memoryText,
          source: 'task_executor',
          metadata: {},
          importance: 0.7,
        });
        console.log('[Executor] Memory stored in Supabase fallback');
      } catch (supabaseError) { }
    }

    return { 
      taskId: task.id, 
      status: finalStatus, 
      plan: finalPlan, 
      memoryUsed,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await updateTask(task.id, { status: 'failed', error: errorMsg });
    return { taskId: task.id, status: 'failed', error: errorMsg };
  }
}

export async function getTaskWithSteps(
  taskId: string
): Promise<(DbTask & { steps: DbTaskStep[] }) | null> {
  const task = await getTask(taskId);
  if (!task) return null;
  const steps = await getTaskSteps(taskId);
  return { ...task, steps };
}

export async function getTaskStatus(taskId: string): Promise<{
  status: string;
  progress: { completed: number; total: number; currentStep?: string };
  results: unknown;
}> {
  const task = await getTask(taskId);
  if (!task) {
    return { status: 'not_found', progress: { completed: 0, total: 0 }, results: {} };
  }

  const steps = await getTaskSteps(taskId);
  const completed = steps.filter((s) => s.status === 'success' || s.status === 'failed').length;
  const currentStep = steps.find((s) => s.status === 'running');

  return {
    status: task.status,
    progress: {
      completed,
      total: steps.length,
      currentStep: currentStep?.tool_name,
    },
    results: task.result || {},
  };
}

export function classifyQuery(input: string): { complexity: 'simple' | 'medium' | 'complex'; needsTools: boolean } {
  const lower = input.toLowerCase();
  const simplePatterns = ['what is', 'who is', 'when did', 'where is', 'show me', 'list', 'find', 'search', 'remember', 'recall', 'what do i'];
  const complexPatterns = ['create and', 'set up and', 'build and', 'analyze and', 'post to', 'send email to', 'create issue'];
  
  const isSimple = simplePatterns.some(p => lower.includes(p));
  const isComplex = complexPatterns.some(p => lower.includes(p));
  
  return {
    complexity: isComplex ? 'complex' : isSimple ? 'simple' : 'medium',
    needsTools: !isSimple,
  };
}
