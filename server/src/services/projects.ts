import { supabase } from '../config/supabase';

/**
 * Returns the org's default Project — the oldest one, which for existing
 * clients is the auto-migrated project containing all their pre-Projects
 * data. Used as the fallback whenever a caller doesn't specify which
 * Project a request belongs to (old widget snippets, legacy KB uploads,
 * WhatsApp numbers without a recorded session intent, etc).
 */
export async function resolveDefaultProjectId(orgId: string): Promise<string | null> {
  const { data } = await supabase
    .from('projects')
    .select('id')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  return data?.id ?? null;
}
