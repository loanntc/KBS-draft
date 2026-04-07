import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CommunityShell from '@/components/layout/CommunityShell'

/**
 * FR-3.1 — Two-Gate Access Flow
 * Gate 1: Login check
 * Gate 2: Community membership check
 */
export default async function CommunityLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  // Gate 1 — Login check
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login?next=/community')
  }

  // Gate 2 — Community membership check
  const { data: communityUser } = await supabase
    .from('community_users')
    .select('id, nickname, avatar_url')
    .eq('user_id', user.id)
    .single()

  if (!communityUser) {
    redirect('/community/join')
  }

  return (
    <CommunityShell currentUser={communityUser}>
      {children}
    </CommunityShell>
  )
}
