import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getComposioConnectionStatus } from '@/lib/composio';
import { getOrCreateClerkUser } from '@/lib/database';

export async function GET() {
  const defaultResponse = { 
    connected: [], 
    available: ['gmail', 'github', 'slack', 'googlecalendar', 'twitter', 'notion'],
    error: 'Composio not configured'
  };

  try {
    const { userId: clerkUserId } = await auth();
    
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const internalUser = await getOrCreateClerkUser(clerkUserId);
    
    try {
      const { connected, available } = await getComposioConnectionStatus(internalUser.id);
      return NextResponse.json({ connected, available });
    } catch (sdkError) {
      console.error('[API] Composio SDK error:', sdkError);
      return NextResponse.json(defaultResponse);
    }
  } catch (error) {
    console.error('[API] Composio status error:', error);
    // Even on auth/internal user error, return 200 with default to avoid crashing UI
    return NextResponse.json(defaultResponse);
  }
}
