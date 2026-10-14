-- ═══════════════════════════════════════════════════════════════════════════
-- PulseAI — Master PostgreSQL Migration (Plain PostgreSQL, VPS Self-Hosted)
-- Target: PostgreSQL 16 + pgvector on VPS (43.157.224.156)
-- Auth: Supabase Auth tetap dipakai untuk login (user_id adalah UUID).
-- PostgREST role: web_anon & authenticator
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Shared trigger function: auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 1. organizations ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL UNIQUE,
  name            TEXT        NOT NULL DEFAULT 'My Organization',
  is_premium      BOOLEAN     DEFAULT false,
  trial_started_at TIMESTAMPTZ,
  subscription_expires_at TIMESTAMPTZ,
  allowed_domains TEXT[]      DEFAULT '{}',
  reply_to_email  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS organizations_user_id_idx ON organizations (user_id);

-- ── 2. subscriptions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_type        TEXT        NOT NULL DEFAULT 'free',
  status           TEXT        NOT NULL DEFAULT 'active',
  chat_limit       INT         NOT NULL DEFAULT 100,
  credits          INT         NOT NULL DEFAULT 100,
  pdf_upload_limit INT         NOT NULL DEFAULT 3,
  bulk_cv_limit    INT         NOT NULL DEFAULT 10,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS subscriptions_org_id_idx ON subscriptions (org_id);

-- ── 3. projects ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL DEFAULT 'Default Project',
  description TEXT,
  is_default  BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS projects_org_id_idx ON projects (org_id);

CREATE OR REPLACE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-provision a default project for every new organization
CREATE OR REPLACE FUNCTION handle_new_org_project()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO projects (org_id, name, is_default)
  VALUES (NEW.id, NEW.name, true)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER on_org_created_project
  AFTER INSERT ON organizations
  FOR EACH ROW EXECUTE FUNCTION handle_new_org_project();

-- ── 4. bot_settings ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bot_settings (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id       UUID         REFERENCES projects(id) ON DELETE CASCADE,
  profile_name     TEXT         NOT NULL DEFAULT 'Bot Utama',
  kb_project_ids   UUID[]       NOT NULL DEFAULT '{}',
  bot_name         TEXT         NOT NULL DEFAULT 'PulseAI Assistant',
  system_prompt    TEXT,
  greeting_message TEXT,
  language         TEXT         NOT NULL DEFAULT 'id',
  ai_model         TEXT         NOT NULL DEFAULT 'gemini-pro',
  temperature      NUMERIC(3,2) NOT NULL DEFAULT 0.7,
  is_active        BOOLEAN      NOT NULL DEFAULT true,
  widget_placement TEXT         NOT NULL DEFAULT 'bottom-right'
                   CHECK (widget_placement IN ('bottom-right', 'bottom-left')),
  quick_replies    JSONB        DEFAULT '[]'::jsonb,
  telegram_bot_token TEXT,
  telegram_chat_id   TEXT,
  proactive_delay  INT          DEFAULT 0,
  followup_delay   INT          DEFAULT 0,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS bot_settings_org_id_idx ON bot_settings (org_id);
CREATE INDEX IF NOT EXISTS bot_settings_project_id_idx ON bot_settings (project_id);

CREATE OR REPLACE TRIGGER bot_settings_updated_at
  BEFORE UPDATE ON bot_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 5. widget_channels ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS widget_channels (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  bot_settings_id UUID        REFERENCES bot_settings(id) ON DELETE SET NULL,
  name            TEXT        NOT NULL DEFAULT 'Website Widget',
  domain          TEXT,
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS widget_channels_project_id_idx ON widget_channels (project_id);
CREATE INDEX IF NOT EXISTS idx_widget_channels_bot_settings_id ON widget_channels (bot_settings_id);

CREATE OR REPLACE TRIGGER widget_channels_updated_at
  BEFORE UPDATE ON widget_channels FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 6. knowledge_nodes ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS knowledge_nodes (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id   UUID        REFERENCES projects(id) ON DELETE CASCADE,
  title        TEXT        NOT NULL,
  content      TEXT        NOT NULL,
  source_type  TEXT        DEFAULT 'manual',
  source_url   TEXT,
  file_name    TEXT,
  embedding    vector(768),
  chunk_index  INT         DEFAULT 0,
  total_chunks INT         DEFAULT 1,
  metadata     JSONB       DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS knowledge_nodes_org_id_idx     ON knowledge_nodes (org_id);
CREATE INDEX IF NOT EXISTS knowledge_nodes_project_id_idx ON knowledge_nodes (project_id);

CREATE OR REPLACE TRIGGER knowledge_nodes_updated_at
  BEFORE UPDATE ON knowledge_nodes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 7. whatsapp_sessions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  phone_number         TEXT        PRIMARY KEY,
  org_id               UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id           UUID        REFERENCES projects(id) ON DELETE SET NULL,
  bot_settings_id      UUID        REFERENCES bot_settings(id) ON DELETE SET NULL,
  phone_label          TEXT        NOT NULL DEFAULT 'default',
  gateway_user_id      TEXT        NOT NULL,
  status               TEXT        NOT NULL DEFAULT 'DISCONNECTED'
                       CHECK (status IN ('CONNECTED','DISCONNECTED','CONNECTING','QR_PENDING')),
  is_chatbot_enabled   BOOLEAN     NOT NULL DEFAULT true,
  meta_phone_number_id TEXT,
  meta_access_token    TEXT,
  meta_waba_id         TEXT,
  platform             TEXT        NOT NULL DEFAULT 'baileys'
                       CHECK (platform IN ('baileys','meta')),
  connected_at         TIMESTAMPTZ,
  disconnected_at      TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS whatsapp_sessions_org_id_idx         ON whatsapp_sessions (org_id);
CREATE INDEX IF NOT EXISTS whatsapp_sessions_project_id_idx     ON whatsapp_sessions (project_id);
CREATE INDEX IF NOT EXISTS whatsapp_sessions_gateway_uid_idx    ON whatsapp_sessions (gateway_user_id);
CREATE INDEX IF NOT EXISTS idx_ws_chatbot_enabled               ON whatsapp_sessions (is_chatbot_enabled);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_bot_settings_id ON whatsapp_sessions (bot_settings_id);

CREATE OR REPLACE TRIGGER whatsapp_sessions_updated_at
  BEFORE UPDATE ON whatsapp_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 8. whatsapp_session_intents ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_session_intents (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  phone_label TEXT        NOT NULL,
  project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, phone_label)
);

-- ── 9. chat_logs ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  bot_number      TEXT        NOT NULL,
  customer_number TEXT        NOT NULL,
  sender          TEXT        NOT NULL CHECK (sender IN ('bot','customer')),
  message_text    TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS chat_logs_tenant_id_idx    ON chat_logs (tenant_id);
CREATE INDEX IF NOT EXISTS chat_logs_bot_customer_idx ON chat_logs (bot_number, customer_number);
CREATE INDEX IF NOT EXISTS chat_logs_created_at_idx   ON chat_logs (tenant_id, created_at DESC);

-- ── 10. chat_feedbacks ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_feedbacks (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  session_id      TEXT        NOT NULL,
  message_content TEXT        NOT NULL,
  is_positive     BOOLEAN     NOT NULL,
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_feedbacks_org_id ON chat_feedbacks (org_id);

-- ── 11. credit_transactions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS credit_transactions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  amount      INTEGER     NOT NULL,
  type        TEXT        NOT NULL,
  description TEXT,
  reference   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS credit_transactions_org_id_idx ON credit_transactions (org_id);

-- ── 12. credit_topups ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS credit_topups (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          TEXT        UNIQUE NOT NULL,
  org_id            UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  credits_purchased INT         NOT NULL,
  amount            INT         NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'pending',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE OR REPLACE TRIGGER credit_topups_updated_at
  BEFORE UPDATE ON credit_topups FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 13. referral_partners ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referral_partners (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_name    TEXT         NOT NULL,
  referral_code   TEXT         UNIQUE NOT NULL,
  commission_rate NUMERIC(5,4) NOT NULL DEFAULT 0.20 CHECK (commission_rate BETWEEN 0 AND 1),
  discount_rate   NUMERIC(5,4) NOT NULL DEFAULT 0.10 CHECK (discount_rate BETWEEN 0 AND 1),
  whatsapp_number TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_referral_partners_code ON referral_partners (referral_code);

-- ── 14. referral_logs ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referral_logs (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id        UUID        NOT NULL REFERENCES referral_partners (id) ON DELETE RESTRICT,
  buyer_tenant_id   TEXT        NOT NULL,
  package_price     NUMERIC     NOT NULL,
  commission_amount NUMERIC     NOT NULL,
  is_paid           BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_referral_logs_partner ON referral_logs (partner_id);
CREATE INDEX IF NOT EXISTS idx_referral_logs_tenant  ON referral_logs (buyer_tenant_id);

-- ── 15. payment_orders ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_orders (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  order_id            TEXT        UNIQUE NOT NULL,
  plan_type           TEXT        NOT NULL,
  amount              INT         NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'pending',
  referral_partner_id UUID        REFERENCES referral_partners (id) ON DELETE SET NULL,
  original_amount     NUMERIC,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE OR REPLACE TRIGGER payment_orders_updated_at
  BEFORE UPDATE ON payment_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 16. analytics_events ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics_events (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID        REFERENCES organizations(id) ON DELETE CASCADE,
  event_type TEXT        NOT NULL,
  payload    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS analytics_events_org_id_idx ON analytics_events (org_id);
CREATE INDEX IF NOT EXISTS analytics_events_type_idx   ON analytics_events (event_type);

-- ── 17. finance_transactions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance_transactions (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type        TEXT          NOT NULL CHECK (type IN ('income','expense')),
  category    TEXT          NOT NULL,
  description TEXT          NOT NULL,
  amount      NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  date        DATE          NOT NULL DEFAULT CURRENT_DATE,
  source      TEXT,
  status      TEXT          NOT NULL DEFAULT 'completed'
              CHECK (status IN ('completed','pending','cancelled')),
  notes       TEXT,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS finance_transactions_org_id_idx ON finance_transactions (org_id);
CREATE INDEX IF NOT EXISTS finance_transactions_date_idx   ON finance_transactions (org_id, date DESC);
CREATE INDEX IF NOT EXISTS finance_transactions_type_idx   ON finance_transactions (org_id, type);

CREATE OR REPLACE TRIGGER finance_transactions_updated_at
  BEFORE UPDATE ON finance_transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 18. job_vacancies ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_vacancies (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  title        TEXT        NOT NULL,
  description  TEXT        NOT NULL,
  requirements TEXT        NOT NULL DEFAULT '',
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_job_vacancies_org_active ON job_vacancies (org_id, is_active);

-- ── 19. applicants ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS applicants (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               UUID        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  job_id               UUID        NOT NULL REFERENCES job_vacancies (id) ON DELETE CASCADE,
  name                 TEXT        NOT NULL DEFAULT '',
  email                TEXT        NOT NULL DEFAULT '',
  whatsapp             TEXT        NOT NULL DEFAULT '',
  ats_score            SMALLINT    NOT NULL DEFAULT 0 CHECK (ats_score BETWEEN 0 AND 100),
  analysis_result      JSONB       NOT NULL DEFAULT '{}',
  status               TEXT        NOT NULL DEFAULT 'PENDING',
  cv_file_path         TEXT,
  email_sent_at        TIMESTAMPTZ,
  whatsapp_sent_at     TIMESTAMPTZ,
  whatsapp_number_used TEXT,
  bulk_session_id      UUID,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_applicants_job_id    ON applicants (job_id);
CREATE INDEX IF NOT EXISTS idx_applicants_org_id    ON applicants (org_id);
CREATE INDEX IF NOT EXISTS idx_applicants_status    ON applicants (status);
CREATE INDEX IF NOT EXISTS idx_applicants_ats_score ON applicants (ats_score DESC);
CREATE INDEX IF NOT EXISTS applicants_bulk_session_idx ON applicants (bulk_session_id) WHERE bulk_session_id IS NOT NULL;

-- ── 20. email_domains ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_domains (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID        NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  domain           TEXT        NOT NULL,
  resend_domain_id TEXT        NOT NULL,
  from_email       TEXT        NOT NULL,
  from_name        TEXT,
  status           TEXT        NOT NULL DEFAULT 'pending',
  records          JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS email_domains_org_id_idx ON email_domains (org_id);

-- ── 21. leads ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name       TEXT,
  phone      TEXT,
  email      TEXT,
  source     TEXT,
  status     TEXT        NOT NULL DEFAULT 'new',
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS leads_org_id_idx ON leads (org_id);

-- ── 22. waitlists ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS waitlist_internal (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT        NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS waitlist_hr (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT        NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 23. VIEWS ───────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW finance_monthly_summary AS
SELECT
  org_id,
  DATE_TRUNC('month', date) AS month,
  SUM(CASE WHEN type = 'income'  THEN amount ELSE 0 END) AS total_income,
  SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS total_expense,
  SUM(CASE WHEN type = 'income'  THEN amount ELSE 0 END)
    - SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS net_profit,
  COUNT(*) AS transaction_count
FROM finance_transactions
GROUP BY org_id, DATE_TRUNC('month', date);

CREATE OR REPLACE VIEW whatsapp_sessions_summary AS
SELECT
  ws.phone_number,
  ws.phone_label,
  ws.org_id,
  o.name AS org_name,
  ws.status,
  ws.is_chatbot_enabled,
  ws.platform,
  ws.gateway_user_id,
  ws.meta_phone_number_id,
  ws.meta_waba_id,
  ws.connected_at,
  ws.disconnected_at,
  ws.updated_at
FROM whatsapp_sessions ws
JOIN organizations o ON o.id = ws.org_id;

-- ── 24. RAG VECTOR SEARCH RPC FUNCTIONS ─────────────────────────────────────
CREATE OR REPLACE FUNCTION match_knowledge_nodes(
  query_embedding vector(768),
  match_threshold float default 0.50,
  match_count     int   default 5
)
RETURNS TABLE (
  id          UUID,
  title       TEXT,
  content     TEXT,
  source_type TEXT,
  similarity  FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    kn.id,
    kn.title,
    kn.content,
    kn.source_type,
    1 - (kn.embedding <=> query_embedding) AS similarity
  FROM knowledge_nodes kn
  WHERE 1 - (kn.embedding <=> query_embedding) > match_threshold
  ORDER BY kn.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION match_knowledge_nodes_by_project(
  query_embedding vector(768),
  p_project_id    uuid,
  match_threshold float default 0.50,
  match_count     int   default 5
)
RETURNS TABLE (
  id          UUID,
  title       TEXT,
  content     TEXT,
  source_type TEXT,
  similarity  FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    kn.id,
    kn.title,
    kn.content,
    kn.source_type,
    1 - (kn.embedding <=> query_embedding) AS similarity
  FROM knowledge_nodes kn
  WHERE kn.project_id = p_project_id
    AND 1 - (kn.embedding <=> query_embedding) > match_threshold
  ORDER BY kn.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION match_knowledge_nodes_by_projects(
  query_embedding vector(768),
  p_project_ids   uuid[],
  match_threshold float default 0.50,
  match_count     int   default 5
)
RETURNS TABLE (
  id          UUID,
  title       TEXT,
  content     TEXT,
  source_type TEXT,
  similarity  FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    kn.id,
    kn.title,
    kn.content,
    kn.source_type,
    1 - (kn.embedding <=> query_embedding) AS similarity
  FROM knowledge_nodes kn
  WHERE kn.project_id = ANY(p_project_ids)
    AND 1 - (kn.embedding <=> query_embedding) > match_threshold
  ORDER BY kn.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

COMMIT;
