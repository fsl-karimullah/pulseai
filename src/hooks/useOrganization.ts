import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export interface Organization {
  id: string;
  name: string;
  allowed_domains: string[];
}

export function useOrganization() {
  const { user } = useAuth();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setOrganization(null);
      setLoading(false);
      return;
    }

    let isMounted = true;

    async function fetchOrganization() {
      try {
        setLoading(true);
        const { data, error: fetchError } = await supabase
          .from('organizations')
          .select('*')
          .single();

        if (fetchError) throw fetchError;

        if (isMounted) {
          setOrganization(data as Organization);
        }
      } catch (err: any) {
        if (isMounted) setError(err.message || 'Failed to load organization');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchOrganization();

    return () => {
      isMounted = false;
    };
  }, [user]);

  const updateDomains = async (domains: string[]) => {
    if (!organization) return;
    try {
      const { error: updateError } = await supabase
        .from('organizations')
        .update({ allowed_domains: domains })
        .eq('id', organization.id);

      if (updateError) throw updateError;
      setOrganization({ ...organization, allowed_domains: domains });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  return { organization, loading, error, updateDomains };
}
