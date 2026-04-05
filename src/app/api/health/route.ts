import { testGlmConnection } from '@/lib/glm';
import { isHydraConfigured } from '@/lib/hydra';
import { supabase } from '@/lib/database';

export async function GET() {
  const checks = {
    glm: { status: 'unknown' as string, error: undefined as string | undefined },
    hydradb: { status: 'unknown' as string, error: undefined as string | undefined },
    supabase: { status: 'unknown' as string, error: undefined as string | undefined },
    composio: { status: 'unknown' as string, error: undefined as string | undefined },
    firecrawl: { status: 'unknown' as string, error: undefined as string | undefined },
  };

  const glmResult = await testGlmConnection();
  checks.glm.status = glmResult.success ? 'healthy' : 'unhealthy';
  checks.glm.error = glmResult.error;

  checks.hydradb.status = isHydraConfigured() ? 'healthy' : 'not_configured';

  try {
    const { error } = await supabase.from('users').select('id').limit(1);
    checks.supabase.status = error ? 'unhealthy' : 'healthy';
    checks.supabase.error = error?.message;
  } catch (e) {
    checks.supabase.status = 'unhealthy';
    checks.supabase.error = e instanceof Error ? e.message : 'Unknown error';
  }

  checks.composio.status = 'not_implemented';
  checks.firecrawl.status = 'not_implemented';

  const allHealthy = Object.values(checks).every(c => c.status === 'healthy');

  return Response.json({
    status: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    checks,
  });
}