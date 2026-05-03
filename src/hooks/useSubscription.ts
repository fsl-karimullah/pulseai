import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export interface Subscription {
  id: string;
  org_id: string;
  plan_type: string;
  status: string;
  chat_limit: number;
  expires_at: string | null;
}

export function useSubscription() {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSubscription = useCallback(async () => {
    if (!user) {
      setSubscription(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('subscriptions')
        .select('*')
        .limit(1)
        .single();

      if (fetchError) throw fetchError;

      console.log('DEBUG: Fetched subscription:', data);
      setSubscription(data as Subscription);
      setError(null);
    } catch (err: any) {
      console.error('DEBUG: Subscription fetch error:', err);
      if (err.code === 'PGRST116') {
        setError('No subscription found.');
      } else {
        setError(err.message || 'Failed to load subscription');
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  return { subscription, loading, error, refresh: fetchSubscription };
}
