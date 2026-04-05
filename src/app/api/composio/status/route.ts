import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getComposioConnectionStatus } from '@/lib/composio';
import { getOrCreateClerkUser } from '@/lib/database';

export async function GET() {
  try {
    const { userId: clerkUserId } = await auth();
    
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const internalUser = await getOrCreateClerkUser(clerkUserId);
    const { connected, available } = await getComposioConnectionStatus(internalUser.id);

    return NextResponse.json({ connected, available });
  } catch (error) {
    console.error('[API] Composio status error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get status' },
      { status: 500 }
    );
  }
}
