import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getSupabase, getOrCreateClerkUser } from '@/lib/database';

export async function DELETE(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getOrCreateClerkUser(clerkUserId);
    const userId = user.id;

    // Heuristic: Delete memories where content is long AND contains no spaces (likely base64 or raw JSON)
    // Supabase / Postgres query for content longer than 200 chars without a space
    const { data, error } = await getSupabase()
      .from('memory_nodes')
      .delete()
      .eq('user_id', userId)
      .filter('content', 'not.ilike', '% %')
      .gt('content', '200')
      .select();

    if (error) throw error;

    return NextResponse.json({ success: true, count: data?.length || 0 });
  } catch (error) {
    console.error('[API] Corrupted memory cleanup error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to clean memories' },
      { status: 500 }
    );
  }
}
