import { createClient } from '@/lib/supabase/server'
import HomeFeed from '@/components/community/HomeFeed'
import RecommendationCarousel from '@/components/community/RecommendationCarousel'
import ThemeShortcuts from '@/components/community/ThemeShortcuts'

export default async function CommunityHomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: communityUser } = await supabase
    .from('community_users')
    .select('id, nickname, avatar_url')
    .eq('user_id', user!.id)
    .single()

  return (
    <div>
      {/* §8.3 — Personalised Recommendation Carousel */}
      <RecommendationCarousel
        userId={communityUser!.id}
        nickname={communityUser!.nickname}
      />

      {/* §8.4 — Theme Community Shortcuts */}
      <ThemeShortcuts />

      {/* §8.5 — Home Feed (인기글) */}
      <HomeFeed currentUserId={communityUser!.id} />
    </div>
  )
}
