import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { formatDistanceToNow, differenceInHours, differenceInDays, format } from 'date-fns'
import { ko } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * BR-17: Timestamp format
 * < 24h  → 'n시간 전'
 * 24h–7d → 'n일 전'
 * ≥ 7d   → 'mm월 dd일'
 */
export function formatTimestamp(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const hoursAgo = differenceInHours(now, date)
  const daysAgo = differenceInDays(now, date)

  if (hoursAgo < 24) {
    if (hoursAgo < 1) return '방금 전'
    return `${hoursAgo}시간 전`
  }
  if (daysAgo < 7) {
    return `${daysAgo}일 전`
  }
  return format(date, 'MM월 dd일', { locale: ko })
}

/**
 * BR-09: Portfolio amount banding — never expose exact valuation
 */
export function formatPortfolioBand(amount: number): string {
  if (amount < 1_000_000) return '100만원 미만'
  if (amount < 10_000_000) {
    const hundreds = Math.floor(amount / 1_000_000)
    return `${hundreds}00만원대`
  }
  if (amount < 100_000_000) {
    const thousands = Math.floor(amount / 10_000_000)
    return `${thousands},000만원대`
  }
  return '1억원 이상'
}

/**
 * Format follower count
 * ≤ 9,999  → 'n명'
 * ≥ 10,000 → 'n만'
 */
export function formatFollowerCount(count: number): string {
  if (count < 10000) return `${count}명`
  return `${(count / 10000).toFixed(1)}만`
}

/**
 * Validate nickname
 * - Korean (가-힣), English lowercase (a–z), digits (0–9)
 * - 3–10 characters
 */
export function validateNickname(value: string): string | null {
  if (value.length < 3) return '최소 3자 이상 입력해주세요.'
  if (value.length > 10) return '최대 10자까지 입력할 수 있어요.'
  if (!/^[가-힣a-z0-9]+$/.test(value)) return '사용할 수 없는 문자가 포함되어 있어요.'
  return null
}

/**
 * BR-06: Post popularity score formula
 */
export function calculatePostScore(
  likes: number,
  comments: number,
  replies: number,
  scraps: number,
  reposts: number,
  externalShares: number,
  createdAt: string
): number {
  const ageHours = differenceInHours(new Date(), new Date(createdAt))
  const recencyMultiplier = ageHours < 24 ? 1.5 : 1.0
  const raw = likes * 1 + comments * 3 + replies * 3 + scraps * 5 + reposts * 8 + externalShares * 10
  return raw * recencyMultiplier
}

/**
 * Deep link builder
 */
export const deepLink = {
  post: (postId: string) => `mable://community/post/${postId}`,
  user: (userId: string) => `mable://community/user/${userId}`,
  hashtag: (tag: string) => `mable://community/hashtag/${encodeURIComponent(tag)}`,
  theme: (themeId: string) => `mable://community/theme/${themeId}`,
  home: () => 'mable://community/home',
  stock: (stockCode: string) => `mable://community/stock/${stockCode}/community`,
}
