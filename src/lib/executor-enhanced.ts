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
import { executeComposioToolCall } from './composio';

initializeTools();

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
  console.log('[Executor] Starting task:', input, 'for user:', internalUserId);
  
  const title = input.substring(0, 100) + (input.length > 100 ? '...' : '');

  try {
    const task = await createTask(internalUserId, input, title);
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

    const planResult = await generatePlan(input, memoryContext);
    
    if ('error' in planResult) {
      await updateTask(task.id, { status: 'failed', error: planResult.error });
      return { taskId: task.id, status: 'failed', error: planResult.error };
    }
    
    const plan = planResult.plan;
    console.log('[Executor] GLM plan:', JSON.stringify(plan, null, 2));
    
    await updateTask(task.id, { plan, status: 'running' });

    const stepResults = [];
    let hasFailure = false;
    const BUILT_IN_TOOLS = ['memory_store', 'memory_recall', 'http_request', 'github_create_issue', 'github_get_issues', 'email_send', 'twitter_post', 'composio_search_tools', 'composio_execute_tool'];

    function formatStepResult(tool: string, result: any): string {
      if (!result) return 'Completed';
      
      // Composio often wraps the actual API response in a 'data' field
      // We unwrap it here so tool-specific logic can access fields directly
      const data = (result && typeof result === 'object' && 'data' in result && result.data) 
        ? result.data 
        : result;

      // Gmail Fetch / List
      if (tool.includes('GMAIL_FETCH') || tool.includes('GMAIL_LIST')) {
        const messages = data.messages || (Array.isArray(data) ? data : []);
        if (messages.length === 0) return 'No emails found.';
        let summary = `Found ${messages.length} email${messages.length > 1 ? 's' : ''}:\n`;
        messages.forEach((msg: any, i: number) => {
          const from = msg.sender || msg.from || 'Unknown';
          const subject = msg.subject || '(No Subject)';
          const date = msg.date || 'Recently';
          summary += `${i + 1}. From: ${from} | Subject: ${subject} | ${date}\n`;
        });
        return summary.trim();
      }

      // Gmail Send / Draft
      if (tool.includes('GMAIL_SEND') || tool.includes('GMAIL_CREATE_EMAIL_DRAFT')) {
        const id = data.id || data.messageId || 'Unknown';
        const labels = data.labelIds ? data.labelIds.join(', ') : 'SENT';
        return `✓ Email sent successfully\nMessage ID: ${id}\nLabels: ${labels}`;
      }

      // Gmail Get by ID
      if (tool.includes('GMAIL_GET_EMAIL_BY_ID')) {
        const subject = data.subject || '(No Subject)';
        const from = data.sender || data.from || 'Unknown';
        const body = data.messageText || data.snippet || '';
        return `Subject: ${subject}\nFrom: ${from}\n---\n${body.substring(0, 200)}${body.length > 200 ? '...' : ''}`;
      }

      // GitHub Create Issue
      if (tool === 'github_create_issue' || tool.includes('GITHUB_CREATE_ISSUE')) {
        const number = data.number || data.id;
        const url = data.html_url || data.url;
        return `✓ Issue #${number} created: ${data.title} — ${url}`;
      }

      // GitHub List Issues
      if (tool === 'github_get_issues' || tool.includes('GITHUB_LIST_ISSUES')) {
        const issues = Array.isArray(data) ? data : data.issues || [];
        if (issues.length === 0) return 'No issues found.';
        let summary = `Found ${issues.length} issues:\n`;
        issues.forEach((issue: any, i: number) => {
          summary += `${i + 1}. #${issue.number} ${issue.title} [${issue.state}]\n`;
        });
        return summary.trim();
      }

      // Memory Store
      if (tool === 'memory_store') {
        const content = data.content || (typeof data === 'string' ? data : 'data');
        return `✓ Stored in memory: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`;
      }

      // Memory Recall
      if (tool === 'memory_recall') {
        const content = data.content || (Array.isArray(data) ? data.map((m: any) => m.content).join('\n') : String(data));
        return content;
      }

      // Default fallback
      if (typeof data === 'object' && data !== null) {
        return 'Completed successfully';
      }
      return String(data);
    }

    function summarizeForMemory(taskInput: string, result: any): string {
      if (!result) return `Task completed: ${taskInput.substring(0, 100)}`;
      
      const data = (result && typeof result === 'object' && 'data' in result && result.data) 
        ? result.data 
        : result;

      // Base64 / Garbage Detection
      const isGarbage = (text: string) => {
        if (!text || typeof text !== 'string') return false;
        // Check for long strings without spaces or with high non-alpha ratio
        const words = text.split(/\s+/);
        const hasLongWord = words.some(w => w.length > 50);
        const nonAlphaRatio = (text.match(/[^a-zA-Z0-9\s,.!?-]/g) || []).length / text.length;
        return hasLongWord || nonAlphaRatio > 0.4;
      };

      // Gmail Fetch
      if (data.messages && Array.isArray(data.messages)) {
        const count = data.messages.length;
        const recent = data.messages[0];
        const from = recent?.sender || recent?.from || 'Unknown';
        const subject = recent?.subject || '(No Subject)';
        return `Fetched ${count} email${count > 1 ? 's' : ''}. Most recent from ${from} about "${subject}".`;
      }

      // Gmail Send
      if (data.id || data.messageId) {
        if (taskInput.toLowerCase().includes('send') || taskInput.toLowerCase().includes('email')) {
          const toMatch = taskInput.match(/to\s+([^\s,]+)/i);
          const to = toMatch ? toMatch[1] : 'recipient';
          return `Sent email to ${to}${data.subject ? ` with subject "${data.subject}"` : ''}.`;
        }
      }

      // GitHub
      if (data.number && (data.html_url || data.url)) {
        return `Created GitHub issue #${data.number}: "${data.title || 'Untitled'}"`;
      }

      // Fallback for simple answers
      if (typeof data === 'string' && !isGarbage(data)) {
        return `Question: ${taskInput}. Answer: ${data}`;
      }

      const summary = `Task completed: ${taskInput.substring(0, 100)}${taskInput.length > 100 ? '...' : ''}`;
      return summary;
    }

    function normalizeStepResult(result: unknown): string {
      if (!result) return '';
      if (typeof result === 'string') return result;
      if (typeof result === 'object' && result !== null) {
        const obj = result as Record<string, unknown>;
        return String(obj.answer || obj.message || obj.text || JSON.stringify(result));
      }
      return String(result);
    }

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
          const composioResult = await executeComposioToolCall(internalUserId, {
            name: step.tool,
            parameters: step.input || {},
          });
          result = {
            success: composioResult.success,
            data: composioResult.data,
            error: composioResult.error,
          };
        }
        
        if (result.success) {
          const formatted = formatStepResult(step.tool, result.data);
          await updateTaskStep(stepRecord.id, { 
            status: 'success', 
            tool_output: result.data,
            // Note: We don't have a column for formatted, so we'll store it in the JSON if needed,
            // but for now we'll just use it in the in-memory results array
          });
          stepResults.push({ step, result: result.data, formatted, status: 'success' });
        } else {
          await updateTaskStep(stepRecord.id, { 
            status: 'failed', 
            error: result.error,
          });
          stepResults.push({ step, error: result.error, status: 'failed' });
          hasFailure = true;
        }
      } catch (stepError) {
        const errorMsg = stepError instanceof Error ? stepError.message : String(stepError);
        await updateTaskStep(stepRecord.id, { status: 'failed', error: errorMsg });
        stepResults.push({ step, error: errorMsg, status: 'failed' });
        hasFailure = true;
      }
    }

    console.log('[Executor] Step results:', JSON.stringify(stepResults, null, 2));

    // Build final result with answer and summary
    const directAnswer = plan.answer || null;
    const stepOutputs = stepResults
      .filter(s => s.status === 'success' && s.result)
      .map(s => normalizeStepResult(s.result))
      .filter(Boolean);

    const finalAnswer = directAnswer || stepOutputs[0] || null;
    
    const finalResult = {
      answer: finalAnswer,
      formatted_answer: stepResults.length > 0 ? stepResults[stepResults.length - 1].formatted : null,
      summary: finalAnswer
        ? String(finalAnswer).substring(0, 100)
        : `Completed ${stepResults.length} steps`,
      steps: stepResults,
    };

    console.log('[Executor] Final result:', JSON.stringify(finalResult, null, 2));

    const finalStatus = hasFailure ? 'failed' : 'success';
    await updateTask(task.id, { status: finalStatus, result: finalResult });

    // Step 6: Store in memory — try HydraDB first, fall back to Supabase
    const memoryText = summarizeForMemory(input, finalResult.answer || finalResult);

    try {
      await hydraStoreMemory(memoryText, { userId: internalUserId, taskId: task.id });
      console.log('[Executor] Memory stored in HydraDB');
    } catch (hydraError) {
      console.warn('[Executor] HydraDB storage failed, falling back to Supabase:', hydraError);
      // Fallback: store in Supabase memory_nodes table directly
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
      } catch (supabaseError) {
        console.error('[Executor] Both memory storage methods failed:', supabaseError);
      }
    }

    return { 
      taskId: task.id, 
      status: finalStatus, 
      plan, 
      memoryUsed,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const task = await createTask(internalUserId, input, title);
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
