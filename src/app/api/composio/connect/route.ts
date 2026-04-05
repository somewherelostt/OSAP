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
    
    try {
      const { authUrl, error } = await getComposioAuthUrl(internalUser.id, toolkit);
      if (error || !authUrl) {
        return NextResponse.json({ 
          authUrl: null, 
          error: error || 'Composio not configured — add COMPOSIO_API_KEY to .env' 
        });
      }
      return NextResponse.json({ authUrl });
    } catch (sdkError) {
      console.error('[API] Composio SDK error:', sdkError);
      return NextResponse.json({ 
        authUrl: null, 
        error: 'Composio not configured — add COMPOSIO_API_KEY to .env' 
      });
    }
  } catch (error) {
    console.error('[API] Composio connect error:', error);
    return NextResponse.json({ 
      authUrl: null, 
      error: 'Failed to initiate connection' 
    });
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
    
    try {
      const { success, error } = await disconnectComposioApp(internalUser.id, toolkit);
      if (!success) {
        return NextResponse.json({ error: error || 'Failed to disconnect toolkit' });
      }
      return NextResponse.json({ success: true });
    } catch (sdkError) {
      console.error('[API] Composio SDK disconnect error:', sdkError);
      return NextResponse.json({ success: false, error: 'Composio disconnection failed' });
    }
  } catch (error) {
    console.error('[API] Composio delete error:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete connection' });
  }
}
