-- ─────────────────────────────────────────────────────────────────────────────
-- KB Securities M-able Community — Migration 002: AI Features + Schema Fixes
-- Adds: account_type, feed_visibility, AI debate tables, missing post columns
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── New Enums ───────────────────────────────────────────────────────────────

CREATE TYPE account_type_enum AS ENUM (
  'REGULAR',   -- Normal community member
  'EXPERT',    -- Human creator / User Ambassador / YouTuber / PrimeClub creator
  'AI_KAY'     -- AI personas (분석형 케이, 뉴스형 케이, etc.)
);

CREATE TYPE feed_visibility_enum AS ENUM (
  'PUBLIC',    -- Posts visible in FOLLOWING feeds of followers
  'PRIVATE'    -- Posts excluded from FOLLOWING feeds (BR-M02-008)
);

CREATE TYPE debate_status_enum AS ENUM (
  'DRAFT',     -- Created by admin, not yet published
  'ACTIVE',    -- Currently open for voting (00:00–23:59)
  'ENDED'      -- Voting closed; actual_price_change may be set
);

-- ─── community_users: add account_type + feed_visibility ─────────────────────
-- Keeps existing is_expert column for backward compatibility (G-03)

ALTER TABLE community_users
  ADD COLUMN account_type     account_type_enum    NOT NULL DEFAULT 'REGULAR',
  ADD COLUMN feed_visibility  feed_visibility_enum NOT NULL DEFAULT 'PUBLIC';

-- Backfill: existing experts keep account_type = EXPERT
UPDATE community_users SET account_type = 'EXPERT' WHERE is_expert = TRUE;

CREATE INDEX idx_community_users_account_type ON community_users(account_type);
CREATE INDEX idx_community_users_feed_visibility ON community_users(feed_visibility);

-- ─── posts: add missing columns (G-04) ───────────────────────────────────────
-- These columns exist in TypeScript types but were absent from the DDL

ALTER TABLE posts
  ADD COLUMN is_deleted              BOOLEAN  NOT NULL DEFAULT FALSE,
  ADD COLUMN title                   VARCHAR(200),
  ADD COLUMN has_multiple_attachments BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_posts_is_deleted ON posts(is_deleted) WHERE is_deleted = FALSE;

-- ─── AI 투자 토론 (Daily Debate) ────────────────────────────────────────────
-- One debate per day; created/approved via Admin Web (spec §2.3, §4.5)

CREATE TABLE ai_investment_debates (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  debate_date          DATE NOT NULL UNIQUE,        -- one per day
  topic                VARCHAR(100) NOT NULL,        -- debate question (max 30 chars displayed)
  status               debate_status_enum NOT NULL DEFAULT 'DRAFT',

  -- Aggressive K (공격형 케이) position
  aggressive_title     VARCHAR(50) NOT NULL,         -- short position statement
  aggressive_rationale TEXT,                         -- revealed after vote (null until voted)

  -- Defensive K (안정형 케이) position
  defensive_title      VARCHAR(50) NOT NULL,
  defensive_rationale  TEXT,                         -- revealed after vote (null until voted)

  -- Vote tallies (denormalised for performance)
  aggressive_vote_count INTEGER NOT NULL DEFAULT 0,
  defensive_vote_count  INTEGER NOT NULL DEFAULT 0,
  participant_count     INTEGER NOT NULL DEFAULT 0,

  -- Engagement
  like_count           INTEGER NOT NULL DEFAULT 0,
  comment_count        INTEGER NOT NULL DEFAULT 0,

  -- Result (set after market close)
  actual_price_change  DECIMAL(8,4),                 -- e.g. +5.2 or -3.1; null until resolved

  -- Admin metadata
  approved_by          UUID REFERENCES community_users(id) ON DELETE SET NULL,
  published_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_debates_date ON ai_investment_debates(debate_date DESC);
CREATE INDEX idx_ai_debates_status ON ai_investment_debates(status);

CREATE TRIGGER ai_investment_debates_updated_at
  BEFORE UPDATE ON ai_investment_debates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Debate Votes ────────────────────────────────────────────────────────────
-- Records each user's vote on a daily debate (one vote per user per debate)

CREATE TABLE debate_votes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  debate_id   UUID NOT NULL REFERENCES ai_investment_debates(id) ON DELETE CASCADE,
  voter_id    UUID NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
  side        VARCHAR(15) NOT NULL CHECK (side IN ('aggressive_k', 'defensive_k')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (debate_id, voter_id)   -- one vote per user per debate (can delete+re-insert to change)
);

CREATE INDEX idx_debate_votes_debate_id ON debate_votes(debate_id);
CREATE INDEX idx_debate_votes_voter_id ON debate_votes(voter_id);

-- Trigger: update vote counts on ai_investment_debates when votes change
CREATE OR REPLACE FUNCTION update_debate_vote_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE ai_investment_debates
    SET
      aggressive_vote_count = aggressive_vote_count + CASE WHEN NEW.side = 'aggressive_k' THEN 1 ELSE 0 END,
      defensive_vote_count  = defensive_vote_count  + CASE WHEN NEW.side = 'defensive_k'  THEN 1 ELSE 0 END,
      participant_count     = participant_count + 1,
      updated_at            = NOW()
    WHERE id = NEW.debate_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE ai_investment_debates
    SET
      aggressive_vote_count = GREATEST(0, aggressive_vote_count - CASE WHEN OLD.side = 'aggressive_k' THEN 1 ELSE 0 END),
      defensive_vote_count  = GREATEST(0, defensive_vote_count  - CASE WHEN OLD.side = 'defensive_k'  THEN 1 ELSE 0 END),
      participant_count     = GREATEST(0, participant_count - 1),
      updated_at            = NOW()
    WHERE id = OLD.debate_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER debate_votes_count_trigger
  AFTER INSERT OR DELETE ON debate_votes
  FOR EACH ROW EXECUTE FUNCTION update_debate_vote_counts();

-- ─── @케이 Inline Q&A (post_ai_qa) ──────────────────────────────────────────
-- Auto-generated when user writes @케이 in a community post body (spec §2.4, §5.5)

CREATE TABLE post_ai_qa (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id         UUID NOT NULL UNIQUE REFERENCES posts(id) ON DELETE CASCADE,
  status          VARCHAR(20) NOT NULL DEFAULT 'PROCESSING'
                    CHECK (status IN ('PROCESSING', 'COMPLETE', 'REJECTED')),
  -- 공격형 케이 brief/detailed answer (JSONB with 5 fields per spec §5.5)
  aggressive_brief    JSONB,   -- { 한줄요약, 오프닝, 근거, 전략, 결론 } condensed
  aggressive_detailed JSONB,   -- same fields, fully elaborated
  -- 안정형 케이 brief/detailed answer
  defensive_brief    JSONB,
  defensive_detailed JSONB,
  -- Shared disclaimer (same text for both personas)
  disclaimer      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_post_ai_qa_post_id ON post_ai_qa(post_id);
CREATE INDEX idx_post_ai_qa_status ON post_ai_qa(status);

CREATE TRIGGER post_ai_qa_updated_at
  BEFORE UPDATE ON post_ai_qa
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Direct AI Q&A Interactions (ai_qa_interactions) ─────────────────────────
-- Stored sessions from the dedicated AI Q&A screen (spec §4.7)

CREATE TABLE ai_qa_interactions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
  question    TEXT NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'PROCESSING'
                CHECK (status IN ('PROCESSING', 'COMPLETE', 'REJECTED', 'ERROR')),
  -- 4-field answers per persona (spec §4.7 answer structure)
  aggressive_answer   JSONB,   -- { answer, rationale, risk, strategy }
  defensive_answer    JSONB,
  disclaimer          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_qa_user_id ON ai_qa_interactions(user_id);
CREATE INDEX idx_ai_qa_created_at ON ai_qa_interactions(created_at DESC);

CREATE TRIGGER ai_qa_interactions_updated_at
  BEFORE UPDATE ON ai_qa_interactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Comment Likes (G-26: referenced in code but missing from DDL) ───────────
-- `likes` table already handles post likes; comment likes are a separate concern
-- Note: CommentSection.tsx references this as 'comment_likes', but existing
-- `likes` table already supports comment likes via comment_id FK.
-- Adding this as an alias/view approach; actual records go to `likes` table.
-- No new table needed — align code to use `likes` table for comment likes.

-- ─── RLS Policies for new tables ─────────────────────────────────────────────

ALTER TABLE ai_investment_debates ENABLE ROW LEVEL SECURITY;
ALTER TABLE debate_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_ai_qa ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_qa_interactions ENABLE ROW LEVEL SECURITY;

-- Debates: all authenticated community members can read ACTIVE/ENDED debates
CREATE POLICY "ai_debates_read" ON ai_investment_debates FOR SELECT
  USING (
    status IN ('ACTIVE', 'ENDED')
    AND EXISTS (SELECT 1 FROM community_users cu WHERE cu.user_id = auth.uid())
  );

-- Debate votes: members can manage their own votes
CREATE POLICY "debate_votes_read" ON debate_votes FOR SELECT
  USING (EXISTS (SELECT 1 FROM community_users cu WHERE cu.user_id = auth.uid()));

CREATE POLICY "debate_votes_manage_own" ON debate_votes FOR ALL
  USING (voter_id = (SELECT id FROM community_users WHERE user_id = auth.uid()));

-- post_ai_qa: all members can read completed AI answers
CREATE POLICY "post_ai_qa_read" ON post_ai_qa FOR SELECT
  USING (
    status = 'COMPLETE'
    AND EXISTS (SELECT 1 FROM community_users cu WHERE cu.user_id = auth.uid())
  );

-- ai_qa_interactions: users can only read/write their own
CREATE POLICY "ai_qa_interactions_own" ON ai_qa_interactions FOR ALL
  USING (user_id = (SELECT id FROM community_users WHERE user_id = auth.uid()));
