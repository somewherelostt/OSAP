import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateClerkUser, createTask } from '@/lib/database';
import { analyzeIntent, generatePlan } from '@/lib/glm';
import { executeTask } from '@/lib/executor-enhanced';
import { storeMemory, recallMemories } from '@/lib/hydra';

export async function POST(req: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { message, conversationId = 'default' } = await req.json();
    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const internalUser = await getOrCreateClerkUser(clerkUserId);
    
    // 1. Analyze Intent
    let analysis: any = await analyzeIntent({ userInput: message });
    if ('error' in analysis) {
      console.warn('[ChatAPI] Failed to analyze intent, falling back to task_create:', analysis.error);
      analysis = { intent: 'unknown', confidence: 0, entities: {} };
    }

    console.log('[ChatAPI] Intent analyzed:', analysis.intent);

    // 2. Handle Intent
    
    // Case 1: Memory Operations
    if (analysis.intent === 'memory_store') {
      const memoryText = message.replace(/^(remember|store|save)\s+/i, '').trim();
      const result = await storeMemory(memoryText, { userId: internalUser.id });
      return NextResponse.json({ 
        type: 'memory', 
        content: result.success ? `I've remembered that for you: "${memoryText}"` : "I had trouble storing that in memory." 
      });
    }

    if (analysis.intent === 'memory_recall') {
      const query = message.replace(/^(recall|what do i|do you remember)\s+/i, '').trim();
      const recallResult = await recallMemories(query, { userId: internalUser.id, maxResults: 5 });
      const context = recallResult?.chunks.map(c => c.chunk_content).join('\n') || '';
      
      const { currentUser } = await import('@clerk/nextjs/server');
      const clerkUser = await currentUser();
      
      const userFacts = `
        Full Name: ${clerkUser?.firstName} ${clerkUser?.lastName}
        Email: ${clerkUser?.emailAddresses[0]?.emailAddress}
        Clerk ID: ${clerkUserId}
      `.split('\n').map(l => l.trim()).join('\n');

      const synthesized = await import('@/lib/glm').then(m => 
        m.generateSynthesizedResponse(message, context, userFacts)
      );

      return NextResponse.json({ 
        type: 'memory', 
        content: synthesized 
      });
    }

    // Case 2: Simple Questions or Unknown (treated as general chat)
    if (analysis.intent === 'task_query' || analysis.intent === 'unknown') {
      // For simple questions, we might still want to check if GLM can answer directly
      const planResult = await generatePlan(message);
      if (!('error' in planResult) && planResult.plan.answer) {
        return NextResponse.json({ 
          type: 'answer', 
          content: planResult.plan.answer,
          taskId: null
        });
      }
      // If no direct answer, maybe it's a task after all
    }

    // Case 3: Task Execution / Composio Tools
    // Fallback or explicit task/tool intents
    const title = message.substring(0, 50) + (message.length > 50 ? '...' : '');
    const task = await createTask(internalUser.id, message, title);
    
    // Background execution
    // We don't await this, but we should make sure it doesn't get killed
    // In Next.js, this is tricky, but for now we'll fire and forget
    // A better way is using a separate worker or a more robust queue
    (async () => {
      try {
        await executeTask(task);
      } catch (e) {
        console.error('[ChatAPI] Background execution failed:', e);
      }
    })();

    return NextResponse.json({ 
      type: 'task_started', 
      taskId: task.id, 
      content: "I'm working on that for you...",
    });

  } catch (error) {
    console.error('[ChatAPI] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
