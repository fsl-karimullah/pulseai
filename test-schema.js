const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'server/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY);

async function main() {
  const { data, error } = await supabase.from('organizations').select('*').limit(1);
  console.log('Orgs:', Object.keys(data[0] || {}));
}
main();
