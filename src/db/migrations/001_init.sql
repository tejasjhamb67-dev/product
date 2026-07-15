-- Meridian core schema (PRD section 5)

CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  tier          TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'core', 'pro')),
  subscription_status TEXT NOT NULL DEFAULT 'none'
                CHECK (subscription_status IN ('none', 'active', 'past_due', 'cancelled')),
  razorpay_subscription_id TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_otps (
  id          BIGSERIAL PRIMARY KEY,
  email       TEXT NOT NULL,
  code_hash   TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_otps_email_idx ON auth_otps (email, expires_at);

CREATE TABLE IF NOT EXISTS broker_connections (
  id                     BIGSERIAL PRIMARY KEY,
  user_id                BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  broker                 TEXT NOT NULL DEFAULT 'zerodha' CHECK (broker IN ('zerodha')),
  access_token_encrypted TEXT NOT NULL,
  token_expires_at       TIMESTAMPTZ NOT NULL,
  refresh_needed         BOOLEAN NOT NULL DEFAULT FALSE,
  connected_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, broker)
);

CREATE TABLE IF NOT EXISTS holdings_snapshot (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source      TEXT NOT NULL CHECK (source IN ('broker', 'manual')),
  ticker      TEXT NOT NULL,
  quantity    NUMERIC NOT NULL,
  avg_price   NUMERIC NOT NULL,
  last_price  NUMERIC,
  segment     TEXT NOT NULL DEFAULT 'equity' CHECK (segment IN ('equity', 'fno')),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS holdings_user_captured_idx ON holdings_snapshot (user_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS trade_history (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ticker       TEXT NOT NULL,
  side         TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  quantity     NUMERIC NOT NULL,
  price        NUMERIC NOT NULL,
  segment      TEXT NOT NULL DEFAULT 'equity' CHECK (segment IN ('equity', 'fno')),
  executed_at  TIMESTAMPTZ NOT NULL,
  broker_trade_id TEXT,
  UNIQUE (user_id, broker_trade_id)
);
CREATE INDEX IF NOT EXISTS trade_history_user_time_idx ON trade_history (user_id, executed_at DESC);

CREATE TABLE IF NOT EXISTS briefs (
  id                     BIGSERIAL PRIMARY KEY,
  user_id                BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  generated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  market_summary_html    TEXT NOT NULL,
  portfolio_section_html TEXT NOT NULL,
  risk_flags             JSONB NOT NULL DEFAULT '[]',
  sent_at                TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS briefs_user_time_idx ON briefs (user_id, generated_at DESC);

CREATE TABLE IF NOT EXISTS journal_summaries (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  week_end   DATE NOT NULL,
  flags      JSONB NOT NULL DEFAULT '[]',
  sent_at    TIMESTAMPTZ,
  UNIQUE (user_id, week_start)
);

CREATE TABLE IF NOT EXISTS risk_thresholds (
  id                       BIGSERIAL PRIMARY KEY,
  user_id                  BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  sector_concentration_pct NUMERIC NOT NULL DEFAULT 30,
  correlation_threshold    NUMERIC NOT NULL DEFAULT 0.7,
  margin_utilization_pct   NUMERIC NOT NULL DEFAULT 70
);

-- Shared market context, generated once per run and reused across all users' briefs.
CREATE TABLE IF NOT EXISTS market_context (
  id           BIGSERIAL PRIMARY KEY,
  run_date     DATE NOT NULL UNIQUE,
  summary_html TEXT NOT NULL,
  summary_text TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Daily close prices for correlation computation (90-day rolling window).
CREATE TABLE IF NOT EXISTS daily_prices (
  ticker     TEXT NOT NULL,
  price_date DATE NOT NULL,
  close      NUMERIC NOT NULL,
  PRIMARY KEY (ticker, price_date)
);
