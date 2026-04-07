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

export interface CommunityUser {
  id: string
  userId: string
  nickname: string
  avatarUrl: string | null
  bio: string | null
  isExpert: boolean
  postCount: number
  followerCount: number
  followingCount: number
  // Privacy settings
  feedPublic: boolean
  holdingsPublic: boolean
  performancePublic: boolean
  scrapPublic: boolean
  createdAt: string
}

// ─── Topic Tag ───────────────────────────────────────────────────────────────

export interface TopicTag {
  type: 'stock' | 'theme'
  value: string          // ticker / theme community name
  displayName: string
}

// ─── Post ─────────────────────────────────────────────────────────────────────

export interface Post {
  id: string
  authorId: string
  author: CommunityUser
  type: PostType
  status: PostStatus
  body: string | null
  images: string[] | null        // Type 2
  voteOptions: VoteOption[] | null // Type 3
  profitRateItems: ProfitRateItem[] | null // Type 4
  linkUrl: string | null          // Type 5
  linkMeta: LinkMeta | null
  repostParentId: string | null   // Type 6
  repostParent: Post | null
  topicTags: TopicTag[]
  aiHashtags: string[]
  // Interaction counts
  likeCount: number
  commentCount: number
  repostCount: number
  scrapCount: number
  externalShareCount: number
  // Computed
  score: number
  // User state (per current viewer)
  isLiked: boolean
  isScrapped: boolean
  isHidden: boolean
  // Edit
  isEdited: boolean
  editedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface VoteOption {
  id: string
  label: string
  voteCount: number
  percentage: number
  isUserVote: boolean
}

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

export interface LinkMeta {
  title: string | null
  description: string | null
  imageUrl: string | null
  url: string
}

// ─── Comment ──────────────────────────────────────────────────────────────────

export interface Comment {
  id: string
  postId: string
  authorId: string
  author: CommunityUser
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

export interface Notification {
  id: string
  recipientId: string
  type: NotificationType
  actorId: string
  actor: CommunityUser
  postId: string | null
  commentId: string | null
  isRead: boolean
  createdAt: string
}

// ─── Follow / Block ───────────────────────────────────────────────────────────

export interface FollowRelationship {
  followerId: string
  followeeId: string
  bellEnabled: boolean
  createdAt: string
}

export interface BlockRelationship {
  blockerId: string
  blockedId: string
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
  bellEnabled: boolean
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

// ─── Holdings (Portfolio) ────────────────────────────────────────────────────

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
