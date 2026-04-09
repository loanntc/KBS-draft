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
    .eq('auth_user_id', user.id)
    .single()

  if (!communityUser) redirect('/community/join')

  // Fetch top accounts by follower count (is_expert field doesn't exist)
  const { data: experts } = await supabase
    .from('community_users')
    .select('id, nickname, profile_image, follower_count, post_count, bio')
    .order('follower_count', { ascending: false })
    .neq('id', communityUser.id)
    .limit(50)

  // TOP 5 leaderboard
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
