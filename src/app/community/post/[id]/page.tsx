import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { mapPost } from '@/types'
import CommentSection from '@/components/community/CommentSection'
import PostDetailClient from './PostDetailClient'

interface PostDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function PostDetailPage({ params }: PostDetailPageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-gray-500">로그인이 필요합니다.</p>
      </div>
    )
  }

  const { data: communityUser } = await supabase
    .from('community_users')
    .select('id, nickname, profile_image')
    .eq('auth_user_id', user.id)
    .single()

  const { data: rawPost, error } = await supabase
    .from('posts')
    .select(`
      *,
      author:community_users!posts_author_id_fkey(
        id, auth_user_id, nickname, profile_image, bio,
        is_member, post_count, follower_count, following_count,
        feed_public, holdings_public, performance_public, scrap_public,
        notif_like, notif_comment, notif_post_mention, notif_comment_mention,
        notif_repost, notif_new_follower, notif_new_post_bell, created_at
      ),
      post_likes!left(user_id),
      post_scraps!left(user_id)
    `)
    .eq('id', id)
    .single()

  if (error || !rawPost) {
    notFound()
  }

  const currentUserId = communityUser?.id ?? ''
  const post = mapPost(rawPost as Record<string, unknown>, currentUserId)

  return (
    <div className="min-h-screen bg-white max-w-[430px] mx-auto flex flex-col">
      <PostDetailClient post={post} currentUserId={currentUserId} />
      <div className="flex-1 flex flex-col">
        <CommentSection postId={id} currentUserId={currentUserId} />
      </div>
    </div>
  )
}
