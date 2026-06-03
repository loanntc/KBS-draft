-- ─────────────────────────────────────────────────────────────────────────────
-- KB Securities M-able Community — Migration 002: AI Features + Schema Fixes
-- Corrected against m03-overview-be.md (canonical spec for post/member data model)
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── New Enums ───────────────────────────────────────────────────────────────

-- account_type_enum: maps to spec §2.1 of m02-overview-be.md
CREATE TYPE account_type_enum AS ENUM (
  'REGULAR',   -- Normal community member
  'EXPERT',    -- Human creator / User Ambassador / YouTuber / PrimeClub creator
  'AI_KAY'     -- AI Kay personas (분析형 케이, 뉴스형 케이)
);

-- account_subtype_enum: maps to spec §2.1 (m02) + §5.1 FeedFetcher filter
CREATE TYPE account_subtype_enum AS ENUM (
  'AI_KAY_ANALYTIC',      -- 분석형 케이 (AI_KAY type)
  'AI_KAY_NEWS',          -- 뉴스형 케이 (AI_KAY type)
  'AI_KAY_AGGRESSIVE',    -- 공격형 케이 — used in AI 투자 토론
  'AI_KAY_DEFENSIVE',     -- 안정형 케이 — used in AI 투자 토론
  'CREATOR',              -- Selected investment content creator (EXPERT type)
  'USER_AMBASSADOR',      -- Community User Ambassador (EXPERT type)
  'YOUTUBER',             -- Investment YouTuber (EXPERT type)
  'PRIMCLUB_CREATOR'      -- PrimeClub exclusive creator (EXPERT type)
);

-- account_badge_enum: visual badge shown on post cards and profiles
CREATE TYPE account_badge_enum AS ENUM (
  'VERIFIED',   -- Blue check — CREATOR, PRIMCLUB_CREATOR
  'BULB',       -- Bulb icon — USER_AMBASSADOR
  'YOUTUBE',    -- Play icon — YOUTUBER
  'AI'          -- AI icon — all AI_KAY_* subtypes
);

-- feed_visibility_enum: m02 §2.1 — FOLLOWING tab privacy gate (BR-M02-008)
CREATE TYPE feed_visibility_enum AS ENUM (
  'PUBLIC',    -- Visible in followers' FOLLOWING feed (default)
  'PRIVATE'    -- Excluded from FOLLOWING feeds
);

-- debate_status_enum: m02 §4.5 — API returns 'ACTIVE' or 'PAST' (not ENDED)
CREATE TYPE debate_status_enum AS ENUM (
  'DRAFT',     -- Created by admin, not yet published
  'ACTIVE',    -- Open for voting (00:00–23:59)
  'PAST'       -- Closed; actual_price_change may be populated
);

-- ─── community_members: add account type + privacy columns ───────────────────
-- NOTE: 001 schema uses 'community_users'; 003 migration renames to 'community_members'
-- These ALTER TABLE commands run against 'community_users' (current name in 001).
-- After 003 runs, the table will be 'community_members'. Both names work during transition.

ALTER TABLE community_users
  ADD COLUMN account_type      account_type_enum     NOT NULL DEFAULT 'REGULAR',
  ADD COLUMN account_subtype   account_subtype_enum,                             -- NULL for REGULAR members
  ADD COLUMN account_badge     account_badge_enum,                               -- NULL for REGULAR members
  ADD COLUMN feed_visibility   feed_visibility_enum  NOT NULL DEFAULT 'PUBLIC';

-- Backfill: existing is_expert = true → account_type EXPERT (subtype set by admin)
UPDATE community_users SET account_type = 'EXPERT' WHERE is_expert = TRUE;

-- feed_visibility supersedes the boolean feed_public column from 001
-- Backfill and then drop the old column
UPDATE community_users SET feed_visibility = 'PRIVATE' WHERE feed_public = FALSE;
ALTER TABLE community_users DROP COLUMN feed_public;

CREATE INDEX idx_community_users_account_type    ON community_users(account_type);
CREATE INDEX idx_community_users_account_subtype ON community_users(account_subtype) WHERE account_subtype IS NOT NULL;
CREATE INDEX idx_community_users_feed_visibility ON community_users(feed_visibility);

-- ─── posts: add missing columns (were in TypeScript types, absent from DDL) ──
-- NOTE: 003 migration renames this table to 'community_posts'

ALTER TABLE posts
  ADD COLUMN is_deleted               BOOLEAN  NOT NULL DEFAULT FALSE,
  ADD COLUMN title                    TEXT,
  ADD COLUMN has_multiple_attachments BOOLEAN  NOT NULL DEFAULT FALSE,
  ADD COLUMN report_count             INTEGER  NOT NULL DEFAULT 0,
  ADD COLUMN popularity_score         DECIMAL(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN market_type              VARCHAR(4) CHECK (market_type IN ('US', 'KR', 'BOTH')),
  ADD COLUMN content_tier             VARCHAR(6)  CHECK (content_tier IN ('FREE', 'PAID'));

CREATE INDEX idx_posts_is_deleted       ON posts(is_deleted) WHERE is_deleted = FALSE;
CREATE INDEX idx_posts_popularity_score ON posts(popularity_score DESC) WHERE status = 'PUBLISHED';

-- ─── post_topic_tags: fix field name + add missing columns ───────────────────
-- 001 schema has `value VARCHAR(100)` and a CHECK constraint with lowercase values.
-- m03 spec §2.5 defines: tag_value, tag_type ENUM(STOCK/THEME/DEFAULT/AI_KAY), has_shareholder_badge, display_order

ALTER TABLE post_topic_tags
  RENAME COLUMN value TO tag_value;

ALTER TABLE post_topic_tags
  ADD COLUMN has_shareholder_badge BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN display_order         INTEGER NOT NULL DEFAULT 1;

-- Replace the old CHECK constraint with a proper enum
ALTER TABLE post_topic_tags DROP CONSTRAINT post_topic_tags_tag_type_check;
ALTER TABLE post_topic_tags ALTER COLUMN tag_type TYPE VARCHAR(20);

-- Create the proper tag_type enum and apply it
CREATE TYPE tag_type_enum AS ENUM (
  'STOCK',     -- Specific stock ticker/name
  'THEME',     -- One of 5 fixed theme communities
  'DEFAULT',   -- 'KB Financial' fallback
  'AI_KAY'     -- System-assigned to AI Kay posts ('AI_KAY_ANALYSIS')
  -- Note: AI_KAY_TOPIC (m02 §5.4.3 system tag) should be added when m03 confirms support
);

ALTER TABLE post_topic_tags
  ALTER COLUMN tag_type TYPE tag_type_enum USING tag_type::tag_type_enum;

-- ─── POLL Tables (m03 §2.7) ──────────────────────────────────────────────────
-- 001 schema has vote_options with post_id FK (no proper poll entity).
-- m03 defines: post_polls → post_poll_options, votes in poll_votes.

CREATE TABLE post_polls (
  poll_id     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id     UUID NOT NULL UNIQUE REFERENCES posts(id) ON DELETE CASCADE,
  poll_title  VARCHAR(100),                          -- Optional poll question
  expires_at  TIMESTAMPTZ NOT NULL,                  -- Mandatory (BR-11: min +1h, max +7d)
  total_votes INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_post_polls_post_id    ON post_polls(post_id);
CREATE INDEX idx_post_polls_expires_at ON post_polls(expires_at);

CREATE TABLE post_poll_options (
  option_id     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  poll_id       UUID NOT NULL REFERENCES post_polls(poll_id) ON DELETE CASCADE,
  label         VARCHAR(20) NOT NULL,               -- Max 20 chars (Korean)
  display_order INTEGER NOT NULL,                   -- 1-indexed; min 2, max 15 options
  vote_count    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_post_poll_options_poll_id ON post_poll_options(poll_id);

-- poll_votes: per-user vote record (mutable — user can change or cancel)
CREATE TABLE poll_votes (
  vote_id    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  poll_id    UUID NOT NULL REFERENCES post_polls(poll_id) ON DELETE CASCADE,
  option_id  UUID NOT NULL REFERENCES post_poll_options(option_id) ON DELETE CASCADE,
  voter_id   UUID NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (poll_id, voter_id)   -- one vote per user per poll
);

CREATE INDEX idx_poll_votes_poll_id   ON poll_votes(poll_id);
CREATE INDEX idx_poll_votes_voter_id  ON poll_votes(voter_id);

-- Trigger: update option vote_count and poll total_votes
CREATE OR REPLACE FUNCTION update_poll_vote_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE post_poll_options SET vote_count = vote_count + 1 WHERE option_id = NEW.option_id;
    UPDATE post_polls SET total_votes = total_votes + 1 WHERE poll_id = NEW.poll_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE post_poll_options SET vote_count = GREATEST(0, vote_count - 1) WHERE option_id = OLD.option_id;
    UPDATE post_polls SET total_votes = GREATEST(0, total_votes - 1) WHERE poll_id = OLD.poll_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.option_id != NEW.option_id THEN
    -- Vote changed to different option
    UPDATE post_poll_options SET vote_count = GREATEST(0, vote_count - 1) WHERE option_id = OLD.option_id;
    UPDATE post_poll_options SET vote_count = vote_count + 1 WHERE option_id = NEW.option_id;
    -- total_votes unchanged on vote change (net zero)
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER poll_votes_count_trigger
  AFTER INSERT OR UPDATE OR DELETE ON poll_votes
  FOR EACH ROW EXECUTE FUNCTION update_poll_vote_counts();

-- ─── Return Rate Tables (m03 §2.8) ───────────────────────────────────────────
-- 001 has a flat `profit_rate_items` table. m03 defines a two-level structure.

CREATE TYPE asset_category_enum AS ENUM ('TOTAL', 'STOCK', 'FINANCIAL_PRODUCT');
CREATE TYPE color_flag_enum AS ENUM ('POSITIVE', 'NEGATIVE', 'ZERO');

CREATE TABLE post_return_rate_attachments (
  attachment_id    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id          UUID NOT NULL UNIQUE REFERENCES posts(id) ON DELETE CASCADE,
  snapshot_taken_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_post_return_rate_post_id ON post_return_rate_attachments(post_id);

CREATE TABLE post_return_rate_items (
  item_id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  attachment_id     UUID NOT NULL REFERENCES post_return_rate_attachments(attachment_id) ON DELETE CASCADE,
  asset_category    asset_category_enum NOT NULL DEFAULT 'STOCK',
  stock_code        VARCHAR(20),
  stock_name        VARCHAR(100) NOT NULL,
  logo_url          TEXT,
  quantity          DECIMAL(18,6) NOT NULL,
  valuation_amount  BIGINT NOT NULL,          -- m03 field name (001 uses evaluation_amount)
  gain_loss_amount  BIGINT NOT NULL,           -- m03 field name (001 uses unrealised_pnl)
  return_rate_pct   DECIMAL(10,4) NOT NULL,    -- m03 field name (001 uses return_rate)
  color_flag        color_flag_enum NOT NULL DEFAULT 'ZERO',
  display_order     INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_post_return_rate_items_attachment ON post_return_rate_items(attachment_id);

-- ─── AI 투자 토론 (Daily Debate) — corrected column names ─────────────────────
-- Column names aligned with m02-overview-be.md §4.5 response schema.
-- _k_ infix in column names matches the API response field names (aggressive_k_title etc.)

CREATE TABLE ai_investment_debates (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date                    DATE NOT NULL UNIQUE,          -- spec field: 'date' (not debate_date)
  topic                   VARCHAR(100) NOT NULL,          -- Debate question (max 30 chars displayed)
  status                  debate_status_enum NOT NULL DEFAULT 'DRAFT',
  symbol_id               VARCHAR(30),                    -- Optional: stock this debate is about

  -- 공격형 케이 position (column name matches API response key)
  aggressive_k_title      VARCHAR(25) NOT NULL,           -- spec §4.5: max 25 chars
  aggressive_k_rationale  JSONB,                          -- array of strings; null until user votes

  -- 안정형 케이 position
  defensive_k_title       VARCHAR(25) NOT NULL,
  defensive_k_rationale   JSONB,                          -- null until user votes

  -- Denormalised vote tallies (updated by trigger)
  aggressive_k_vote_count INTEGER NOT NULL DEFAULT 0,
  defensive_k_vote_count  INTEGER NOT NULL DEFAULT 0,
  participant_count        INTEGER NOT NULL DEFAULT 0,

  -- Engagement
  like_count              INTEGER NOT NULL DEFAULT 0,
  comment_count           INTEGER NOT NULL DEFAULT 0,

  -- Result (set after market close by admin/job)
  actual_price_change     DECIMAL(8,4),                   -- e.g. +5.2; null until resolved

  -- Admin metadata
  approved_by             UUID REFERENCES community_users(id) ON DELETE SET NULL,
  published_at            TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_debates_date   ON ai_investment_debates(date DESC);
CREATE INDEX idx_ai_debates_status ON ai_investment_debates(status);

CREATE TRIGGER ai_investment_debates_updated_at
  BEFORE UPDATE ON ai_investment_debates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Debate Votes ─────────────────────────────────────────────────────────────

CREATE TABLE debate_votes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  debate_id   UUID NOT NULL REFERENCES ai_investment_debates(id) ON DELETE CASCADE,
  voter_id    UUID NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
  side        VARCHAR(15) NOT NULL CHECK (side IN ('aggressive_k', 'defensive_k')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (debate_id, voter_id)
);

CREATE INDEX idx_debate_votes_debate_id ON debate_votes(debate_id);
CREATE INDEX idx_debate_votes_voter_id  ON debate_votes(voter_id);

CREATE OR REPLACE FUNCTION update_debate_vote_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE ai_investment_debates
    SET
      aggressive_k_vote_count = aggressive_k_vote_count + CASE WHEN NEW.side = 'aggressive_k' THEN 1 ELSE 0 END,
      defensive_k_vote_count  = defensive_k_vote_count  + CASE WHEN NEW.side = 'defensive_k'  THEN 1 ELSE 0 END,
      participant_count        = participant_count + 1,
      updated_at               = NOW()
    WHERE id = NEW.debate_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE ai_investment_debates
    SET
      aggressive_k_vote_count = GREATEST(0, aggressive_k_vote_count - CASE WHEN OLD.side = 'aggressive_k' THEN 1 ELSE 0 END),
      defensive_k_vote_count  = GREATEST(0, defensive_k_vote_count  - CASE WHEN OLD.side = 'defensive_k'  THEN 1 ELSE 0 END),
      participant_count        = GREATEST(0, participant_count - 1),
      updated_at               = NOW()
    WHERE id = OLD.debate_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER debate_votes_count_trigger
  AFTER INSERT OR DELETE ON debate_votes
  FOR EACH ROW EXECUTE FUNCTION update_debate_vote_counts();

-- ─── @케이 Inline Q&A ─────────────────────────────────────────────────────────

CREATE TABLE post_ai_qa (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id         UUID NOT NULL UNIQUE REFERENCES posts(id) ON DELETE CASCADE,
  status          VARCHAR(20) NOT NULL DEFAULT 'PROCESSING'
                    CHECK (status IN ('PROCESSING', 'COMPLETE', 'REJECTED')),
  aggressive_brief    JSONB,   -- { 한줄요약, 오프닝, 근거, 전략, 결론 } condensed
  aggressive_detailed JSONB,
  defensive_brief     JSONB,
  defensive_detailed  JSONB,
  disclaimer          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_post_ai_qa_post_id ON post_ai_qa(post_id);

CREATE TRIGGER post_ai_qa_updated_at
  BEFORE UPDATE ON post_ai_qa FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Direct AI Q&A Interactions ───────────────────────────────────────────────

CREATE TABLE ai_qa_interactions (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
  question         TEXT NOT NULL,
  status           VARCHAR(20) NOT NULL DEFAULT 'PROCESSING'
                     CHECK (status IN ('PROCESSING', 'COMPLETE', 'REJECTED', 'ERROR')),
  aggressive_answer JSONB,   -- { answer, rationale, risk, strategy }
  defensive_answer  JSONB,
  disclaimer        TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_qa_user_id    ON ai_qa_interactions(user_id);
CREATE INDEX idx_ai_qa_created_at ON ai_qa_interactions(created_at DESC);

CREATE TRIGGER ai_qa_interactions_updated_at
  BEFORE UPDATE ON ai_qa_interactions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── scraps: add is_private flag (m03 §2.12) ─────────────────────────────────

ALTER TABLE scraps
  ADD COLUMN is_private BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── RLS for new tables ───────────────────────────────────────────────────────

ALTER TABLE ai_investment_debates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE debate_votes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_ai_qa                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_qa_interactions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_polls                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_poll_options          ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_votes                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_return_rate_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_return_rate_items     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_debates_read" ON ai_investment_debates FOR SELECT
  USING (status IN ('ACTIVE', 'PAST') AND EXISTS (SELECT 1 FROM community_users cu WHERE cu.user_id = auth.uid()));

CREATE POLICY "debate_votes_read" ON debate_votes FOR SELECT
  USING (EXISTS (SELECT 1 FROM community_users cu WHERE cu.user_id = auth.uid()));
CREATE POLICY "debate_votes_manage_own" ON debate_votes FOR ALL
  USING (voter_id = (SELECT id FROM community_users WHERE user_id = auth.uid()));

CREATE POLICY "post_ai_qa_read" ON post_ai_qa FOR SELECT
  USING (status = 'COMPLETE' AND EXISTS (SELECT 1 FROM community_users cu WHERE cu.user_id = auth.uid()));

CREATE POLICY "ai_qa_interactions_own" ON ai_qa_interactions FOR ALL
  USING (user_id = (SELECT id FROM community_users WHERE user_id = auth.uid()));

CREATE POLICY "post_polls_read" ON post_polls FOR SELECT
  USING (EXISTS (SELECT 1 FROM community_users cu WHERE cu.user_id = auth.uid()));
CREATE POLICY "post_poll_options_read" ON post_poll_options FOR SELECT
  USING (EXISTS (SELECT 1 FROM community_users cu WHERE cu.user_id = auth.uid()));
CREATE POLICY "poll_votes_manage_own" ON poll_votes FOR ALL
  USING (voter_id = (SELECT id FROM community_users WHERE user_id = auth.uid()));
CREATE POLICY "poll_votes_read" ON poll_votes FOR SELECT
  USING (EXISTS (SELECT 1 FROM community_users cu WHERE cu.user_id = auth.uid()));

CREATE POLICY "post_return_rate_read" ON post_return_rate_attachments FOR SELECT
  USING (EXISTS (SELECT 1 FROM community_users cu WHERE cu.user_id = auth.uid()));
CREATE POLICY "post_return_rate_items_read" ON post_return_rate_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM community_users cu WHERE cu.user_id = auth.uid()));
