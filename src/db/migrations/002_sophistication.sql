-- Phase-1.5 additions: LLM cost tracking, brief feedback, Q&A audit log.

-- Per-call token usage. The unit economics (business plan §7) assume the
-- shared market context is served from prompt cache for users 2..N — this
-- table is how we verify that instead of assuming it.
CREATE TABLE IF NOT EXISTS llm_usage (
  id                    BIGSERIAL PRIMARY KEY,
  user_id               BIGINT REFERENCES users(id) ON DELETE SET NULL,
  purpose               TEXT NOT NULL CHECK (purpose IN ('market_context', 'user_brief', 'portfolio_qa')),
  model                 TEXT NOT NULL,
  input_tokens          INTEGER NOT NULL,
  output_tokens         INTEGER NOT NULL,
  cache_read_tokens     INTEGER NOT NULL DEFAULT 0,
  cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS llm_usage_day_idx ON llm_usage (created_at);
CREATE INDEX IF NOT EXISTS llm_usage_user_idx ON llm_usage (user_id, created_at);

-- One-click thumbs up/down from the brief email (signed links, no login).
CREATE TABLE IF NOT EXISTS brief_feedback (
  id         BIGSERIAL PRIMARY KEY,
  brief_id   BIGINT NOT NULL REFERENCES briefs(id) ON DELETE CASCADE,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score      TEXT NOT NULL CHECK (score IN ('up', 'down')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (brief_id, user_id)
);

-- Portfolio Q&A audit trail (question + answer, for compliance review).
CREATE TABLE IF NOT EXISTS qa_log (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question   TEXT NOT NULL,
  answer     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS qa_log_user_idx ON qa_log (user_id, created_at DESC);

-- Instrument token cache for Kite historical price ingestion.
CREATE TABLE IF NOT EXISTS instrument_tokens (
  ticker           TEXT PRIMARY KEY,
  instrument_token BIGINT NOT NULL,
  exchange         TEXT NOT NULL,
  refreshed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
