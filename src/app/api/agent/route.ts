import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getAgentOrchestrator } from '@/lib/agent/orchestrator';
import { getBackgroundTaskManager } from '@/lib/agent/background-tasks';
import { getOrCreateClerkUser } from '@/lib/database';
import { executeTool } from '@/lib/tools-enhanced';
import { executeComposioToolCall } from '@/lib/composio';
import { formatStepResult, summarizeForMemory } from '@/lib/executor-enhanced';
import { DEFAULT_POLICY } from '@/lib/tool-categories';
import { storeMemory as hydraStoreMemory } from '@/lib/hydra';
import { createMemoryNode } from '@/lib/database';

const BUILT_IN_TOOLS = [
  'memory_store', 
  'memory_recall', 
  'http_request', 
  'github_create_issue', 
  'github_get_issues', 
  'email_send', 
  'twitter_post', 
  'composio_search_tools', 
  'composio_execute_tool'
];

export async function GET(request: NextRequest) {
  const { userId: clerkUserId } = await auth();
    
  if (!clerkUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  if (type === 'tasks') {
    return NextResponse.json({
      tasks: getBackgroundTaskManager().getAllTasks(),
      metrics: getBackgroundTaskManager().getMetrics(),
    });
  }

  const agentId = searchParams.get('agentId');

  if (agentId) {
    const orchestrator = getAgentOrchestrator();
    const agent = orchestrator.getAgent(agentId);
    if (!agent) {
      return NextResponse.json({ 
        status: 'idle',
        thoughts: [],
        metrics: {
          totalExecutions: 0,
          successfulExecutions: 0,
          failedExecutions: 0,
          averageExecutionTimeMs: 0,
          totalTokensUsed: 0,
          selfCorrections: 0,
          learnedStrategies: 0,
        },
        plan: null,
        error: 'Agent session expired or not found'
      }, { status: 200 });
    }
    return NextResponse.json({ agent });
  }

  return NextResponse.json({
    agents: getAgentOrchestrator().getAllAgents(),
  });
}

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getOrCreateClerkUser(clerkUserId);
    const body = await request.json();
    const { action, agentId, task } = body;

    const orchestrator = getAgentOrchestrator();
    const taskManager = getBackgroundTaskManager();

    if (action === 'create') {
      const agent = orchestrator.createAgent({
        name: 'OSAP Autonomous Agent',
        capabilities: ['reasoning', 'planning', 'execution', 'learning', 'self-correction'],
        selfCorrect: true,
        learnFromMistakes: true,
      });

      return NextResponse.json({ agent });
    }

    if (action === 'execute' && agentId && task) {
      const agent = orchestrator.getAgent(agentId);
      if (!agent) {
        return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
      }

      orchestrator.setStatus(agentId, 'planning');

      const bgTask = taskManager.createTask({
        name: task.substring(0, 50),
        description: task,
        agentId,
        onComplete: () => {
          orchestrator.updateMetrics(agentId, {
            totalExecutions: agent.metrics.totalExecutions + 1,
            successfulExecutions: agent.metrics.successfulExecutions + 1,
          });
        },
        onError: () => {
          orchestrator.updateMetrics(agentId, {
            totalExecutions: agent.metrics.totalExecutions + 1,
            failedExecutions: agent.metrics.failedExecutions + 1,
          });
        },
      });

      const context = {
        userId: clerkUserId, // Use clerkUserId or internal user.id
        sessionId: `session_${Date.now()}`,
        input: task,
        context: {},
      };

      const plan = await orchestrator.plan(agentId, context);

      if (plan.status === 'failed') {
        orchestrator.setStatus(agentId, 'failed');
        return NextResponse.json({
          agent: orchestrator.getAgent(agentId),
          plan,
          error: 'Planning failed',
        });
      }

      orchestrator.setStatus(agentId, 'executing');

      taskManager.execute(bgTask.id, async (t, update) => {
        update(0, 'Starting execution...');
        const results = [];
        
        for (const step of plan.steps) {
          const progress = (plan.steps.indexOf(step) / plan.steps.length) * 100;
          update(progress, `Executing ${step.action}...`);

          const result = await orchestrator.executeStep(agentId, step.id, async () => {
            if (BUILT_IN_TOOLS.includes(step.action)) {
              return await executeTool(step.action, step.input, user.id, DEFAULT_POLICY);
            } else {
              return await executeComposioToolCall(user.id, {
                name: step.action,
                parameters: step.input,
              });
            }
          });

          if (!result.success) {
            update(progress, `Step failed: ${result.error}. Attempting self-correction...`);
            
            const correction = await orchestrator.correct(agentId, step.id, async (fs, err) => {
              const type = fs.retryCount < fs.maxRetries ? 'retry' : 'abort';
              return {
                type,
                reason: err,
                success: type === 'retry',
              };
            });

            if (correction.type === 'retry') {
              step.retryCount++;
              continue; 
            } else {
              orchestrator.setStatus(agentId, 'failed');
              throw new Error(`Execution failed at step ${step.action}: ${result.error}`);
            }
          }

          results.push({ step: step.action, output: result.output });
          const formatted = formatStepResult(step.action, result.output);
          update(progress + (5 / plan.steps.length), `Think: ${formatted.substring(0, 50)}...`);
          await orchestrator.think(agentId, context, `Completed ${step.action}: ${formatted.substring(0, 100)}`);
        }

        update(100, 'Saving memories and finalizing...');
        const memoryText = summarizeForMemory(task, results);
        try {
          await hydraStoreMemory(memoryText, { userId: user.id || clerkUserId, taskId: bgTask.id });
        } catch (e) {
          console.warn('[AgentRoute] HydraDB store failed, falling back to Supabase');
          await createMemoryNode({
            user_id: user.id || clerkUserId,
            type: 'task_summary',
            content: memoryText,
            source: 'autonomous_agent',
            importance: 0.8,
            metadata: {},
          });
        }

        orchestrator.setStatus(agentId, 'completed');
        return { success: true, summary: memoryText };
      });

      return NextResponse.json({
        agent: orchestrator.getAgent(agentId),
        plan,
        task: taskManager.getTask(bgTask.id),
      });
    }

    if (action === 'pause' && agentId) {
      getAgentOrchestrator().pause(agentId);
      return NextResponse.json({ agent: getAgentOrchestrator().getAgent(agentId) });
    }

    if (action === 'resume' && agentId) {
      getAgentOrchestrator().resume(agentId);
      return NextResponse.json({ agent: getAgentOrchestrator().getAgent(agentId) });
    }

    if (action === 'abort' && agentId) {
      getAgentOrchestrator().abort(agentId);
      return NextResponse.json({ agent: getAgentOrchestrator().getAgent(agentId) });
    }

    // Reset move to top level or stay here, keeping it here is fine.
    if (action === 'reset' && agentId) {
      const orchestrator = getAgentOrchestrator();
      orchestrator.clearPlan(agentId);
      orchestrator.clearThoughts(agentId);
      orchestrator.setStatus(agentId, 'idle');
      return NextResponse.json({ agent: orchestrator.getAgent(agentId) });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('[API/Agent] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Agent operation failed' },
      { status: 500 }
    );
  }
}
