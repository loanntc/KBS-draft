import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CommunityShell from '@/components/layout/CommunityShell'

export default async function CommunityLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  // Gate 1 — Login check
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/community')

  // Gate 2 — Community membership check
  const { data: communityUser } = await supabase
    .from('community_users')
    .select('id, nickname, profile_image, is_member')
    .eq('auth_user_id', user.id)
    .single()

  if (!communityUser || !communityUser.is_member) {
    redirect('/community/join')
  }

  return (
    <CommunityShell currentUser={{
      id: communityUser.id,
      nickname: communityUser.nickname,
      profileImage: communityUser.profile_image,
    }}>
      {children}
    </CommunityShell>
  )
}
