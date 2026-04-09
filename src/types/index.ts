// ─── Enums ────────────────────────────────────────────────────────────────────

export type PostStatus = 'PUBLISHED' | 'UNDER_REVIEW' | 'DELETED_BY_AUTHOR' | 'DELETED_BY_ADMIN'
export type PostType = 'TEXT' | 'IMAGE' | 'VOTE' | 'PROFIT_RATE' | 'LINK' | 'REPOST'
export type NotificationType = 'N1_LIKE' | 'N2_COMMENT' | 'N3_POST_MENTION' | 'N4_COMMENT_MENTION' | 'N5_REPOST' | 'N6_NEW_FOLLOWER' | 'N7_NEW_POST'
export type ThemeCommunityId = 'us-stocks' | 'kr-stocks' | 'asset-growth' | 'prime-club'

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string
  email?: string
  communityMember: boolean
}

// ─── Community Member / Profile ───────────────────────────────────────────────
// Maps to: community_users table

export interface CommunityUser {
  id: string
  authUserId: string          // DB: auth_user_id
  nickname: string
  profileImage: string | null // DB: profile_image
  bio: string | null
  isMember: boolean           // DB: is_member
  postCount: number
  followerCount: number
  followingCount: number
  // Privacy
  feedPublic: boolean
  holdingsPublic: boolean
  performancePublic: boolean
  scrapPublic: boolean
  // Notification settings
  notifLike: boolean
  notifComment: boolean
  notifPostMention: boolean
  notifCommentMention: boolean
  notifRepost: boolean
  notifNewFollower: boolean
  notifNewPostBell: boolean   // DB: notif_new_post_bell
  createdAt: string
}

// ─── Topic Tag ───────────────────────────────────────────────────────────────
// Stored as JSONB array in posts.topic_tags

export interface TopicTag {
  type: 'stock' | 'theme'
  value: string
  displayName: string
}

// ─── Vote Option ─────────────────────────────────────────────────────────────
// Stored as JSONB array in posts.vote_options

export interface VoteOption {
  id: string          // client-generated UUID for keying
  label: string
  voteCount: number
  percentage: number
  isUserVote: boolean
}

// ─── Profit Rate Item ────────────────────────────────────────────────────────
// Stored as JSONB array in posts.profit_rate_holdings

export interface ProfitRateItem {
  stockCode: string
  stockName: string
  logoUrl: string | null
  quantity: number
  evaluationAmount: number
  unrealisedPnl: number
  returnRate: number
  snapshotAt: string
}

// ─── Link Meta ───────────────────────────────────────────────────────────────

export interface LinkMeta {
  title: string | null
  description: string | null
  imageUrl: string | null
  url: string
}

// ─── Post ─────────────────────────────────────────────────────────────────────
// Maps to: posts table
// NOTE: vote_options, profit_rate_holdings, topic_tags, ai_hashtags are all JSONB inline

export interface Post {
  id: string
  authorId: string            // DB: author_id
  author: CommunityUser | null
  type: PostType
  status: PostStatus
  body: string | null
  images: string[] | null              // DB: images (jsonb)
  voteOptions: VoteOption[] | null     // DB: vote_options (jsonb)
  profitRateHoldings: ProfitRateItem[] | null  // DB: profit_rate_holdings (jsonb)
  linkUrl: string | null               // DB: link_url
  linkMeta: LinkMeta | null            // DB: link_meta (jsonb)
  repostOf: string | null              // DB: repost_of
  repostParent: Post | null            // resolved via join
  topicTags: TopicTag[]                // DB: topic_tags (jsonb)
  aiHashtags: string[]                 // DB: ai_hashtags (jsonb)
  // Interaction counts
  likeCount: number
  commentCount: number
  replyCount: number
  repostCount: number
  scrapCount: number
  shareCount: number
  reportCount: number
  score: number | null
  // Per-viewer state (computed client-side)
  isLiked: boolean
  isScrapped: boolean
  isHidden: boolean
  // Edit tracking
  isEdited: boolean
  editedAt: string | null
  createdAt: string
  updatedAt: string
}

// ─── Comment ──────────────────────────────────────────────────────────────────

export interface Comment {
  id: string
  postId: string
  authorId: string
  author: Pick<CommunityUser, 'id' | 'nickname' | 'profileImage'> | null
  body: string
  isDeleted: boolean
  likeCount: number
  isLiked: boolean
  parentCommentId: string | null
  replies: Comment[]
  replyCount: number
  createdAt: string
}

// ─── Notification ─────────────────────────────────────────────────────────────
// Maps to: notifications table

export interface Notification {
  id: string
  recipientId: string
  type: NotificationType
  senderId: string | null     // DB: sender_id
  sender: Pick<CommunityUser, 'id' | 'nickname' | 'profileImage'> | null
  postId: string | null
  commentId: string | null
  body: string                // DB: body (pre-computed message text)
  isRead: boolean
  createdAt: string
}

// ─── Follow / Block ───────────────────────────────────────────────────────────

export interface FollowRelationship {
  followerId: string
  followeeId: string
  bellOn: boolean             // DB: bell_on
  createdAt: string
}

// ─── Vote Record ──────────────────────────────────────────────────────────────
// Maps to: vote_records table

export interface VoteRecord {
  id: string
  postId: string
  userId: string              // DB: user_id
  optionIndex: number         // DB: option_index
  createdAt: string
}

// ─── Theme Community ──────────────────────────────────────────────────────────

export interface ThemeCommunity {
  id: ThemeCommunityId
  name: string
  imageUrl: string
  bio: string
  postCount: number
  followerCount: number
  isFollowing: boolean
  bellOn: boolean
  weeklyTopic?: WeeklyTopic
}

export interface WeeklyTopic {
  weekLabel: string
  topicText: string
  benefitDescription: string
}

// ─── Feed / Pagination ───────────────────────────────────────────────────────

export type SortMode = 'popular' | 'latest'

export interface FeedPage {
  posts: Post[]
  nextCursor: string | null
  hasMore: boolean
}

// ─── Holdings ────────────────────────────────────────────────────────────────

export interface Holding {
  stockCode: string
  stockName: string
  logoUrl: string | null
  quantity: number
  evaluationAmount: number
  unrealisedPnl: number
  returnRate: number
}

// ─── Report ───────────────────────────────────────────────────────────────────

export type ReportCategory =
  | 'SPAM'
  | 'ABUSE'
  | 'ADULT'
  | 'ILLEGAL'
  | 'PRIVACY'
  | 'FLOOD'
  | 'HARASSMENT'
  | 'OFF_TOPIC'

// ─── Onboarding ──────────────────────────────────────────────────────────────

export interface OnboardingTerms {
  termsService: boolean
  privacyConsent: boolean
  notificationConsent: boolean
  marketingConsent: boolean
}

// ─── DB row → App type helpers ────────────────────────────────────────────────
// Use these to map raw Supabase rows to typed objects

export function mapCommunityUser(row: Record<string, unknown>): CommunityUser {
  return {
    id: row.id as string,
    authUserId: row.auth_user_id as string,
    nickname: row.nickname as string,
    profileImage: (row.profile_image as string | null) ?? null,
    bio: (row.bio as string | null) ?? null,
    isMember: (row.is_member as boolean) ?? false,
    postCount: (row.post_count as number) ?? 0,
    followerCount: (row.follower_count as number) ?? 0,
    followingCount: (row.following_count as number) ?? 0,
    feedPublic: (row.feed_public as boolean) ?? true,
    holdingsPublic: (row.holdings_public as boolean) ?? true,
    performancePublic: (row.performance_public as boolean) ?? true,
    scrapPublic: (row.scrap_public as boolean) ?? true,
    notifLike: (row.notif_like as boolean) ?? true,
    notifComment: (row.notif_comment as boolean) ?? true,
    notifPostMention: (row.notif_post_mention as boolean) ?? true,
    notifCommentMention: (row.notif_comment_mention as boolean) ?? true,
    notifRepost: (row.notif_repost as boolean) ?? true,
    notifNewFollower: (row.notif_new_follower as boolean) ?? true,
    notifNewPostBell: (row.notif_new_post_bell as boolean) ?? true,
    createdAt: row.created_at as string,
  }
}

export function mapPost(
  row: Record<string, unknown>,
  currentUserId?: string
): Post {
  const likedByUser = currentUserId
    ? ((row.post_likes as { user_id: string }[] | null) ?? []).some(
        (l) => l.user_id === currentUserId
      )
    : false

  const scrappedByUser = currentUserId
    ? ((row.post_scraps as { user_id: string }[] | null) ?? []).some(
        (s) => s.user_id === currentUserId
      )
    : false

  // topic_tags is JSONB in posts table
  const topicTagsRaw = (row.topic_tags as TopicTag[] | null) ?? []
  // ai_hashtags is JSONB — can be string[] or {tag: string}[]
  const aiHashtagsRaw = row.ai_hashtags
  const aiHashtags: string[] = Array.isArray(aiHashtagsRaw)
    ? aiHashtagsRaw.map((h) => (typeof h === 'string' ? h : (h as { tag: string }).tag))
    : []

  // vote_options JSONB — array of option objects
  const voteOptionsRaw = (row.vote_options as VoteOption[] | null) ?? null

  // profit_rate_holdings JSONB
  const profitRateRaw = (row.profit_rate_holdings as ProfitRateItem[] | null) ?? null

  const authorRow = row.author as Record<string, unknown> | null
  const author = authorRow ? mapCommunityUser(authorRow) : null

  return {
    id: row.id as string,
    authorId: row.author_id as string,
    author,
    type: row.type as PostType,
    status: row.status as PostStatus,
    body: (row.body as string | null) ?? null,
    images: (row.images as string[] | null) ?? null,
    voteOptions: voteOptionsRaw,
    profitRateHoldings: profitRateRaw,
    linkUrl: (row.link_url as string | null) ?? null,
    linkMeta: (row.link_meta as LinkMeta | null) ?? null,
    repostOf: (row.repost_of as string | null) ?? null,
    repostParent: null,
    topicTags: topicTagsRaw,
    aiHashtags,
    likeCount: (row.like_count as number) ?? 0,
    commentCount: (row.comment_count as number) ?? 0,
    replyCount: (row.reply_count as number) ?? 0,
    repostCount: (row.repost_count as number) ?? 0,
    scrapCount: (row.scrap_count as number) ?? 0,
    shareCount: (row.share_count as number) ?? 0,
    reportCount: (row.report_count as number) ?? 0,
    score: (row.score as number | null) ?? null,
    isLiked: likedByUser,
    isScrapped: scrappedByUser,
    isHidden: false,
    isEdited: !!row.edited_at,
    editedAt: (row.edited_at as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}
