import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getToolRouter } from '@/lib/composio/index';
import { getOrCreateClerkUser } from '@/lib/database';

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const toolkit = body.toolkit;

    if (!toolkit) {
      return NextResponse.json({ error: 'Missing toolkit parameter' }, { status: 400 });
    }

    const internalUser = await getOrCreateClerkUser(clerkUserId);
    const router = getToolRouter();
    
    // Create or get session for the user
    const session = await router.getOrCreateSession("osap-main", internalUser.id);
    
    // Initiate authentication for the toolkit
    const authState = await router.initiateAuth(session.id, toolkit);

    return NextResponse.json({ 
      authUrl: authState.linkUrl || null,
      status: authState.status,
      connectedAccountId: authState.connectedAccountId
    });
  } catch (error) {
    console.error('[API] Composio connect POST error:', error);
    return NextResponse.json({ 
      authUrl: null, 
      error: 'Failed to initiate connection' 
    }, { status: 500 });
  }
}

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
    const router = getToolRouter();
    
    // Create or get session for the user
    const session = await router.getOrCreateSession("osap-main", internalUser.id);
    
    // Initiate authentication for the toolkit
    const authState = await router.initiateAuth(session.id, toolkit);

    return NextResponse.json({ 
      authUrl: authState.linkUrl || null,
      status: authState.status,
      connectedAccountId: authState.connectedAccountId
    });
  } catch (error) {
    console.error('[API] Composio connect error:', error);
    return NextResponse.json({ 
      authUrl: null, 
      error: 'Failed to initiate connection' 
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    let toolkit = searchParams.get('toolkit');
    const connectedAccountId = searchParams.get('connected_account_id');

    if (!toolkit) {
      try {
        const body = await request.json();
        toolkit = body.toolkit;
      } catch (e) {
        // No body or invalid JSON, ignore
      }
    }

    if (!toolkit) {
      return NextResponse.json({ error: 'Missing toolkit parameter' }, { status: 400 });
    }

    const internalUser = await getOrCreateClerkUser(clerkUserId);
    const router = getToolRouter();
    
    // If we have a direct connected account ID, prioritize that for exact deletion
    if (connectedAccountId) {
      const success = await router.deleteConnectedAccount(connectedAccountId);
      return NextResponse.json({ success });
    }

    // Fallback: list all connected accounts for session and remove those matching toolkit
    const session = await router.getOrCreateSession("osap-main", internalUser.id);
    const toolkits = await router.listToolkits(session.id);
    const toolkitInfo = toolkits.find((t: any) => t.slug === toolkit);
    
    if (toolkitInfo?.connection?.connected_account?.id) {
       const success = await router.deleteConnectedAccount(toolkitInfo.connection.connected_account.id);
       return NextResponse.json({ success });
    }

    return NextResponse.json({ success: false, error: 'No active connection found' });
  } catch (error) {
    console.error('[API] Composio delete error:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete connection' }, { status: 500 });
  }
}
