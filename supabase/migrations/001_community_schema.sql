-- ─────────────────────────────────────────────────────────────────────────────
-- KB Securities M-able Community — Supabase Schema
-- Based on FRD/SRD v1.1
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ─── Enums ───────────────────────────────────────────────────────────────────

CREATE TYPE post_status AS ENUM (
  'PUBLISHED',
  'UNDER_REVIEW',
  'DELETED_BY_AUTHOR',
  'DELETED_BY_ADMIN'
);

CREATE TYPE post_type AS ENUM (
  'TEXT',
  'IMAGE',
  'VOTE',
  'PROFIT_RATE',
  'LINK',
  'REPOST'
);

CREATE TYPE notification_type AS ENUM (
  'N1_LIKE',
  'N2_COMMENT',
  'N3_POST_MENTION',
  'N4_COMMENT_MENTION',
  'N5_REPOST',
  'N6_NEW_FOLLOWER',
  'N7_NEW_POST'
);

CREATE TYPE report_category AS ENUM (
  'SPAM',
  'ABUSE',
  'ADULT',
  'ILLEGAL',
  'PRIVACY',
  'FLOOD',
  'HARASSMENT',
  'OFF_TOPIC'
);

-- ─── Community Users ─────────────────────────────────────────────────────────

CREATE TABLE community_users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname        VARCHAR(10) NOT NULL UNIQUE,
  avatar_url      TEXT,
  bio             VARCHAR(100),
  is_expert       BOOLEAN NOT NULL DEFAULT FALSE,
  post_count      INTEGER NOT NULL DEFAULT 0,
  follower_count  INTEGER NOT NULL DEFAULT 0,
  following_count INTEGER NOT NULL DEFAULT 0,
  -- Privacy settings (BR-18: all default PUBLIC)
  feed_public         BOOLEAN NOT NULL DEFAULT TRUE,
  holdings_public     BOOLEAN NOT NULL DEFAULT TRUE,
  performance_public  BOOLEAN NOT NULL DEFAULT TRUE,
  scrap_public        BOOLEAN NOT NULL DEFAULT TRUE,
  -- Notification settings (FR-17.2: all default ON)
  notif_like          BOOLEAN NOT NULL DEFAULT TRUE,
  notif_comment       BOOLEAN NOT NULL DEFAULT TRUE,
  notif_post_mention  BOOLEAN NOT NULL DEFAULT TRUE,
  notif_comment_mention BOOLEAN NOT NULL DEFAULT TRUE,
  notif_repost        BOOLEAN NOT NULL DEFAULT TRUE,
  notif_new_follower  BOOLEAN NOT NULL DEFAULT TRUE,
  notif_new_post      BOOLEAN NOT NULL DEFAULT TRUE,
  -- Onboarding terms
  terms_service       BOOLEAN NOT NULL DEFAULT FALSE,
  privacy_consent     BOOLEAN NOT NULL DEFAULT FALSE,
  notification_consent BOOLEAN NOT NULL DEFAULT FALSE,
  marketing_consent   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_community_users_nickname ON community_users USING gin(nickname gin_trgm_ops);
CREATE INDEX idx_community_users_user_id ON community_users(user_id);
CREATE INDEX idx_community_users_is_expert ON community_users(is_expert) WHERE is_expert = TRUE;

-- ─── Posts ───────────────────────────────────────────────────────────────────

CREATE TABLE posts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_id         UUID NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
  type              post_type NOT NULL,
  status            post_status NOT NULL DEFAULT 'PUBLISHED',
  body              TEXT,
  images            TEXT[],                  -- Type 2: IMAGE
  link_url          TEXT,                    -- Type 5: LINK
  link_meta         JSONB,                   -- { title, description, imageUrl, url }
  repost_parent_id  UUID REFERENCES posts(id) ON DELETE SET NULL, -- Type 6
  -- Interaction counts (denormalised for performance)
  like_count        INTEGER NOT NULL DEFAULT 0,
  comment_count     INTEGER NOT NULL DEFAULT 0,
  reply_count       INTEGER NOT NULL DEFAULT 0,
  repost_count      INTEGER NOT NULL DEFAULT 0,
  scrap_count       INTEGER NOT NULL DEFAULT 0,
  share_count       INTEGER NOT NULL DEFAULT 0,
  -- Edit tracking (FR-11.8.1)
  is_edited         BOOLEAN NOT NULL DEFAULT FALSE,
  edited_at         TIMESTAMPTZ,
  -- Compliance flags
  has_vote_disclaimer     BOOLEAN NOT NULL DEFAULT FALSE,  -- FR-6.3.1
  has_profit_disclaimer   BOOLEAN NOT NULL DEFAULT FALSE,  -- FR-6.4.1
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_posts_author_id ON posts(author_id);
CREATE INDEX idx_posts_status ON posts(status);
CREATE INDEX idx_posts_type ON posts(type);
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);

-- Computed score view (BR-06)
CREATE OR REPLACE VIEW posts_with_score AS
SELECT
  p.*,
  (
    (p.like_count * 1)
    + (p.comment_count * 3)
    + (p.reply_count * 3)
    + (p.scrap_count * 5)
    + (p.repost_count * 8)
    + (p.share_count * 10)
  ) * CASE
    WHEN p.created_at > NOW() - INTERVAL '24 hours' THEN 1.5
    ELSE 1.0
  END AS score
FROM posts p
WHERE p.status = 'PUBLISHED';

-- ─── Topic Tags ──────────────────────────────────────────────────────────────

CREATE TABLE post_topic_tags (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id   UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag_type  VARCHAR(10) NOT NULL CHECK (tag_type IN ('stock', 'theme')),
  value     VARCHAR(100) NOT NULL,
  display_name VARCHAR(100) NOT NULL
);

CREATE INDEX idx_post_topic_tags_post_id ON post_topic_tags(post_id);
CREATE INDEX idx_post_topic_tags_value ON post_topic_tags(value);

-- ─── AI Hashtags ─────────────────────────────────────────────────────────────

CREATE TABLE post_ai_hashtags (
  id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag     VARCHAR(100) NOT NULL
);

CREATE INDEX idx_post_ai_hashtags_post_id ON post_ai_hashtags(post_id);
CREATE INDEX idx_post_ai_hashtags_tag ON post_ai_hashtags(tag);

-- ─── Vote Options (Type 3) ───────────────────────────────────────────────────

CREATE TABLE vote_options (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  label      VARCHAR(20) NOT NULL,
  vote_count INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_vote_options_post_id ON vote_options(post_id);

CREATE TABLE vote_records (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id        UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  option_id      UUID NOT NULL REFERENCES vote_options(id) ON DELETE CASCADE,
  voter_id       UUID NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, voter_id)  -- BR-16: one vote per user per post
);

-- ─── Profit Rate Items (Type 4) ──────────────────────────────────────────────

CREATE TABLE profit_rate_items (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id           UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  stock_code        VARCHAR(20) NOT NULL,
  stock_name        VARCHAR(100) NOT NULL,
  logo_url          TEXT,
  quantity          DECIMAL(18,6) NOT NULL,  -- BR-05: immutable snapshot
  evaluation_amount BIGINT NOT NULL,
  unrealised_pnl    BIGINT NOT NULL,
  return_rate       DECIMAL(10,4) NOT NULL,
  snapshot_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_profit_rate_items_post_id ON profit_rate_items(post_id);

-- ─── Comments ─────────────────────────────────────────────────────────────────

CREATE TABLE comments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id           UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id         UUID NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  body              TEXT NOT NULL,
  is_deleted        BOOLEAN NOT NULL DEFAULT FALSE,  -- FR-11.2.1: soft delete
  like_count        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comments_post_id ON comments(post_id);
CREATE INDEX idx_comments_author_id ON comments(author_id);
CREATE INDEX idx_comments_parent_id ON comments(parent_comment_id);
CREATE INDEX idx_comments_created_at ON comments(created_at DESC);

-- ─── Likes ───────────────────────────────────────────────────────────────────

CREATE TABLE likes (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
  post_id    UUID REFERENCES posts(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, post_id),
  UNIQUE (user_id, comment_id),
  CHECK (
    (post_id IS NOT NULL AND comment_id IS NULL) OR
    (post_id IS NULL AND comment_id IS NOT NULL)
  )
);

CREATE INDEX idx_likes_post_id ON likes(post_id);
CREATE INDEX idx_likes_comment_id ON likes(comment_id);
CREATE INDEX idx_likes_user_id ON likes(user_id);

-- ─── Scraps ───────────────────────────────────────────────────────────────────

CREATE TABLE scraps (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
  post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, post_id)
);

CREATE INDEX idx_scraps_user_id ON scraps(user_id);
CREATE INDEX idx_scraps_post_id ON scraps(post_id);

-- ─── Hidden Posts (FR-11.7) ──────────────────────────────────────────────────

CREATE TABLE hidden_posts (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
  post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, post_id)
);

CREATE INDEX idx_hidden_posts_user_id ON hidden_posts(user_id);

-- ─── Reports ─────────────────────────────────────────────────────────────────

CREATE TABLE reports (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id UUID NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
  post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  category   report_category NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (reporter_id, post_id)  -- BR-07: deduplication
);

CREATE INDEX idx_reports_post_id ON reports(post_id);

-- Trigger: Auto set post to UNDER_REVIEW at 3 distinct reports (BR-07)
CREATE OR REPLACE FUNCTION check_report_threshold()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(DISTINCT reporter_id) FROM reports WHERE post_id = NEW.post_id) >= 3 THEN
    UPDATE posts SET status = 'UNDER_REVIEW', updated_at = NOW()
    WHERE id = NEW.post_id AND status = 'PUBLISHED';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_report_insert
AFTER INSERT ON reports
FOR EACH ROW EXECUTE FUNCTION check_report_threshold();

-- ─── Follow Relationships ─────────────────────────────────────────────────────

CREATE TABLE follows (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  follower_id  UUID NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
  followee_id  UUID NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
  bell_enabled BOOLEAN NOT NULL DEFAULT FALSE,  -- FR-13.2: default OFF
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (follower_id, followee_id),
  CHECK (follower_id != followee_id)
);

CREATE INDEX idx_follows_follower_id ON follows(follower_id);
CREATE INDEX idx_follows_followee_id ON follows(followee_id);

-- ─── Block Relationships ─────────────────────────────────────────────────────

CREATE TABLE blocks (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  blocker_id UUID NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (blocker_id, blocked_id),
  CHECK (blocker_id != blocked_id)
);

CREATE INDEX idx_blocks_blocker_id ON blocks(blocker_id);
CREATE INDEX idx_blocks_blocked_id ON blocks(blocked_id);

-- ─── Notifications ───────────────────────────────────────────────────────────

CREATE TABLE notifications (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_id UUID NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
  type         notification_type NOT NULL,
  actor_id     UUID NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
  post_id      UUID REFERENCES posts(id) ON DELETE SET NULL,
  comment_id   UUID REFERENCES comments(id) ON DELETE SET NULL,
  is_read      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_recipient_id ON notifications(recipient_id);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX idx_notifications_is_read ON notifications(recipient_id, is_read) WHERE is_read = FALSE;

-- ─── Update Triggers ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER community_users_updated_at BEFORE UPDATE ON community_users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER posts_updated_at BEFORE UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER comments_updated_at BEFORE UPDATE ON comments FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Follower / Following Count Triggers ─────────────────────────────────────

CREATE OR REPLACE FUNCTION update_follow_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE community_users SET following_count = following_count + 1 WHERE id = NEW.follower_id;
    UPDATE community_users SET follower_count = follower_count + 1 WHERE id = NEW.followee_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE community_users SET following_count = GREATEST(0, following_count - 1) WHERE id = OLD.follower_id;
    UPDATE community_users SET follower_count = GREATEST(0, follower_count - 1) WHERE id = OLD.followee_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER follows_count_trigger
AFTER INSERT OR DELETE ON follows
FOR EACH ROW EXECUTE FUNCTION update_follow_counts();

-- ─── Post Count Trigger ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_post_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'PUBLISHED' THEN
    UPDATE community_users SET post_count = post_count + 1 WHERE id = NEW.author_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'PUBLISHED' AND NEW.status != 'PUBLISHED' THEN
      UPDATE community_users SET post_count = GREATEST(0, post_count - 1) WHERE id = NEW.author_id;
    ELSIF OLD.status != 'PUBLISHED' AND NEW.status = 'PUBLISHED' THEN
      UPDATE community_users SET post_count = post_count + 1 WHERE id = NEW.author_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER posts_count_trigger
AFTER INSERT OR UPDATE OF status ON posts
FOR EACH ROW EXECUTE FUNCTION update_post_count();

-- ─── Like Count Triggers ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_like_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.post_id IS NOT NULL THEN
      UPDATE posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
    ELSIF NEW.comment_id IS NOT NULL THEN
      UPDATE comments SET like_count = like_count + 1 WHERE id = NEW.comment_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.post_id IS NOT NULL THEN
      UPDATE posts SET like_count = GREATEST(0, like_count - 1) WHERE id = OLD.post_id;
    ELSIF OLD.comment_id IS NOT NULL THEN
      UPDATE comments SET like_count = GREATEST(0, like_count - 1) WHERE id = OLD.comment_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER likes_count_trigger
AFTER INSERT OR DELETE ON likes
FOR EACH ROW EXECUTE FUNCTION update_like_counts();

-- ─── Scrap Count Trigger ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_scrap_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET scrap_count = scrap_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET scrap_count = GREATEST(0, scrap_count - 1) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER scraps_count_trigger
AFTER INSERT OR DELETE ON scraps
FOR EACH ROW EXECUTE FUNCTION update_scrap_count();

-- ─── Comment Count Trigger ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.parent_comment_id IS NULL THEN
      UPDATE posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    ELSE
      UPDATE posts SET reply_count = reply_count + 1 WHERE id = NEW.post_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.parent_comment_id IS NULL THEN
      UPDATE posts SET comment_count = GREATEST(0, comment_count - 1) WHERE id = OLD.post_id;
    ELSE
      UPDATE posts SET reply_count = GREATEST(0, reply_count - 1) WHERE id = OLD.post_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER comments_count_trigger
AFTER INSERT OR DELETE ON comments
FOR EACH ROW EXECUTE FUNCTION update_comment_count();

-- ─── Row Level Security (RLS) ─────────────────────────────────────────────────

ALTER TABLE community_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraps ENABLE ROW LEVEL SECURITY;
ALTER TABLE hidden_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE vote_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_topic_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_ai_hashtags ENABLE ROW LEVEL SECURITY;
ALTER TABLE vote_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE profit_rate_items ENABLE ROW LEVEL SECURITY;

-- Community users: members can read all profiles
CREATE POLICY "community_users_read" ON community_users FOR SELECT
  USING (EXISTS (SELECT 1 FROM community_users cu WHERE cu.user_id = auth.uid()));

CREATE POLICY "community_users_update_own" ON community_users FOR UPDATE
  USING (user_id = auth.uid());

-- Posts: members can read published posts (block filter applied at query level per BR-23)
CREATE POLICY "posts_read_published" ON posts FOR SELECT
  USING (
    status = 'PUBLISHED'
    AND EXISTS (SELECT 1 FROM community_users cu WHERE cu.user_id = auth.uid())
  );

CREATE POLICY "posts_read_own" ON posts FOR SELECT
  USING (author_id = (SELECT id FROM community_users WHERE user_id = auth.uid()));

CREATE POLICY "posts_insert" ON posts FOR INSERT
  WITH CHECK (author_id = (SELECT id FROM community_users WHERE user_id = auth.uid()));

CREATE POLICY "posts_update_own" ON posts FOR UPDATE
  USING (author_id = (SELECT id FROM community_users WHERE user_id = auth.uid()));

-- Comments
CREATE POLICY "comments_read" ON comments FOR SELECT
  USING (EXISTS (SELECT 1 FROM community_users cu WHERE cu.user_id = auth.uid()));

CREATE POLICY "comments_insert" ON comments FOR INSERT
  WITH CHECK (author_id = (SELECT id FROM community_users WHERE user_id = auth.uid()));

CREATE POLICY "comments_update_own" ON comments FOR UPDATE
  USING (author_id = (SELECT id FROM community_users WHERE user_id = auth.uid()));

-- Likes
CREATE POLICY "likes_read" ON likes FOR SELECT
  USING (EXISTS (SELECT 1 FROM community_users cu WHERE cu.user_id = auth.uid()));

CREATE POLICY "likes_manage_own" ON likes FOR ALL
  USING (user_id = (SELECT id FROM community_users WHERE user_id = auth.uid()));

-- Scraps
CREATE POLICY "scraps_manage_own" ON scraps FOR ALL
  USING (user_id = (SELECT id FROM community_users WHERE user_id = auth.uid()));

-- Hidden posts
CREATE POLICY "hidden_posts_manage_own" ON hidden_posts FOR ALL
  USING (user_id = (SELECT id FROM community_users WHERE user_id = auth.uid()));

-- Reports
CREATE POLICY "reports_insert" ON reports FOR INSERT
  WITH CHECK (reporter_id = (SELECT id FROM community_users WHERE user_id = auth.uid()));

-- Follows
CREATE POLICY "follows_read" ON follows FOR SELECT
  USING (EXISTS (SELECT 1 FROM community_users cu WHERE cu.user_id = auth.uid()));

CREATE POLICY "follows_manage_own" ON follows FOR ALL
  USING (follower_id = (SELECT id FROM community_users WHERE user_id = auth.uid()));

-- Blocks
CREATE POLICY "blocks_manage_own" ON blocks FOR ALL
  USING (blocker_id = (SELECT id FROM community_users WHERE user_id = auth.uid()));

-- Notifications: own only
CREATE POLICY "notifications_own" ON notifications FOR ALL
  USING (recipient_id = (SELECT id FROM community_users WHERE user_id = auth.uid()));

-- Vote records
CREATE POLICY "vote_records_read" ON vote_records FOR SELECT
  USING (EXISTS (SELECT 1 FROM community_users cu WHERE cu.user_id = auth.uid()));

CREATE POLICY "vote_records_manage_own" ON vote_records FOR ALL
  USING (voter_id = (SELECT id FROM community_users WHERE user_id = auth.uid()));

-- Read-only tables for members
CREATE POLICY "post_topic_tags_read" ON post_topic_tags FOR SELECT
  USING (EXISTS (SELECT 1 FROM community_users cu WHERE cu.user_id = auth.uid()));

CREATE POLICY "post_ai_hashtags_read" ON post_ai_hashtags FOR SELECT
  USING (EXISTS (SELECT 1 FROM community_users cu WHERE cu.user_id = auth.uid()));

CREATE POLICY "vote_options_read" ON vote_options FOR SELECT
  USING (EXISTS (SELECT 1 FROM community_users cu WHERE cu.user_id = auth.uid()));

CREATE POLICY "profit_rate_items_read" ON profit_rate_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM community_users cu WHERE cu.user_id = auth.uid()));
