import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Returns all author_ids that the current user should NOT see in their feed.
 * Bidirectional: users they blocked + users who blocked them (BR-M02-005).
 */
export async function getBlockedAuthorIds(
  supabase: SupabaseClient,
  currentUserId: string
): Promise<string[]> {
  const [blockedByMe, blockedMe] = await Promise.all([
    // Users I have blocked
    supabase
      .from('blocks')
      .select('blocked_id')
      .eq('blocker_id', currentUserId),
    // Users who have blocked me
    supabase
      .from('blocks')
      .select('blocker_id')
      .eq('blocked_id', currentUserId),
  ])

  const ids = new Set<string>()
  for (const row of blockedByMe.data ?? []) ids.add(row.blocked_id)
  for (const row of blockedMe.data ?? []) ids.add(row.blocker_id)
  return [...ids]
}

/**
 * Applies block exclusion filter to a Supabase query.
 * No-op if blockedIds is empty (avoids unnecessary .not() call).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyBlockFilter<T extends { not: (...args: any[]) => T }>(
  query: T,
  blockedIds: string[]
): T {
  if (blockedIds.length === 0) return query
  return query.not('author_id', 'in', `(${blockedIds.join(',')})`)
}
