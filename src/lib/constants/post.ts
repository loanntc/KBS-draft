/**
 * Post status constants — aligned with `post_status` SQL enum (003_schema_align.sql final state)
 * Values: DRAFT | PUBLISHED | HIDDEN
 * Deletion is tracked by `is_deleted BOOLEAN`, not by status.
 */
export const POST_STATUS = {
  DRAFT:     'DRAFT',      // Saved, not published — author-only visibility
  PUBLISHED: 'PUBLISHED',  // Live and visible to all community members
  HIDDEN:    'HIDDEN',     // Auto-hidden on 3rd distinct report or Admin action
} as const

export type PostStatus = typeof POST_STATUS[keyof typeof POST_STATUS]

/** Returns true if the post is visible in public feeds */
export const isPubliclyVisible = (status: PostStatus): boolean =>
  status === POST_STATUS.PUBLISHED

/** Returns true if the post is hidden (under review) */
export const isHidden = (status: PostStatus): boolean =>
  status === POST_STATUS.HIDDEN

/** Returns true if the post is a draft (not published) */
export const isDraft = (status: PostStatus): boolean =>
  status === POST_STATUS.DRAFT

/**
 * Deletion is tracked by the `is_deleted` BOOLEAN field on community_posts,
 * NOT by a status value. Use the `is_deleted` column directly in queries.
 *
 * Per spec:
 *  - Normal:  status = PUBLISHED, is_deleted = false
 *  - Hidden:  status = HIDDEN,    is_deleted = false
 *  - Draft:   status = DRAFT,     is_deleted = false
 *  - Deleted: any status,         is_deleted = true (inaccessible to everyone)
 */
