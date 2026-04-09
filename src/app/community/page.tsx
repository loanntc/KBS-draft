import { createClient } from '@/lib/supabase/server'
import HomeFeed from '@/components/community/HomeFeed'
import RecommendationCarousel from '@/components/community/RecommendationCarousel'
import ThemeShortcuts from '@/components/community/ThemeShortcuts'

export default async function CommunityHomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: communityUser } = await supabase
    .from('community_users')
    .select('id, nickname')
    .eq('auth_user_id', user!.id)
    .single()

  return (
    <div>
      <RecommendationCarousel userId={communityUser!.id} nickname={communityUser!.nickname} />
      <ThemeShortcuts />
      <HomeFeed currentUserId={communityUser!.id} />
    </div>
  )
}
