import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import FollowingClient from './FollowingClient'

export default async function FollowingPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/community/following')

  const { data: communityUser } = await supabase
    .from('community_users')
    .select('id, nickname')
    .eq('auth_user_id', user.id)
    .single()

  if (!communityUser) redirect('/community/join')

  // Fetch followed accounts with latest post info
  const { data: following } = await supabase
    .from('follows')
    .select(`
      followee_id, bell_on,
      followee:community_users!follows_followee_id_fkey(
        id, nickname, profile_image, post_count, follower_count
      )
    `)
    .eq('follower_id', communityUser.id)
    .limit(100)

  // TOP 5 most followed accounts
  const { data: top5 } = await supabase
    .from('community_users')
    .select('id, nickname, profile_image, follower_count, post_count')
    .order('follower_count', { ascending: false })
    .neq('id', communityUser.id)
    .limit(5)

  // Supabase returns joined single row as array — flatten followee field
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const normalizedFollowing = (following ?? []).map((f: any) => ({
    ...f,
    followee: Array.isArray(f.followee) ? (f.followee[0] ?? null) : f.followee,
  }))

  return (
    <FollowingClient
      currentUserId={communityUser.id}
      following={normalizedFollowing}
      top5={top5 ?? []}
    />
  )
}
