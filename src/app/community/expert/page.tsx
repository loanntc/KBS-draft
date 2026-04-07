import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ExpertClient from './ExpertClient'

export default async function ExpertPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/community/expert')

  const { data: communityUser } = await supabase
    .from('community_users')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!communityUser) redirect('/community/join')

  // Fetch expert accounts
  const { data: experts } = await supabase
    .from('community_users')
    .select('id, nickname, avatar_url, is_expert, follower_count, post_count, bio')
    .eq('is_expert', true)
    .order('follower_count', { ascending: false })
    .limit(50)

  // TOP 5 expert leaderboard
  const top5 = (experts ?? []).slice(0, 5)

  // Check which experts current user follows
  const expertIds = (experts ?? []).map((e) => e.id)
  const { data: followData } = await supabase
    .from('follows')
    .select('followee_id')
    .eq('follower_id', communityUser.id)
    .in('followee_id', expertIds)

  const followedExpertIds = new Set((followData ?? []).map((f) => f.followee_id))

  return (
    <ExpertClient
      currentUserId={communityUser.id}
      experts={experts ?? []}
      top5={top5}
      initialFollowedIds={Array.from(followedExpertIds)}
    />
  )
}
