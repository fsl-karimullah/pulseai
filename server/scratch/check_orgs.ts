import 'dotenv/config';
import { supabase } from '../src/config/supabase';

async function check() {
  const { data: orgs } = await supabase.from('organizations').select('id, name');
  console.log('--- Organizations ---');
  console.log(JSON.stringify(orgs, null, 2));

  for (const org of orgs || []) {
    const { count } = await supabase
      .from('knowledge_nodes')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', org.id);
    
    const { data: settings } = await supabase
      .from('bot_settings')
      .select('bot_name')
      .eq('org_id', org.id)
      .maybeSingle();

    console.log(`Org: ${org.name} (${org.id})`);
    console.log(` - Documents: ${count}`);
    console.log(` - Bot Name: ${settings?.bot_name || 'Not set'}`);
  }
}

check().catch(console.error);
