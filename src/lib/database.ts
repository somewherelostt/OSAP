import { createClient } from '@supabase/supabase-js';
import type { DbUser, DbTask, DbTaskStep, DbExecution, DbMemoryNode } from '@/types/database';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = supabaseUrl && supabaseKey 
  ? createClient(supabaseUrl, supabaseKey)
  : null;

function getSupabase() {
  if (!supabase) {
    throw new Error('Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.');
  }
  return supabase;
}

// Generate anonymous user ID (UUID v4)
function generateAnonymousId(): string {
  return 'anon_' + crypto.randomUUID().replace(/-/g, '').substring(0, 16);
}

// User operations
export async function getUser(userId: string): Promise<DbUser | null> {
  const { data, error } = await getSupabase()
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();
  
  if (error) throw error;
  return data;
}

export async function getOrCreateUser(email: string): Promise<DbUser> {
  const { data: existing } = await getSupabase()
    .from('users')
    .select('*')
    .eq('email', email)
    .single();
  
  if (existing) return existing;
  
  const { data, error } = await getSupabase()
    .from('users')
    .insert({ email })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

// Get or create anonymous user by their anonymous ID
export async function getOrCreateAnonymousUser(anonymousId: string): Promise<DbUser> {
  const email = `anon_${anonymousId}@osap.app`;
  
  const { data: existing } = await getSupabase()
    .from('users')
    .select('*')
    .eq('email', email)
    .single();
  
  if (existing) return existing;
  
  const { data, error } = await getSupabase()
    .from('users')
    .insert({ email })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

// Get or create user by Clerk user ID (maps Clerk IDs to internal UUID users)
// Uses clerk_id column for direct lookup, falls back to email match
export async function getOrCreateClerkUser(clerkUserId: string, email?: string): Promise<DbUser> {
  // First try to find by clerk_id directly
  const { data: byClerkId } = await getSupabase()
    .from('users')
    .select('*')
    .eq('clerk_id', clerkUserId)
    .single();
  
  if (byClerkId) return byClerkId;
  
  // Fall back to email lookup if provided
  if (email) {
    const { data: byEmail } = await getSupabase()
      .from('users')
      .select('*')
      .eq('email', email)
      .single();
    
    if (byEmail) {
      // Update the clerk_id if we found by email but not by clerk_id
      const { data: updated, error: updateError } = await getSupabase()
        .from('users')
        .update({ clerk_id: clerkUserId })
        .eq('id', byEmail.id)
        .select()
        .single();
      
      if (updated) return updated;
      if (updateError) console.error('[DB] Error updating clerk_id:', updateError);
      return byEmail;
    }
  }
  
  // Need to create a new user - but we can't insert without a valid auth.uid() reference
  // Since Clerk manages auth, we create a "placeholder" user that can be linked
  // Use the service role key or create user without auth.users reference
  const userEmail = email || `clerk_${clerkUserId}@osap.local`;
  
  // Insert with explicit id generation - we'll use a placeholder UUID
  // This allows the user record to exist even without Supabase Auth linking
  const { data: newUser, error: insertError } = await getSupabase()
    .from('users')
    .insert({
      clerk_id: clerkUserId,
      email: userEmail,
    })
    .select()
    .single();
  
  if (insertError) {
    // If insert fails (e.g. RLS), try upsert
    const { data: upserted, error: upsertError } = await getSupabase()
      .from('users')
      .upsert(
        { clerk_id: clerkUserId, email: userEmail },
        { ignoreDuplicates: true }
      )
      .select()
      .single();
    
    if (upsertError) {
      console.error('[DB] Error creating Clerk user:', upsertError);
      throw upsertError;
    }
    return upserted;
  }
  
  return newUser;
}

// Task operations
export async function createTask(
  userId: string,
  input: string,
  title: string,
  description?: string
): Promise<DbTask> {
  const { data, error } = await getSupabase()
    .from('tasks')
    .insert({
      user_id: userId,
      title,
      description,
      input,
      status: 'pending',
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function updateTask(
  taskId: string,
  updates: Partial<DbTask>
): Promise<DbTask> {
  const { data, error } = await getSupabase()
    .from('tasks')
    .update(updates)
    .eq('id', taskId)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function getTask(taskId: string): Promise<DbTask | null> {
  const { data, error } = await getSupabase()
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .single();
  
  if (error) return null;
  return data;
}

export async function getTasks(userId: string, limit = 50): Promise<DbTask[]> {
  const { data, error } = await getSupabase()
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  
  if (error) throw error;
  return data || [];
}

export async function deleteTask(taskId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('tasks')
    .delete()
    .eq('id', taskId);
  
  if (error) throw error;
}

// Task steps operations
export async function createTaskStep(
  taskId: string,
  step: Omit<DbTaskStep, 'id' | 'task_id' | 'created_at'>
): Promise<DbTaskStep> {
  const { data, error } = await getSupabase()
    .from('task_steps')
    .insert({
      task_id: taskId,
      ...step,
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function updateTaskStep(
  stepId: string,
  updates: Partial<DbTaskStep>
): Promise<DbTaskStep> {
  const { data, error } = await getSupabase()
    .from('task_steps')
    .update(updates)
    .eq('id', stepId)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function getTaskSteps(taskId: string): Promise<DbTaskStep[]> {
  const { data, error } = await getSupabase()
    .from('task_steps')
    .select('*')
    .eq('task_id', taskId)
    .order('step_order', { ascending: true });
  
  if (error) throw error;
  return data || [];
}

// Execution log operations
export async function logExecution(
  execution: Omit<DbExecution, 'id' | 'created_at'>
): Promise<DbExecution> {
  const { data, error } = await getSupabase()
    .from('executions')
    .insert(execution)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

// Memory operations
export async function createMemoryNode(
  node: Omit<DbMemoryNode, 'id' | 'created_at' | 'updated_at'>
): Promise<DbMemoryNode> {
  const { data, error } = await getSupabase()
    .from('memory_nodes')
    .insert(node)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function getMemoryNodes(
  userId: string,
  type?: string,
  limit = 50
): Promise<DbMemoryNode[]> {
  let query = supabase
    .from('memory_nodes')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  
  if (type) {
    query = query.eq('type', type);
  }
  
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function searchMemoryNodes(
  userId: string,
  searchQuery: string
): Promise<DbMemoryNode[]> {
  const { data, error } = await getSupabase()
    .from('memory_nodes')
    .select('*')
    .eq('user_id', userId)
    .or(`content.ilike.%${searchQuery}%,source.ilike.%${searchQuery}%`)
    .order('importance', { ascending: false })
    .limit(20);
  
  if (error) throw error;
  return data || [];
}

export async function updateMemoryNode(
  nodeId: string,
  updates: Partial<DbMemoryNode>
): Promise<DbMemoryNode> {
  const { data, error } = await getSupabase()
    .from('memory_nodes')
    .update(updates)
    .eq('id', nodeId)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function deleteMemoryNode(nodeId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('memory_nodes')
    .delete()
    .eq('id', nodeId);
  
  if (error) throw error;
}

// Alias for createMemoryNode
export const storeMemory = createMemoryNode;

// Get memory statistics
export async function getMemoryStats(userId: string): Promise<{
  total: number;
  byType: Record<string, number>;
  avgImportance: number;
}> {
  const nodes = await getMemoryNodes(userId, undefined, 1000);

  const byType: Record<string, number> = {};
  let totalImportance = 0;

  for (const node of nodes) {
    byType[node.type] = (byType[node.type] || 0) + 1;
    totalImportance += node.importance;
  }

  return {
    total: nodes.length,
    byType,
    avgImportance: nodes.length > 0 ? totalImportance / nodes.length : 0,
  };
}
