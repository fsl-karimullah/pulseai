-- Fix for Supabase linter warning: View public.whatsapp_sessions_summary is defined with the SECURITY DEFINER property
-- This enforces that the view uses the querying user's RLS policies rather than the view creator's.
ALTER VIEW public.whatsapp_sessions_summary SET (security_invoker = on);
