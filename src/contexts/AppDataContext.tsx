/**
 * AppDataContext.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for organization and subscription data.
 *
 * WHY this exists:
 *   useOrganization / useSubscription were called independently in DashboardLayout,
 *   Sidebar, DashboardPage, PricingPage, and WidgetIntegrationPage — triggering
 *   5+ simultaneous Supabase queries on every auth state change (including
 *   silent token refreshes). This caused the "due to access control checks"
 *   network flood.
 *
 *   By fetching ONCE at the app level and sharing the result via context, the
 *   number of queries drops from N×2 to exactly 1×2 per session refresh.
 */

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Organization {
  id: string;
  name: string;
  allowed_domains: string[];
  is_premium?: boolean;
  trial_started_at?: string;
  subscription_expires_at?: string;
}

export interface Subscription {
  id: string;
  org_id: string;
  plan_type: string;
  status: string;
  chat_limit: number;
  credits: number;
  pdf_upload_limit: number;
  expires_at: string | null;
}

interface AppDataContextType {
  organization: Organization | null;
  subscription: Subscription | null;
  loadingOrg: boolean;
  loadingSub: boolean;
  refreshOrganization: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
  updateOrganization: (partial: Partial<Organization>) => void;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const AppDataContext = createContext<AppDataContextType>({
  organization: null,
  subscription: null,
  loadingOrg: true,
  loadingSub: true,
  refreshOrganization: async () => {},
  refreshSubscription: async () => {},
  updateOrganization: () => {},
});

export const useAppData = () => useContext(AppDataContext);

// ─── Provider ────────────────────────────────────────────────────────────────

export const AppDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  const [organization, setOrganization] = useState<Organization | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loadingOrg, setLoadingOrg] = useState(true);
  const [loadingSub, setLoadingSub] = useState(true);

  // Track the user id we last fetched for — prevents double-fetches when
  // onAuthStateChange fires multiple times for the same session.
  const lastFetchedUserId = useRef<string | null>(null);

  const fetchOrganization = async () => {
    setLoadingOrg(true);
    try {
      const { data, error } = await supabase.from('organizations').select('*').single();
      if (!error && data) setOrganization(data as Organization);
    } catch {
      // silently ignore — UI will show empty state
    } finally {
      setLoadingOrg(false);
    }
  };

  const fetchSubscription = async () => {
    setLoadingSub(true);
    try {
      const { data, error } = await supabase.from('subscriptions').select('*').limit(1).single();
      if (!error && data) setSubscription(data as Subscription);
    } catch {
      // silently ignore — UI will show empty state
    } finally {
      setLoadingSub(false);
    }
  };

  useEffect(() => {
    if (!user) {
      // User logged out — clear everything
      setOrganization(null);
      setSubscription(null);
      setLoadingOrg(false);
      setLoadingSub(false);
      lastFetchedUserId.current = null;
      return;
    }

    // Guard: don't re-fetch if this is the same user session (token refresh)
    if (lastFetchedUserId.current === user.id) return;
    lastFetchedUserId.current = user.id;

    fetchOrganization();
    fetchSubscription();
  }, [user?.id]); // ← depend on stable user.id, NOT the whole user object

  const updateOrganization = (partial: Partial<Organization>) => {
    setOrganization(prev => prev ? { ...prev, ...partial } : prev);
  };

  return (
    <AppDataContext.Provider
      value={{
        organization,
        subscription,
        loadingOrg,
        loadingSub,
        refreshOrganization: fetchOrganization,
        refreshSubscription: fetchSubscription,
        updateOrganization,
      }}
    >
      {children}
    </AppDataContext.Provider>
  );
};
