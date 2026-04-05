import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function GET(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
          });
        },
      },
    }
  );
  
  const { data: { session }, error } = await supabase.auth.getSession();

  if (error) {
    console.error('[Auth] Get session error:', error);
    return NextResponse.json({ session: null, user: null }, { status: 500 });
  }

  if (!session) {
    return NextResponse.json({ session: null, user: null });
  }

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', session.user.id)
    .single();

  return NextResponse.json({
    session,
    user: {
      ...session.user,
      profile,
    },
  });
}
