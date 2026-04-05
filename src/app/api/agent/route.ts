import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { AgentOrchestrator } from '@/lib/agent/orchestrator';
import { BackgroundTaskManager } from '@/lib/agent/background-tasks';
import { getOrCreateClerkUser } from '@/lib/database';

const orchestrator = new AgentOrchestrator();
const taskManager = new BackgroundTaskManager();

export async function GET(request: NextRequest) {
  const { userId: clerkUserId } = await auth();
    
  if (!clerkUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  if (type === 'tasks') {
    return NextResponse.json({
      tasks: taskManager.getAllTasks(),
      metrics: taskManager.getMetrics(),
    });
  }

  return NextResponse.json({
    agents: orchestrator.getAllAgents(),
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
        userId: user.id,
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
        
        for (const step of plan.steps) {
          update((step.order / plan.steps.length) * 100, `Executing step ${step.order}: ${step.action}`);

          const result = await orchestrator.executeStep(agentId, step.id, async () => {
            await new Promise(resolve => setTimeout(resolve, 500));
            return { success: true, output: `Executed ${step.action}` };
          });

          if (!result.success) {
            update((step.order / plan.steps.length) * 100, `Retrying step ${step.order}...`);
            
            const correction = await orchestrator.correct(agentId, step.id, async (failedStep, error) => ({
              type: failedStep.retryCount < failedStep.maxRetries ? 'retry' : 'abort',
              reason: error,
              originalStep: failedStep.action,
              newApproach: failedStep.action,
              success: true,
            }));

            if (correction.type === 'retry') {
              await orchestrator.executeStep(agentId, step.id, async () => {
                await new Promise(resolve => setTimeout(resolve, 500));
                return { success: true, output: `Retried ${step.action}` };
              });
            } else {
              throw new Error(`Step ${step.id} failed: ${result.error}`);
            }
          }
        }

        update(100, 'Execution complete');
        orchestrator.setStatus(agentId, 'completed');
        
        return { success: true, planId: plan.id };
      });

      return NextResponse.json({
        agent: orchestrator.getAgent(agentId),
        plan,
        task: taskManager.getTask(bgTask.id),
      });
    }

    if (action === 'pause' && agentId) {
      orchestrator.pause(agentId);
      return NextResponse.json({ agent: orchestrator.getAgent(agentId) });
    }

    if (action === 'resume' && agentId) {
      orchestrator.resume(agentId);
      return NextResponse.json({ agent: orchestrator.getAgent(agentId) });
    }

    if (action === 'abort' && agentId) {
      orchestrator.abort(agentId);
      return NextResponse.json({ agent: orchestrator.getAgent(agentId) });
    }

    if (action === 'reset' && agentId) {
      orchestrator.clearPlan(agentId);
      orchestrator.clearThoughts(agentId);
      orchestrator.setStatus(agentId, 'idle');
      return NextResponse.json({ agent: orchestrator.getAgent(agentId) });
    }

    if (action === 'reasoning' && agentId) {
      const reasoning = orchestrator.getReasoning(agentId);
      return NextResponse.json(reasoning);
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
