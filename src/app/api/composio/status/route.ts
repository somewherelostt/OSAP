import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getToolRouter } from '@/lib/composio/index';
import { getOrCreateClerkUser } from '@/lib/database';

export async function GET() {
  try {
    const { userId: clerkUserId } = await auth();
    
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const internalUser = await getOrCreateClerkUser(clerkUserId);
    const router = getToolRouter();
    
    // Create or get session for the user
    const session = await router.getOrCreateSession("osap-main", internalUser.id);
    
    // Fetch both global toolkits and session toolkits with individual error handling
    const [globalToolkits, sessionToolkits] = await Promise.all([
      router.listToolkitsFallback(session.id).catch(err => {
        console.error('[API] Global toolkit fetch failed:', err);
        return [];
      }),
      router.listToolkits(session.id).catch(err => {
        console.error('[API] Session toolkit fetch failed:', err);
        return [];
      })
    ]);
    
    // Merge them together, prioritizing session toolkits for connection details
    const toolkitMap = new Map<string, any>();
    globalToolkits.forEach(t => toolkitMap.set(t.slug, t));
    sessionToolkits.forEach(t => toolkitMap.set(t.slug, { ...toolkitMap.get(t.slug), ...t }));
    
    const toolkits = Array.from(toolkitMap.values());
    const connected = toolkits.filter((t: any) => t.connection?.is_active).map((t: any) => t.slug);
    
    return NextResponse.json({ 
      connected, 
      toolkits 
    });
  } catch (error) {
    console.error('[API] Composio status error:', error);
    return NextResponse.json({ 
      connected: [], 
      toolkits: [],
      error: 'Failed to fetch toolkit status' 
    }, { status: 200 }); // Return 200 to avoid crashing UI
  }
}
