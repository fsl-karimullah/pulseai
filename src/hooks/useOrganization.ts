/**
 * useOrganization.ts
 *
 * Thin wrapper around AppDataContext — returns the cached organization so
 * components that call this hook don't trigger their own Supabase queries.
 * The single source-of-truth fetch happens in AppDataProvider (AppDataContext.tsx).
 *
 * updateDomains / updateName are kept for backward compatibility.
 */

import { useAppData } from '../contexts/AppDataContext';
import { supabase } from '../lib/supabase';

export type { Organization } from '../contexts/AppDataContext';

export function useOrganization() {
  const { organization, loadingOrg: loading, updateOrganization, refreshOrganization } = useAppData();

  const updateDomains = async (domains: string[]) => {
    if (!organization) return;
    try {
      const { error } = await supabase
        .from('organizations')
        .update({ allowed_domains: domains })
        .eq('id', organization.id);

      if (error) throw error;
      updateOrganization({ allowed_domains: domains });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const updateName = async (name: string) => {
    if (!organization) return;
    try {
      const { error } = await supabase
        .from('organizations')
        .update({ name })
        .eq('id', organization.id);

      if (error) throw error;
      updateOrganization({ name });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  return { organization, loading, error: null, updateDomains, updateName, refreshOrganization };
}
