import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

async function run() {
  console.log("Adding columns to organizations...");
  const sql = `
    ALTER TABLE public.organizations 
    ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMP WITH TIME ZONE;
  `;
  
  // Since supabase-js doesn't have a direct raw query execution unless we use RPC
  // I will check if we can just update a single row to verify it.
  console.log("Please run the ALTER TABLE script manually in the Supabase SQL Editor if columns don't exist.");
}
run();
