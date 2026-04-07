import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import MyFeedClient from './MyFeedClient'

export default async function MyFeedPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/community/my')

  const { data: communityUser } = await supabase
    .from('community_users')
    .select('id, nickname, avatar_url, bio, post_count, follower_count, following_count, feed_public, scrap_public')
    .eq('user_id', user.id)
    .single()

  if (!communityUser) redirect('/community/join')

  return <MyFeedClient communityUser={communityUser} />
}
