-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 003: Align 001 schema with canonical data-dictionary.md / data-enum.md
-- Handles: table renames, enum value migrations, dropping superseded tables/columns
-- Run after 002_ai_features.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Table renames ─────────────────────────────────────────────────────────

-- posts → community_posts (data-dictionary.md Entity: community_posts)
ALTER TABLE posts           RENAME TO community_posts;

-- community_users: keep as-is (confirmed table name)

-- likes → post_likes (data-dictionary.md Entity: post_likes)
ALTER TABLE likes   RENAME TO post_likes;

-- scraps → post_scraps (data-dictionary.md Entity: post_scraps)
ALTER TABLE scraps  RENAME TO post_scraps;

-- reports → post_reports (data-dictionary.md Entity: post_reports)
ALTER TABLE reports RENAME TO post_reports;

-- Rename indexes to match new table names
ALTER INDEX idx_posts_author_id         RENAME TO idx_community_posts_author_id;
ALTER INDEX idx_posts_status            RENAME TO idx_community_posts_status;
ALTER INDEX idx_posts_type              RENAME TO idx_community_posts_type;
ALTER INDEX idx_posts_created_at        RENAME TO idx_community_posts_created_at;
ALTER INDEX idx_posts_is_deleted        RENAME TO idx_community_posts_is_deleted;
ALTER INDEX idx_posts_popularity_score  RENAME TO idx_community_posts_popularity_score;

-- community_users indexes keep their names (no rename)

ALTER INDEX idx_likes_post_id    RENAME TO idx_post_likes_post_id;
ALTER INDEX idx_likes_comment_id RENAME TO idx_post_likes_comment_id;
ALTER INDEX idx_likes_user_id    RENAME TO idx_post_likes_user_id;

ALTER INDEX idx_scraps_user_id RENAME TO idx_post_scraps_user_id;
ALTER INDEX idx_scraps_post_id RENAME TO idx_post_scraps_post_id;

ALTER INDEX idx_reports_post_id RENAME TO idx_post_reports_post_id;

-- ─── 2. Drop superseded tables ───────────────────────────────────────────────
-- These were replaced by proper structures in 002

-- vote_options replaced by post_poll_options (migrated in 002)
DROP TABLE IF EXISTS vote_options CASCADE;

-- vote_records replaced by poll_votes (migrated in 002)
DROP TABLE IF EXISTS vote_records CASCADE;

-- profit_rate_items replaced by post_return_rate_attachments + post_return_rate_items (migrated in 002)
DROP TABLE IF EXISTS profit_rate_items CASCADE;

-- ─── 3. Post status enum — align to data-enum.md PostStatusEnum ──────────────
-- data-enum.md values: DRAFT, PUBLISHED, HIDDEN
-- 001 values: PUBLISHED, UNDER_REVIEW, DELETED_BY_AUTHOR, DELETED_BY_ADMIN

-- Add correct values
ALTER TYPE post_status ADD VALUE IF NOT EXISTS 'HIDDEN';
ALTER TYPE post_status ADD VALUE IF NOT EXISTS 'DRAFT';

-- Migrate: UNDER_REVIEW → HIDDEN
UPDATE community_posts SET status = 'HIDDEN'
  WHERE status = 'UNDER_REVIEW';

-- Migrate: DELETED_* → is_deleted = true, status = PUBLISHED
UPDATE community_posts SET is_deleted = TRUE
  WHERE status IN ('DELETED_BY_AUTHOR', 'DELETED_BY_ADMIN');
UPDATE community_posts SET status = 'PUBLISHED'
  WHERE status IN ('DELETED_BY_AUTHOR', 'DELETED_BY_ADMIN');

-- Update auto-hide trigger to use HIDDEN (was UNDER_REVIEW in 001)
CREATE OR REPLACE FUNCTION check_report_threshold()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(DISTINCT reporter_id) FROM post_reports WHERE post_id = NEW.post_id) >= 3 THEN
    UPDATE community_posts SET status = 'HIDDEN', updated_at = NOW()
    WHERE id = NEW.post_id AND status = 'PUBLISHED' AND is_deleted = FALSE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── 4. Post type — change single enum to VARCHAR[] ───────────────────────────
-- data-enum.md PostAttachmentTypeEnum — array: TEXT, IMAGE, POLL, RETURN_RATE,
--   URL_LINK, YOUTUBE_LINK, REPOST
-- 001 has: single post_type enum (TEXT, IMAGE, VOTE, PROFIT_RATE, LINK, REPOST)

-- Add the new array column
ALTER TABLE community_posts
  ADD COLUMN post_type_flags VARCHAR[] NOT NULL DEFAULT ARRAY['TEXT'];

-- Migrate existing data (rename enum values)
UPDATE community_posts SET post_type_flags =
  CASE type::text
    WHEN 'TEXT'         THEN ARRAY['TEXT']
    WHEN 'IMAGE'        THEN ARRAY['TEXT', 'IMAGE']
    WHEN 'VOTE'         THEN ARRAY['TEXT', 'POLL']
    WHEN 'PROFIT_RATE'  THEN ARRAY['TEXT', 'RETURN_RATE']
    WHEN 'LINK'         THEN ARRAY['TEXT', 'URL_LINK']
    WHEN 'REPOST'       THEN ARRAY['REPOST']
    ELSE ARRAY['TEXT']
  END;

-- Drop old single-enum column and type
ALTER TABLE community_posts DROP COLUMN type;
DROP TYPE post_type;

CREATE INDEX idx_community_posts_type_flags ON community_posts USING GIN(post_type_flags);

-- ─── 5. report_category enum — align to data-enum.md ReportReasonEnum ────────
-- data-enum.md values: SPAM_AD, PROFANITY_HATE, ADULT_EXPLICIT, GAMBLING_ILLEGAL,
--   PERSONAL_INFO, SPAM_REPEAT, HARASSMENT, OFF_TOPIC
-- 001 values: SPAM, ABUSE, ADULT, ILLEGAL, PRIVACY, FLOOD, HARASSMENT, OFF_TOPIC

-- Add correct values
ALTER TYPE report_category ADD VALUE IF NOT EXISTS 'SPAM_AD';
ALTER TYPE report_category ADD VALUE IF NOT EXISTS 'PROFANITY_HATE';
ALTER TYPE report_category ADD VALUE IF NOT EXISTS 'ADULT_EXPLICIT';
ALTER TYPE report_category ADD VALUE IF NOT EXISTS 'GAMBLING_ILLEGAL';
ALTER TYPE report_category ADD VALUE IF NOT EXISTS 'PERSONAL_INFO';
ALTER TYPE report_category ADD VALUE IF NOT EXISTS 'SPAM_REPEAT';

-- Migrate existing data to canonical values
UPDATE post_reports SET reason = 'SPAM_AD'           WHERE reason::text = 'SPAM';
UPDATE post_reports SET reason = 'PROFANITY_HATE'    WHERE reason::text = 'ABUSE';
UPDATE post_reports SET reason = 'ADULT_EXPLICIT'    WHERE reason::text = 'ADULT';
UPDATE post_reports SET reason = 'GAMBLING_ILLEGAL'  WHERE reason::text = 'ILLEGAL';
UPDATE post_reports SET reason = 'PERSONAL_INFO'     WHERE reason::text = 'PRIVACY';
UPDATE post_reports SET reason = 'SPAM_REPEAT'       WHERE reason::text = 'FLOOD';

-- Add report_id PK (data-dictionary has explicit report_id)
ALTER TABLE post_reports ADD COLUMN IF NOT EXISTS report_id UUID DEFAULT uuid_generate_v4();

-- ─── 6. Recreate posts_with_score VIEW with new table/column names ────────────

DROP VIEW IF EXISTS posts_with_score;
CREATE OR REPLACE VIEW posts_with_score AS
SELECT
  p.*,
  (
    (p.like_count    * COALESCE((SELECT value FROM score_config WHERE key = 'likes_weight'),    1.0))
    + (p.comment_count * COALESCE((SELECT value FROM score_config WHERE key = 'comments_weight'), 3.0))
    + (p.reply_count   * COALESCE((SELECT value FROM score_config WHERE key = 'comments_weight'), 3.0))
    + (p.scrap_count   * COALESCE((SELECT value FROM score_config WHERE key = 'scraps_weight'),   5.0))
    + (p.repost_count  * COALESCE((SELECT value FROM score_config WHERE key = 'reposts_weight'),  8.0))
    + (p.share_count   * COALESCE((SELECT value FROM score_config WHERE key = 'shares_weight'),   10.0))
  ) * CASE
    WHEN p.created_at > NOW() - (COALESCE((SELECT value FROM score_config WHERE key = 'recency_window_hours'), 24.0) || ' hours')::INTERVAL
    THEN COALESCE((SELECT value FROM score_config WHERE key = 'recency_multiplier'), 1.5)
    ELSE 1.0
  END AS score
FROM community_posts p
WHERE p.status = 'PUBLISHED'
  AND p.is_deleted = FALSE;

-- ─── 7. Update trigger functions to use renamed tables ────────────────────────

CREATE OR REPLACE FUNCTION update_post_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'PUBLISHED' AND NEW.is_deleted = FALSE THEN
    UPDATE community_users SET post_count = post_count + 1 WHERE id = NEW.author_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF (OLD.status = 'PUBLISHED' AND OLD.is_deleted = FALSE)
       AND (NEW.status != 'PUBLISHED' OR NEW.is_deleted = TRUE) THEN
      UPDATE community_users SET post_count = GREATEST(0, post_count - 1) WHERE id = NEW.author_id;
    ELSIF (OLD.status != 'PUBLISHED' OR OLD.is_deleted = TRUE)
          AND (NEW.status = 'PUBLISHED' AND NEW.is_deleted = FALSE) THEN
      UPDATE community_users SET post_count = post_count + 1 WHERE id = NEW.author_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_follow_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE community_users SET following_count = following_count + 1 WHERE id = NEW.follower_id;
    UPDATE community_users SET follower_count  = follower_count  + 1 WHERE id = NEW.followee_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE community_users SET following_count = GREATEST(0, following_count - 1) WHERE id = OLD.follower_id;
    UPDATE community_users SET follower_count  = GREATEST(0, follower_count  - 1) WHERE id = OLD.followee_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ─── 8. Update RLS policies for renamed tables ────────────────────────────────
-- PostgreSQL automatically transfers policies on rename, but we update the ones
-- that need new logic (Hidden post visibility for authors per m03 §2.2)

DROP POLICY IF EXISTS "posts_read_published" ON community_posts;
DROP POLICY IF EXISTS "posts_read_own"       ON community_posts;

-- Public feed: only PUBLISHED + not deleted (all tabs except MY)
CREATE POLICY "community_posts_read_public" ON community_posts FOR SELECT
  USING (
    status = 'PUBLISHED'
    AND is_deleted = FALSE
    AND EXISTS (SELECT 1 FROM community_users cm WHERE cm.user_id = auth.uid())
  );

-- Author view: own posts including HIDDEN (m03 §2.2 — Hidden posts visible to author in MY feed)
CREATE POLICY "community_posts_read_own" ON community_posts FOR SELECT
  USING (
    author_id = (SELECT id FROM community_users WHERE user_id = auth.uid())
    AND is_deleted = FALSE
  );

-- Update post_reports policy to reference community_users
DROP POLICY IF EXISTS "reports_insert" ON post_reports;
CREATE POLICY "post_reports_insert" ON post_reports FOR INSERT
  WITH CHECK (reporter_id = (SELECT id FROM community_users WHERE user_id = auth.uid()));

-- Update follows policies
DROP POLICY IF EXISTS "follows_read"        ON follows;
DROP POLICY IF EXISTS "follows_manage_own"  ON follows;
CREATE POLICY "follows_read"       ON follows FOR SELECT
  USING (EXISTS (SELECT 1 FROM community_users cm WHERE cm.user_id = auth.uid()));
CREATE POLICY "follows_manage_own" ON follows FOR ALL
  USING (follower_id = (SELECT id FROM community_users WHERE user_id = auth.uid()));

-- Update blocks policies
DROP POLICY IF EXISTS "blocks_manage_own" ON blocks;
CREATE POLICY "blocks_manage_own" ON blocks FOR ALL
  USING (blocker_id = (SELECT id FROM community_users WHERE user_id = auth.uid()));

-- Update notifications policies
DROP POLICY IF EXISTS "notifications_own" ON notifications;
CREATE POLICY "notifications_own" ON notifications FOR ALL
  USING (recipient_id = (SELECT id FROM community_users WHERE user_id = auth.uid()));

-- ─── 9. Note: RLS policies for tables created in 002 already reference
-- community_users directly — no upgrade needed here (table name unchanged).
