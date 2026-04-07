import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import NotificationsClient from './NotificationsClient'

export default async function NotificationsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/community/notifications')

  const { data: communityUser } = await supabase
    .from('community_users')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!communityUser) redirect('/community/join')

  // Fetch notifications
  const { data: notifications } = await supabase
    .from('notifications')
    .select(`
      id, type, is_read, post_id, comment_id, created_at,
      actor:community_users!notifications_actor_id_fkey(
        id, nickname, avatar_url, is_expert
      )
    `)
    .eq('recipient_id', communityUser.id)
    .order('created_at', { ascending: false })
    .limit(100)

  // Mark all as read
  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('recipient_id', communityUser.id)
    .eq('is_read', false)

  // Supabase returns joined single row as array — flatten actor field
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const normalized = (notifications ?? []).map((n: any) => ({
    ...n,
    actor: Array.isArray(n.actor) ? (n.actor[0] ?? null) : n.actor,
  }))

  return (
    <NotificationsClient
      notifications={normalized}
      currentUserId={communityUser.id}
    />
  )
}
