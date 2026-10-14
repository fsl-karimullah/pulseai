const { createClient } = require('/var/www/pulseai/pulseai/server/node_modules/@supabase/supabase-js');
const { Pool } = require('/var/www/pulseai/pulseai/server/node_modules/pg');

const sb = createClient(
  'https://adgutsyloluwqdyicqrw.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkZ3V0c3lsb2x1d3FkeWljcXJ3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzY3ODU5MywiZXhwIjoyMDkzMjU0NTkzfQ.xyGb-0gQly68opz5JicU-OPBREhQ8tk1bH9dNM5jKYQ'
);

const pool = new Pool({
  connectionString: 'postgresql://pulseai:PulseAI_Postgres_2026_Secure!@127.0.0.1:5432/pulseai_db'
});

async function syncTable(tableName, conflictKey = 'id') {
  try {
    const { data, error } = await sb.from(tableName).select('*');
    if (error) {
      console.log(`[${tableName}] Supabase error: ${error.message}`);
      return;
    }
    if (!data || data.length === 0) {
      console.log(`[${tableName}] 0 rows in Supabase`);
      return;
    }

    let inserted = 0;
    for (const row of data) {
      const keys = Object.keys(row);
      const cols = keys.map(k => `"${k}"`).join(', ');
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
      const vals = keys.map(k => {
        const val = row[k];
        if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
          return JSON.stringify(val);
        }
        return val;
      });

      const query = `INSERT INTO "${tableName}" (${cols}) VALUES (${placeholders}) ON CONFLICT (${conflictKey}) DO NOTHING`;
      try {
        await pool.query(query, vals);
        inserted++;
      } catch (err) {
        console.error(`[${tableName}] Insert error row ${row.id || row.phone_number}: ${err.message}`);
      }
    }
    console.log(`[${tableName}] Synced ${inserted}/${data.length} rows`);
  } catch (err) {
    console.error(`[${tableName}] Sync error: ${err.message}`);
  }
}

async function run() {
  console.log('--- Starting Data Sync from Supabase to VPS PostgreSQL ---');
  await syncTable('organizations');
  await syncTable('subscriptions');
  await syncTable('projects');
  await syncTable('bot_settings');
  await syncTable('widget_channels');
  await syncTable('knowledge_nodes');
  await syncTable('whatsapp_sessions', 'phone_number');
  await syncTable('whatsapp_session_intents');
  await syncTable('chat_logs');
  await syncTable('chat_feedbacks');
  await syncTable('credit_transactions');
  await syncTable('credit_topups');
  await syncTable('referral_partners');
  await syncTable('referral_logs');
  await syncTable('payment_orders');
  await syncTable('analytics_events');
  await syncTable('finance_transactions');
  await syncTable('job_vacancies');
  await syncTable('applicants');
  await syncTable('email_domains');
  await syncTable('leads');
  await syncTable('waitlist_internal');
  await syncTable('waitlist_hr');
  console.log('--- Sync Completed Successfully ---');
  await pool.end();
}

run();
