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
    .eq('auth_user_id', user.id)
    .single()

  if (!communityUser) redirect('/community/join')

  // Fetch notifications
  const { data: notifications } = await supabase
    .from('notifications')
    .select(`
      id, type, is_read, post_id, comment_id, created_at,
      sender:community_users!notifications_sender_id_fkey(
        id, nickname, profile_image, created_at,
        is_member, post_count, follower_count, following_count,
        feed_public, holdings_public, performance_public, scrap_public,
        notif_like, notif_comment, notif_post_mention, notif_comment_mention,
        notif_repost, notif_new_follower, notif_new_post_bell
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

  // Supabase returns joined single row as array — flatten sender field
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const normalized = (notifications ?? []).map((n: any) => ({
    ...n,
    sender: Array.isArray(n.sender) ? (n.sender[0] ?? null) : n.sender,
  }))

  return (
    <NotificationsClient
      notifications={normalized}
      currentUserId={communityUser.id}
    />
  )
}
