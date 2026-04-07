import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Post } from '@/types'
import PostCard from '@/components/post/PostCard'
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
    .select('id, nickname, avatar_url')
    .eq('user_id', user.id)
    .single()

  const { data: rawPost, error } = await supabase
    .from('posts')
    .select(`
      *,
      author:community_users!posts_author_id_fkey(
        id, nickname, avatar_url, is_expert, follower_count,
        feed_public, holdings_public, performance_public, scrap_public,
        bio, post_count, following_count, created_at
      ),
      post_topic_tags(tag_type, value, display_name),
      post_ai_hashtags(tag),
      vote_options(id, label, vote_count, sort_order),
      profit_rate_items(stock_code, stock_name, logo_url, quantity, evaluation_amount, unrealised_pnl, return_rate),
      likes!left(id, user_id),
      scraps!left(id, user_id)
    `)
    .eq('id', id)
    .single()

  if (error || !rawPost) {
    notFound()
  }

  const currentUserId = communityUser?.id ?? ''

  const post: Post = {
    ...rawPost,
    topicTags: (rawPost.post_topic_tags ?? []).map((t: { tag_type: string; value: string; display_name: string }) => ({
      type: t.tag_type,
      value: t.value,
      displayName: t.display_name,
    })),
    aiHashtags: (rawPost.post_ai_hashtags ?? []).map((h: { tag: string }) => h.tag),
    isLiked: (rawPost.likes ?? []).some((l: { user_id: string }) => l.user_id === currentUserId),
    isScrapped: (rawPost.scraps ?? []).some((s: { user_id: string }) => s.user_id === currentUserId),
    voteOptions: rawPost.vote_options ?? null,
    profitRateItems: rawPost.profit_rate_items ?? null,
    isHidden: false,
  }

  return (
    <div className="min-h-screen bg-white max-w-[430px] mx-auto flex flex-col">
      <PostDetailClient post={post} currentUserId={currentUserId} />
      <div className="flex-1 flex flex-col">
        <CommentSection postId={id} currentUserId={currentUserId} />
      </div>
    </div>
  )
}
