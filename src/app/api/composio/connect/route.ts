import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getComposioAuthUrl, disconnectComposioApp } from '@/lib/composio';
import { getOrCreateClerkUser } from '@/lib/database';

export async function GET(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const toolkit = searchParams.get('toolkit');

    if (!toolkit) {
      return NextResponse.json({ error: 'Missing toolkit parameter' }, { status: 400 });
    }

    const internalUser = await getOrCreateClerkUser(clerkUserId);
    const { authUrl, error } = await getComposioAuthUrl(internalUser.id, toolkit);

    if (error || !authUrl) {
      return NextResponse.json({ error: error || 'Failed to get auth URL' }, { status: 500 });
    }

    return NextResponse.json({ authUrl });
  } catch (error) {
    console.error('[API] Composio connect error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to connect' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const toolkit = searchParams.get('toolkit');

    if (!toolkit) {
      return NextResponse.json({ error: 'Missing toolkit parameter' }, { status: 400 });
    }

    const internalUser = await getOrCreateClerkUser(clerkUserId);
    const { success, error } = await disconnectComposioApp(internalUser.id, toolkit);

    if (!success) {
      return NextResponse.json({ error: error || 'Failed to disconnect' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Composio disconnect error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to disconnect' },
      { status: 500 }
    );
  }
}
