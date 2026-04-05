import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateClerkUser, getTasks } from '@/lib/database';
import { createAndExecuteTask } from '@/lib/executor-enhanced';

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { input } = await request.json();
    
    if (!input?.trim()) {
      return NextResponse.json({ error: 'Input required' }, { status: 400 });
    }

    const internalUser = await getOrCreateClerkUser(clerkUserId);
    const result = await createAndExecuteTask(input, internalUser.id);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('[API] Task creation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Task creation failed' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const internalUser = await getOrCreateClerkUser(clerkUserId);
    const tasks = await getTasks(internalUser.id);
    
    return NextResponse.json({ tasks });
  } catch (error) {
    console.error('[API] Tasks fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch tasks' },
      { status: 500 }
    );
  }
}
