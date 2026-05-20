import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!);

async function main() {
  const { data, error } = await supabase.from('users').select('*').limit(1).catch(() => ({}));
  console.log('users:', data);
  const { data: d2 } = await supabase.from('profiles').select('*').limit(1);
  console.log('profiles:', d2);
  const { data: d3 } = await supabase.from('organizations').select('*').limit(1);
  console.log('organizations keys:', Object.keys(d3?.[0] || {}));
}
main();
