import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateClerkUser } from '@/lib/database';
import { supabase } from '@/lib/database';

export async function GET(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const internalUser = await getOrCreateClerkUser(clerkUserId);
    
    const { data, error } = await supabase
      .from('users')
      .select('user_preferences')
      .eq('id', internalUser.id)
      .single();
    
    if (error) throw error;
    
    return NextResponse.json({ 
      preferences: data?.user_preferences || {
        taskCompletionEmails: true,
        memoryDigestEmails: true,
        weeklySummary: false,
      }
    });
  } catch (error) {
    console.error('[API] Preferences fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch preferences' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const internalUser = await getOrCreateClerkUser(clerkUserId);
    const body = await request.json();
    const { preferenceKey, value } = body;
    
    if (!preferenceKey || value === undefined) {
      return NextResponse.json({ error: 'preferenceKey and value required' }, { status: 400 });
    }

    // Fetch existing preferences
    const { data: existing } = await supabase
      .from('users')
      .select('user_preferences')
      .eq('id', internalUser.id)
      .single();
    
    const currentPrefs = existing?.user_preferences || {};
    const updatedPrefs = { ...currentPrefs, [preferenceKey]: value };
    
    const { data, error } = await supabase
      .from('users')
      .update({ user_preferences: updatedPrefs })
      .eq('id', internalUser.id)
      .select('user_preferences')
      .single();
    
    if (error) throw error;
    
    return NextResponse.json({ preferences: data?.user_preferences });
  } catch (error) {
    console.error('[API] Preferences update error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update preferences' },
      { status: 500 }
    );
  }
}
