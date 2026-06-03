/**
 * Post status constants — aligned with `post_status` SQL enum in 001_community_schema.sql
 * Always use these constants instead of hardcoded strings.
 */
export const POST_STATUS = {
  PUBLISHED:        'PUBLISHED',
  UNDER_REVIEW:     'UNDER_REVIEW',     // auto-set at 3 distinct reports (BR-07)
  DELETED_BY_AUTHOR: 'DELETED_BY_AUTHOR',
  DELETED_BY_ADMIN:  'DELETED_BY_ADMIN',
} as const

export type PostStatus = typeof POST_STATUS[keyof typeof POST_STATUS]

/**
 * Deleted statuses — a post is "deleted" if its status is one of these.
 * Use this instead of checking is_deleted (which may not exist on older rows).
 */
export const DELETED_STATUSES: PostStatus[] = [
  POST_STATUS.DELETED_BY_AUTHOR,
  POST_STATUS.DELETED_BY_ADMIN,
]

/** Returns true if the post is visible in public feeds (spec §2.2 Normal state) */
export const isPubliclyVisible = (status: PostStatus) => status === POST_STATUS.PUBLISHED

/** Returns true if the post is under moderation review */
export const isUnderReview = (status: PostStatus) => status === POST_STATUS.UNDER_REVIEW

/** Returns true if the post has been deleted (either by author or admin) */
export const isDeleted = (status: PostStatus) => DELETED_STATUSES.includes(status)
