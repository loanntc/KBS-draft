-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 002: AI Features + Schema Corrections
-- Canonical source: data-dictionary.md + data-enum.md + m02/m03 BE specs
-- Adds: new enums, missing columns, proper attachment tables, AI debate/Q&A tables
-- Note: Table renames and enum value migrations are in 003_schema_align.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── New Enums ────────────────────────────────────────────────────────────────

-- account_type_enum: m02 BE spec §2.1
CREATE TYPE account_type_enum AS ENUM (
  'REGULAR',
  'EXPERT',
  'AI_KAY'
);

-- account_subtype_enum: m02 BE spec §2.1, §5.1 FeedFetcher filter
CREATE TYPE account_subtype_enum AS ENUM (
  'AI_KAY_ANALYTIC',
  'AI_KAY_NEWS',
  'AI_KAY_AGGRESSIVE',
  'AI_KAY_DEFENSIVE',
  'CREATOR',
  'USER_AMBASSADOR',
  'YOUTUBER',
  'PRIMCLUB_CREATOR'
);

-- account_badge_enum: m02 BE spec §2.1 — shown on post cards
CREATE TYPE account_badge_enum AS ENUM (
  'VERIFIED',
  'BULB',
  'YOUTUBE',
  'AI'
);

-- feed_visibility_enum: m02 BE spec §2.1 — FOLLOWING tab privacy (BR-M02-008)
CREATE TYPE feed_visibility_enum AS ENUM (
  'PUBLIC',
  'PRIVATE'
);

-- debate_status_enum: m02 BE spec §4.5 (API returns 'ACTIVE' or 'PAST')
CREATE TYPE debate_status_enum AS ENUM (
  'DRAFT',
  'ACTIVE',
  'PAST'
);

-- tag_type_enum: data-enum.md PostTagTypeEnum + m02 §5.4.3 AI_KAY_TOPIC
-- Note: 001 schema has CHECK('stock','theme') lowercase — fixed in 003
CREATE TYPE tag_type_enum AS ENUM (
  'STOCK',
  'THEME',
  'DEFAULT',
  'AI_KAY',
  'AI_KAY_TOPIC'   -- m02 §5.4.3: system tag routing to AI·Expert tab
);

-- asset_category_enum: data-enum.md ReturnRateCategoryEnum
CREATE TYPE asset_category_enum AS ENUM (
  'TOTAL',
  'STOCK',
  'FINANCIAL_PRODUCT'
);

-- color_flag_enum: data-enum.md ColorFlagEnum
CREATE TYPE color_flag_enum AS ENUM (
  'POSITIVE',
  'NEGATIVE',
  'ZERO'
);

-- image_scan_status_enum: data-enum.md ImageScanStatusEnum
CREATE TYPE image_scan_status_enum AS ENUM (
  'PENDING',
  'PASSED',
  'FLAGGED',
  'QUARANTINED'
);

-- ai_risk_grade_enum: data-enum.md AiRiskGradeEnum
CREATE TYPE ai_risk_grade_enum AS ENUM (
  'NORMAL',
  'WARNING',
  'CRITICAL'
);

-- ─── community_users: add account type + privacy columns ─────────────────────
-- Note: table renamed community_users → community_members in 003

ALTER TABLE community_users
  ADD COLUMN account_type    account_type_enum    NOT NULL DEFAULT 'REGULAR',
  ADD COLUMN account_subtype account_subtype_enum,           -- NULL for REGULAR
  ADD COLUMN account_badge   account_badge_enum,             -- NULL for REGULAR
  ADD COLUMN feed_visibility feed_visibility_enum NOT NULL DEFAULT 'PUBLIC';

-- Backfill: existing is_expert = true → EXPERT
UPDATE community_users SET account_type = 'EXPERT' WHERE is_expert = TRUE;

-- feed_visibility supersedes feed_public boolean from 001; backfill + drop
UPDATE community_users SET feed_visibility = 'PRIVATE' WHERE feed_public = FALSE;
ALTER TABLE community_users DROP COLUMN feed_public;

CREATE INDEX idx_community_users_account_type    ON community_users(account_type);
CREATE INDEX idx_community_users_account_subtype ON community_users(account_subtype) WHERE account_subtype IS NOT NULL;
CREATE INDEX idx_community_users_feed_visibility ON community_users(feed_visibility);

-- ─── posts: add missing required columns ─────────────────────────────────────
-- data-dictionary.md community_posts entity (fields absent from 001)

ALTER TABLE posts
  ADD COLUMN is_deleted               BOOLEAN       NOT NULL DEFAULT FALSE,
  ADD COLUMN title                    TEXT,
  ADD COLUMN has_multiple_attachments BOOLEAN       NOT NULL DEFAULT FALSE,
  ADD COLUMN report_count             INTEGER       NOT NULL DEFAULT 0,
  ADD COLUMN popularity_score         DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN ai_hashtag_enabled       BOOLEAN       NOT NULL DEFAULT TRUE,
  ADD COLUMN ai_hashtags              VARCHAR[],
  ADD COLUMN attachment_order         UUID[],
  ADD COLUMN market_type              VARCHAR(4) CHECK (market_type IN ('US','KR','BOTH')),
  ADD COLUMN content_tier             VARCHAR(6)  CHECK (content_tier IN ('FREE','PAID'));

CREATE INDEX idx_posts_is_deleted       ON posts(is_deleted) WHERE is_deleted = FALSE;
CREATE INDEX idx_posts_popularity_score ON posts(popularity_score DESC) WHERE status = 'PUBLISHED';

-- ─── post_topic_tags: fix field names + add missing columns ──────────────────
-- data-dictionary.md post_topic_tags entity

ALTER TABLE post_topic_tags
  RENAME COLUMN value TO tag_value;

ALTER TABLE post_topic_tags
  ADD COLUMN has_shareholder_badge BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN display_order         INTEGER NOT NULL DEFAULT 1;

-- Fix tag_type: drop old CHECK constraint, apply new enum
ALTER TABLE post_topic_tags DROP CONSTRAINT post_topic_tags_tag_type_check;
ALTER TABLE post_topic_tags ALTER COLUMN tag_type TYPE VARCHAR(20);
-- Apply the new enum (created above)
ALTER TABLE post_topic_tags
  ALTER COLUMN tag_type TYPE tag_type_enum USING tag_type::tag_type_enum;

-- Update constraint to match data-dictionary max 3 tags per post
ALTER TABLE post_topic_tags
  ADD CONSTRAINT post_topic_tags_display_order_check CHECK (display_order BETWEEN 1 AND 3);

-- ─── post_image_attachments ───────────────────────────────────────────────────
-- data-dictionary.md post_image_attachments entity
-- 001 stores images as TEXT[] inline on posts — migrate and drop

CREATE TABLE post_image_attachments (
  attachment_id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id             UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  storage_url         VARCHAR(1000) NOT NULL,
  display_order       INTEGER NOT NULL,
  safety_scan_status  image_scan_status_enum NOT NULL DEFAULT 'PASSED',
  size_bytes          INTEGER,
  mime_type           VARCHAR(50)
);

CREATE INDEX idx_post_image_post_id ON post_image_attachments(post_id);

-- Migrate existing images[] array data to the new table
INSERT INTO post_image_attachments (post_id, storage_url, display_order)
SELECT id, unnest(images), generate_subscripts(images, 1)
FROM posts
WHERE images IS NOT NULL AND array_length(images, 1) > 0;

-- Drop inline column after migration
ALTER TABLE posts DROP COLUMN images;
ALTER TABLE posts DROP COLUMN link_url;
ALTER TABLE posts DROP COLUMN link_meta;
ALTER TABLE posts DROP COLUMN repost_parent_id;

ALTER TABLE post_image_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "post_image_read" ON post_image_attachments FOR SELECT
  USING (EXISTS (SELECT 1 FROM community_users cu WHERE cu.user_id = auth.uid()));

-- ─── post_url_link_attachments ────────────────────────────────────────────────
-- data-dictionary.md post_url_link_attachments entity

CREATE TABLE post_url_link_attachments (
  attachment_id     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id           UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  original_url      VARCHAR(2000) NOT NULL,
  meta_title        VARCHAR(500),
  meta_description  VARCHAR(1000),
  meta_image_url    VARCHAR(2000),
  display_order     INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_post_url_link_post_id ON post_url_link_attachments(post_id);

ALTER TABLE post_url_link_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "post_url_link_read" ON post_url_link_attachments FOR SELECT
  USING (EXISTS (SELECT 1 FROM community_users cu WHERE cu.user_id = auth.uid()));

-- ─── post_youtube_link_attachments ───────────────────────────────────────────
-- data-dictionary.md post_youtube_link_attachments entity (max 1 per post)

CREATE TABLE post_youtube_link_attachments (
  attachment_id  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id        UUID NOT NULL UNIQUE REFERENCES posts(id) ON DELETE CASCADE,
  youtube_url    VARCHAR(500) NOT NULL,
  video_id       VARCHAR(20) NOT NULL,
  thumbnail_url  VARCHAR(500),
  video_title    VARCHAR(500)
);

CREATE INDEX idx_post_youtube_post_id ON post_youtube_link_attachments(post_id);

ALTER TABLE post_youtube_link_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "post_youtube_read" ON post_youtube_link_attachments FOR SELECT
  USING (EXISTS (SELECT 1 FROM community_users cu WHERE cu.user_id = auth.uid()));

-- ─── post_repost_attachments ─────────────────────────────────────────────────
-- data-dictionary.md post_repost_attachments entity (replaces repost_parent_id inline)

CREATE TABLE post_repost_attachments (
  attachment_id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id                      UUID NOT NULL UNIQUE REFERENCES posts(id) ON DELETE CASCADE,
  original_post_id             UUID NOT NULL REFERENCES posts(id) ON DELETE RESTRICT,
  original_author_member_key   VARCHAR(100) NOT NULL,
  original_author_nickname     VARCHAR(100) NOT NULL,
  original_body_snapshot       TEXT NOT NULL
);

CREATE INDEX idx_post_repost_post_id          ON post_repost_attachments(post_id);
CREATE INDEX idx_post_repost_original_post_id ON post_repost_attachments(original_post_id);

ALTER TABLE post_repost_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "post_repost_read" ON post_repost_attachments FOR SELECT
  USING (EXISTS (SELECT 1 FROM community_users cu WHERE cu.user_id = auth.uid()));

-- ─── post_polls + post_poll_options + poll_votes ──────────────────────────────
-- data-dictionary.md entities (replaces vote_options + vote_records from 001)
-- 001 has vote_options (post_id FK, no poll entity) — replaced by proper 2-level structure

CREATE TABLE post_polls (
  poll_id     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id     UUID NOT NULL UNIQUE REFERENCES posts(id) ON DELETE CASCADE,
  poll_title  VARCHAR(100),
  expires_at  TIMESTAMPTZ NOT NULL,
  total_votes INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_post_polls_post_id    ON post_polls(post_id);
CREATE INDEX idx_post_polls_expires_at ON post_polls(expires_at);

-- Create one poll record per existing post that has vote_options
INSERT INTO post_polls (post_id, expires_at)
SELECT DISTINCT post_id, NOW() + INTERVAL '7 days'  -- default expiry for migrated polls
FROM vote_options;

CREATE TABLE post_poll_options (
  option_id     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  poll_id       UUID NOT NULL REFERENCES post_polls(poll_id) ON DELETE CASCADE,
  label         VARCHAR(20) NOT NULL,
  display_order INTEGER NOT NULL,
  vote_count    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_post_poll_options_poll_id ON post_poll_options(poll_id);

-- Migrate vote_options → post_poll_options
INSERT INTO post_poll_options (poll_id, label, display_order, vote_count)
SELECT pp.poll_id, vo.label, vo.sort_order, vo.vote_count
FROM vote_options vo
JOIN post_polls pp ON pp.post_id = vo.post_id;

-- poll_votes: includes updated_at for vote-change tracking (data-dictionary spec)
CREATE TABLE poll_votes (
  poll_id    UUID NOT NULL REFERENCES post_polls(poll_id) ON DELETE CASCADE,
  option_id  UUID NOT NULL REFERENCES post_poll_options(option_id) ON DELETE CASCADE,
  voter_id   UUID NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (poll_id, voter_id)   -- one vote per user per poll; UPDATE on vote change
);

CREATE INDEX idx_poll_votes_poll_id  ON poll_votes(poll_id);
CREATE INDEX idx_poll_votes_voter_id ON poll_votes(voter_id);

-- Migrate vote_records → poll_votes
-- vote_records has (post_id, option_id, voter_id); need to lookup poll_id
INSERT INTO poll_votes (poll_id, option_id, voter_id, created_at)
SELECT pp.poll_id, ppo.option_id, vr.voter_id, vr.created_at
FROM vote_records vr
JOIN vote_options vo ON vo.id = vr.option_id
JOIN post_polls pp ON pp.post_id = vr.post_id
JOIN post_poll_options ppo ON ppo.poll_id = pp.poll_id AND ppo.label = vo.label
ON CONFLICT (poll_id, voter_id) DO NOTHING;

-- Trigger: update poll option vote_count and poll total_votes
-- Handles INSERT (new vote), DELETE (cancel vote), UPDATE (vote change)
CREATE OR REPLACE FUNCTION update_poll_vote_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE post_poll_options SET vote_count = vote_count + 1 WHERE option_id = NEW.option_id;
    UPDATE post_polls SET total_votes = total_votes + 1 WHERE poll_id = NEW.poll_id;

  ELSIF TG_OP = 'DELETE' THEN
    UPDATE post_poll_options SET vote_count = GREATEST(0, vote_count - 1) WHERE option_id = OLD.option_id;
    UPDATE post_polls SET total_votes = GREATEST(0, total_votes - 1) WHERE poll_id = OLD.poll_id;

  ELSIF TG_OP = 'UPDATE' AND OLD.option_id IS DISTINCT FROM NEW.option_id THEN
    -- Vote changed to a different option — net zero on total_votes
    UPDATE post_poll_options SET vote_count = GREATEST(0, vote_count - 1) WHERE option_id = OLD.option_id;
    UPDATE post_poll_options SET vote_count = vote_count + 1 WHERE option_id = NEW.option_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER poll_votes_count_trigger
  AFTER INSERT OR UPDATE OF option_id OR DELETE ON poll_votes
  FOR EACH ROW EXECUTE FUNCTION update_poll_vote_counts();

ALTER TABLE post_polls         ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_poll_options  ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_votes         ENABLE ROW LEVEL SECURITY;

CREATE POLICY "post_polls_read"        ON post_polls FOR SELECT
  USING (EXISTS (SELECT 1 FROM community_users cu WHERE cu.user_id = auth.uid()));
CREATE POLICY "post_poll_options_read" ON post_poll_options FOR SELECT
  USING (EXISTS (SELECT 1 FROM community_users cu WHERE cu.user_id = auth.uid()));
CREATE POLICY "poll_votes_read"        ON poll_votes FOR SELECT
  USING (EXISTS (SELECT 1 FROM community_users cu WHERE cu.user_id = auth.uid()));
CREATE POLICY "poll_votes_manage_own"  ON poll_votes FOR ALL
  USING (EXISTS (SELECT 1 FROM community_users cu WHERE cu.user_id = auth.uid()));

-- ─── post_return_rate_attachments + post_return_rate_items ───────────────────
-- data-dictionary.md entities — PK is return_attachment_id (not attachment_id)

CREATE TABLE post_return_rate_attachments (
  return_attachment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id              UUID NOT NULL UNIQUE REFERENCES posts(id) ON DELETE CASCADE,
  snapshot_taken_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_post_return_rate_post_id ON post_return_rate_attachments(post_id);

-- Create one return_rate_attachment record per existing profit_rate_items post
INSERT INTO post_return_rate_attachments (post_id, snapshot_taken_at)
SELECT DISTINCT post_id, snapshot_at FROM profit_rate_items;

CREATE TABLE post_return_rate_items (
  item_id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_attachment_id UUID NOT NULL REFERENCES post_return_rate_attachments(return_attachment_id) ON DELETE CASCADE,
  asset_category       asset_category_enum NOT NULL DEFAULT 'STOCK',
  stock_name           VARCHAR(200) NOT NULL,
  ticker               VARCHAR(20),           -- US stocks only; NULL for KR stocks
  quantity             DECIMAL(18,6) NOT NULL,
  valuation_amount     DECIMAL(18,2) NOT NULL,   -- canonical field name (was evaluation_amount in 001)
  gain_loss_amount     DECIMAL(18,2) NOT NULL,   -- canonical field name (was unrealised_pnl in 001)
  return_rate_pct      DECIMAL(10,4) NOT NULL,   -- canonical field name (was return_rate in 001)
  color_flag           color_flag_enum NOT NULL DEFAULT 'ZERO',
  display_order        INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_post_return_rate_items_attachment ON post_return_rate_items(return_attachment_id);

-- Migrate profit_rate_items → post_return_rate_items
INSERT INTO post_return_rate_items (
  return_attachment_id, stock_name, quantity,
  valuation_amount, gain_loss_amount, return_rate_pct,
  color_flag, display_order
)
SELECT
  pra.return_attachment_id,
  pri.stock_name,
  pri.quantity,
  pri.evaluation_amount,
  pri.unrealised_pnl,
  pri.return_rate,
  CASE WHEN pri.return_rate > 0 THEN 'POSITIVE'
       WHEN pri.return_rate < 0 THEN 'NEGATIVE'
       ELSE 'ZERO' END::color_flag_enum,
  ROW_NUMBER() OVER (PARTITION BY pri.post_id ORDER BY pri.evaluation_amount DESC)
FROM profit_rate_items pri
JOIN post_return_rate_attachments pra ON pra.post_id = pri.post_id;

ALTER TABLE post_return_rate_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_return_rate_items       ENABLE ROW LEVEL SECURITY;

CREATE POLICY "post_return_rate_read" ON post_return_rate_attachments FOR SELECT
  USING (EXISTS (SELECT 1 FROM community_users cu WHERE cu.user_id = auth.uid()));
CREATE POLICY "post_return_rate_items_read" ON post_return_rate_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM community_users cu WHERE cu.user_id = auth.uid()));

-- ─── score_config ─────────────────────────────────────────────────────────────
-- data-dictionary.md score_config entity with canonical seed data

CREATE TABLE score_config (
  key        VARCHAR(50) PRIMARY KEY,
  value      DECIMAL(10,4) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO score_config (key, value) VALUES
  ('likes_weight',        1.0),
  ('comments_weight',     3.0),
  ('scraps_weight',       5.0),
  ('reposts_weight',      8.0),
  ('shares_weight',       10.0),
  ('recency_multiplier',  1.5),
  ('recency_window_hours', 24.0);

-- ─── AI 투자 토론 (Daily Debate) — m02 BE spec §4.5 ──────────────────────────

CREATE TABLE ai_investment_debates (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date                    DATE NOT NULL UNIQUE,
  topic                   VARCHAR(100) NOT NULL,
  status                  debate_status_enum NOT NULL DEFAULT 'DRAFT',
  symbol_id               VARCHAR(30),
  -- 공격형 케이 (column names match API response field names)
  aggressive_k_title      VARCHAR(25) NOT NULL,
  aggressive_k_rationale  JSONB,           -- array of strings; null until user votes
  -- 안정형 케이
  defensive_k_title       VARCHAR(25) NOT NULL,
  defensive_k_rationale   JSONB,
  -- Vote tallies
  aggressive_k_vote_count INTEGER NOT NULL DEFAULT 0,
  defensive_k_vote_count  INTEGER NOT NULL DEFAULT 0,
  participant_count        INTEGER NOT NULL DEFAULT 0,
  -- Engagement
  like_count              INTEGER NOT NULL DEFAULT 0,
  comment_count           INTEGER NOT NULL DEFAULT 0,
  -- Result
  actual_price_change     DECIMAL(8,4),
  -- Admin
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

CREATE TABLE debate_votes (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  debate_id  UUID NOT NULL REFERENCES ai_investment_debates(id) ON DELETE CASCADE,
  voter_id   UUID NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
  side       VARCHAR(15) NOT NULL CHECK (side IN ('aggressive_k', 'defensive_k')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (debate_id, voter_id)
);

CREATE INDEX idx_debate_votes_debate_id ON debate_votes(debate_id);
CREATE INDEX idx_debate_votes_voter_id  ON debate_votes(voter_id);

CREATE OR REPLACE FUNCTION update_debate_vote_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE ai_investment_debates SET
      aggressive_k_vote_count = aggressive_k_vote_count + CASE WHEN NEW.side = 'aggressive_k' THEN 1 ELSE 0 END,
      defensive_k_vote_count  = defensive_k_vote_count  + CASE WHEN NEW.side = 'defensive_k'  THEN 1 ELSE 0 END,
      participant_count        = participant_count + 1,
      updated_at               = NOW()
    WHERE id = NEW.debate_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE ai_investment_debates SET
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
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id             UUID NOT NULL UNIQUE REFERENCES posts(id) ON DELETE CASCADE,
  status              VARCHAR(20) NOT NULL DEFAULT 'PROCESSING'
                        CHECK (status IN ('PROCESSING','COMPLETE','REJECTED')),
  aggressive_brief    JSONB,
  aggressive_detailed JSONB,
  defensive_brief     JSONB,
  defensive_detailed  JSONB,
  disclaimer          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_post_ai_qa_post_id ON post_ai_qa(post_id);
CREATE TRIGGER post_ai_qa_updated_at BEFORE UPDATE ON post_ai_qa FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Direct AI Q&A Interactions ───────────────────────────────────────────────

CREATE TABLE ai_qa_interactions (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
  question         TEXT NOT NULL,
  status           VARCHAR(20) NOT NULL DEFAULT 'PROCESSING'
                     CHECK (status IN ('PROCESSING','COMPLETE','REJECTED','ERROR')),
  aggressive_answer JSONB,
  defensive_answer  JSONB,
  disclaimer        TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_qa_user_id    ON ai_qa_interactions(user_id);
CREATE INDEX idx_ai_qa_created_at ON ai_qa_interactions(created_at DESC);
CREATE TRIGGER ai_qa_interactions_updated_at BEFORE UPDATE ON ai_qa_interactions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── scraps: add is_private flag (data-dictionary.md post_scraps entity) ─────

ALTER TABLE scraps ADD COLUMN is_private BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── RLS for new m02 tables ───────────────────────────────────────────────────

ALTER TABLE ai_investment_debates ENABLE ROW LEVEL SECURITY;
ALTER TABLE debate_votes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_ai_qa            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_qa_interactions    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_debates_read" ON ai_investment_debates FOR SELECT
  USING (status IN ('ACTIVE','PAST') AND EXISTS (SELECT 1 FROM community_users cu WHERE cu.user_id = auth.uid()));

CREATE POLICY "debate_votes_read"        ON debate_votes FOR SELECT
  USING (EXISTS (SELECT 1 FROM community_users cu WHERE cu.user_id = auth.uid()));
CREATE POLICY "debate_votes_manage_own"  ON debate_votes FOR ALL
  USING (EXISTS (SELECT 1 FROM community_users cu WHERE cu.user_id = auth.uid()));

CREATE POLICY "post_ai_qa_read" ON post_ai_qa FOR SELECT
  USING (status = 'COMPLETE' AND EXISTS (SELECT 1 FROM community_users cu WHERE cu.user_id = auth.uid()));

CREATE POLICY "ai_qa_interactions_own" ON ai_qa_interactions FOR ALL
  USING (EXISTS (SELECT 1 FROM community_users cu WHERE cu.user_id = auth.uid()));
