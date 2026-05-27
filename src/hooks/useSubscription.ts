/**
 * useSubscription.ts
 *
 * Thin wrapper around AppDataContext — returns the cached subscription so
 * components that call this hook don't trigger their own Supabase queries.
 * The single source-of-truth fetch happens in AppDataProvider (AppDataContext.tsx).
 */

import { useAppData } from '../contexts/AppDataContext';

export type { Subscription } from '../contexts/AppDataContext';

export function useSubscription() {
  const { subscription, loadingSub: loading, refreshSubscription: refresh } = useAppData();
  return { subscription, loading, error: null, refresh };
}
