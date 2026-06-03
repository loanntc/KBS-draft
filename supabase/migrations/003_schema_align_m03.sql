-- ─────────────────────────────────────────────────────────────────────────────
-- KB Securities M-able Community — Migration 003: Align 001 schema with m03 spec
-- Source of truth: m03-overview-be.md (post data model, enums, table names)
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Table renames ─────────────────────────────────────────────────────────
-- Both specs (m02 §2.1, m03 §2.4) use 'community_posts' and 'community_members'
-- 001 schema created them as 'posts' and 'community_users'

ALTER TABLE posts            RENAME TO community_posts;
ALTER TABLE community_users  RENAME TO community_members;

-- Update sequences, indexes, triggers affected by rename (PostgreSQL renames these automatically,
-- but FKs from other tables need to be revalidated — done implicitly by PostgreSQL)

-- Rename indexes to match new table names
ALTER INDEX idx_posts_author_id      RENAME TO idx_community_posts_author_id;
ALTER INDEX idx_posts_status         RENAME TO idx_community_posts_status;
ALTER INDEX idx_posts_type           RENAME TO idx_community_posts_type;
ALTER INDEX idx_posts_created_at     RENAME TO idx_community_posts_created_at;
ALTER INDEX idx_posts_is_deleted     RENAME TO idx_community_posts_is_deleted;
ALTER INDEX idx_posts_popularity_score RENAME TO idx_community_posts_popularity_score;

ALTER INDEX idx_community_users_nickname     RENAME TO idx_community_members_nickname;
ALTER INDEX idx_community_users_user_id      RENAME TO idx_community_members_user_id;
ALTER INDEX idx_community_users_is_expert    RENAME TO idx_community_members_is_expert;
ALTER INDEX idx_community_users_account_type RENAME TO idx_community_members_account_type;
ALTER INDEX idx_community_users_account_subtype RENAME TO idx_community_members_account_subtype;
ALTER INDEX idx_community_users_feed_visibility RENAME TO idx_community_members_feed_visibility;

-- ─── 2. Post status enum — align to m03 spec §2.2 ────────────────────────────
-- 001 schema: PUBLISHED, UNDER_REVIEW, DELETED_BY_AUTHOR, DELETED_BY_ADMIN
-- m03 spec:   PUBLISHED, HIDDEN, DRAFT
-- Deletion is handled by is_deleted BOOLEAN (added in 002), not by status enum values

-- Step 1: Add the correct values
ALTER TYPE post_status ADD VALUE IF NOT EXISTS 'HIDDEN';
ALTER TYPE post_status ADD VALUE IF NOT EXISTS 'DRAFT';

-- Step 2: Migrate existing UNDER_REVIEW posts → HIDDEN
UPDATE community_posts SET status = 'HIDDEN'
  WHERE status = 'UNDER_REVIEW';

-- Step 3: Migrate existing deleted posts → set is_deleted = true
UPDATE community_posts
  SET is_deleted = TRUE
  WHERE status IN ('DELETED_BY_AUTHOR', 'DELETED_BY_ADMIN');

-- Step 4: Reset status to PUBLISHED for deleted posts (status now just PUBLISHED/HIDDEN/DRAFT)
UPDATE community_posts
  SET status = 'PUBLISHED'
  WHERE status IN ('DELETED_BY_AUTHOR', 'DELETED_BY_ADMIN');

-- Step 5: Update the auto-hide trigger to use HIDDEN instead of UNDER_REVIEW
CREATE OR REPLACE FUNCTION check_report_threshold()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(DISTINCT reporter_id) FROM reports WHERE post_id = NEW.post_id) >= 3 THEN
    UPDATE community_posts SET status = 'HIDDEN', updated_at = NOW()
    WHERE id = NEW.post_id AND status = 'PUBLISHED';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Update the posts_with_score VIEW to include HIDDEN posts for author
-- (Hidden posts must be visible to authors — see m03 §2.2)
-- The view continues to show only PUBLISHED for public feeds; hidden-to-author handled at query level
DROP VIEW IF EXISTS posts_with_score;
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
FROM community_posts p
WHERE p.status = 'PUBLISHED'
  AND p.is_deleted = FALSE;

-- ─── 3. Post type — change from single enum to VARCHAR[] ─────────────────────
-- m03 spec §2.4: `post_type_flags VARCHAR[]` (multiple types allowed per post)
-- 001 schema: `type post_type` (single enum: TEXT/IMAGE/VOTE/PROFIT_RATE/LINK/REPOST)
-- m03 values: TEXT, IMAGE, POLL, RETURN_RATE, URL_LINK, YOUTUBE_LINK, REPOST

-- Step 1: Add new array column
ALTER TABLE community_posts
  ADD COLUMN post_type_flags VARCHAR[] NOT NULL DEFAULT ARRAY['TEXT'];

-- Step 2: Migrate existing data (rename enum values in the array)
UPDATE community_posts SET post_type_flags =
  CASE type::text
    WHEN 'TEXT'         THEN ARRAY['TEXT']
    WHEN 'IMAGE'        THEN ARRAY['TEXT', 'IMAGE']
    WHEN 'VOTE'         THEN ARRAY['TEXT', 'POLL']      -- VOTE → POLL
    WHEN 'PROFIT_RATE'  THEN ARRAY['TEXT', 'RETURN_RATE'] -- PROFIT_RATE → RETURN_RATE
    WHEN 'LINK'         THEN ARRAY['TEXT', 'URL_LINK']  -- LINK → URL_LINK
    WHEN 'REPOST'       THEN ARRAY['REPOST']
    ELSE ARRAY['TEXT']
  END;

-- Step 3: Drop the old single-type column and enum
ALTER TABLE community_posts DROP COLUMN type;
DROP TYPE post_type;

CREATE INDEX idx_community_posts_type_flags ON community_posts USING GIN(post_type_flags);

-- ─── 4. Report category enum — align to m03 spec values ──────────────────────
-- 001 schema: SPAM, ABUSE, ADULT, ILLEGAL, PRIVACY, FLOOD, HARASSMENT, OFF_TOPIC
-- m03 spec:   SPAM_AD, PROFANITY_HATE, ADULT_EXPLICIT, GAMBLING_ILLEGAL, PERSONAL_INFO,
--             SPAM_REPEAT, HARASSMENT, OFF_TOPIC
-- Also: rename column 'category' → 'reason' and table 'reports' → 'post_reports'

ALTER TABLE reports RENAME TO post_reports;
ALTER TABLE post_reports RENAME COLUMN category TO reason;

-- Add correct enum values
ALTER TYPE report_category ADD VALUE IF NOT EXISTS 'SPAM_AD';
ALTER TYPE report_category ADD VALUE IF NOT EXISTS 'PROFANITY_HATE';
ALTER TYPE report_category ADD VALUE IF NOT EXISTS 'ADULT_EXPLICIT';
ALTER TYPE report_category ADD VALUE IF NOT EXISTS 'GAMBLING_ILLEGAL';
ALTER TYPE report_category ADD VALUE IF NOT EXISTS 'PERSONAL_INFO';
ALTER TYPE report_category ADD VALUE IF NOT EXISTS 'SPAM_REPEAT';

-- Migrate existing data to new values
UPDATE post_reports SET reason = 'SPAM_AD'         WHERE reason = 'SPAM';
UPDATE post_reports SET reason = 'PROFANITY_HATE'  WHERE reason = 'ABUSE';
UPDATE post_reports SET reason = 'ADULT_EXPLICIT'  WHERE reason = 'ADULT';
UPDATE post_reports SET reason = 'GAMBLING_ILLEGAL' WHERE reason = 'ILLEGAL';
UPDATE post_reports SET reason = 'PERSONAL_INFO'   WHERE reason = 'PRIVACY';
UPDATE post_reports SET reason = 'SPAM_REPEAT'     WHERE reason = 'FLOOD';

-- ─── 5. Update posts_count_trigger to reference new table name ────────────────
-- (PostgreSQL trigger functions reference table by name — need to recreate)

CREATE OR REPLACE FUNCTION update_post_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'PUBLISHED' AND NEW.is_deleted = FALSE THEN
    UPDATE community_members SET post_count = post_count + 1 WHERE id = NEW.author_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF (OLD.status = 'PUBLISHED' AND OLD.is_deleted = FALSE)
       AND (NEW.status != 'PUBLISHED' OR NEW.is_deleted = TRUE) THEN
      UPDATE community_members SET post_count = GREATEST(0, post_count - 1) WHERE id = NEW.author_id;
    ELSIF (OLD.status != 'PUBLISHED' OR OLD.is_deleted = TRUE)
          AND (NEW.status = 'PUBLISHED' AND NEW.is_deleted = FALSE) THEN
      UPDATE community_members SET post_count = post_count + 1 WHERE id = NEW.author_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ─── 6. Update follow/like/scrap count trigger functions ─────────────────────
-- These reference community_members (renamed from community_users)

CREATE OR REPLACE FUNCTION update_follow_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE community_members SET following_count = following_count + 1 WHERE id = NEW.follower_id;
    UPDATE community_members SET follower_count  = follower_count  + 1 WHERE id = NEW.followee_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE community_members SET following_count = GREATEST(0, following_count - 1) WHERE id = OLD.follower_id;
    UPDATE community_members SET follower_count  = GREATEST(0, follower_count  - 1) WHERE id = OLD.followee_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ─── 7. RLS updates for renamed tables ───────────────────────────────────────
-- Existing RLS policies on the old table names are automatically transferred by PostgreSQL rename.
-- Update the ones that embed 'status = PUBLISHED' to use 'HIDDEN' correctly for author reads.

-- Posts: update RLS to also allow author to read their own HIDDEN posts (m03 §2.2)
DROP POLICY IF EXISTS "posts_read_own" ON community_posts;
CREATE POLICY "community_posts_read_own" ON community_posts FOR SELECT
  USING (
    author_id = (SELECT id FROM community_members WHERE user_id = auth.uid())
    AND is_deleted = FALSE
  );

DROP POLICY IF EXISTS "posts_read_published" ON community_posts;
CREATE POLICY "community_posts_read_published" ON community_posts FOR SELECT
  USING (
    status = 'PUBLISHED'
    AND is_deleted = FALSE
    AND EXISTS (SELECT 1 FROM community_members cm WHERE cm.user_id = auth.uid())
  );
