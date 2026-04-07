'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Star, Info } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn, formatFollowerCount } from '@/lib/utils'
import PostCard from '@/components/post/PostCard'
import { Post } from '@/types'

interface ExpertUser {
  id: string
  nickname: string
  avatar_url: string | null
  is_expert: boolean
  follower_count: number
  post_count: number
  bio: string | null
}

interface ExpertClientProps {
  currentUserId: string
  experts: ExpertUser[]
  top5: ExpertUser[]
  initialFollowedIds: string[]
}

const RANK_COLORS = ['text-yellow-500', 'text-gray-400', 'text-amber-600', 'text-gray-500', 'text-gray-500']

export default function ExpertClient({ currentUserId, experts, top5, initialFollowedIds }: ExpertClientProps) {
  const supabase = createClient()
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set(initialFollowedIds))
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)

  const fetchExpertPosts = useCallback(async () => {
    setLoading(true)
    const expertIds = experts.map((e) => e.id)
    if (expertIds.length === 0) { setLoading(false); return }

    const { data } = await supabase
      .from('posts')
      .select(`
        *,
        author:community_users!posts_author_id_fkey(
          id, nickname, avatar_url, is_expert, follower_count,
          feed_public, holdings_public, performance_public, scrap_public, bio, post_count, following_count, created_at
        ),
        post_topic_tags(tag_type, value, display_name),
        post_ai_hashtags(tag),
        vote_options(id, label, vote_count, sort_order),
        likes!left(id, user_id),
        scraps!left(id, user_id)
      `)
      .in('author_id', expertIds)
      .eq('status', 'PUBLISHED')
      .order('created_at', { ascending: false })
      .limit(40)

    if (data) {
      const enriched = data.map((p: Record<string, unknown>) => ({
        ...p,
        topicTags: (p.post_topic_tags as {tag_type: string; value: string; display_name: string}[] ?? []).map((t) => ({
          type: t.tag_type,
          value: t.value,
          displayName: t.display_name,
        })),
        aiHashtags: (p.post_ai_hashtags as {tag: string}[] ?? []).map((h) => h.tag),
        isLiked: (p.likes as {user_id: string}[] ?? []).some((l) => l.user_id === currentUserId),
        isScrapped: (p.scraps as {user_id: string}[] ?? []).some((s) => s.user_id === currentUserId),
        isHidden: false,
        voteOptions: p.vote_options ?? null,
        profitRateItems: null,
      })) as Post[]
      setPosts(enriched)
    }
    setLoading(false)
  }, [experts, currentUserId, supabase])

  useEffect(() => {
    fetchExpertPosts()
  }, [fetchExpertPosts])

  const handleFollow = async (expertId: string) => {
    if (followedIds.has(expertId)) {
      await supabase.from('follows').delete()
        .eq('follower_id', currentUserId).eq('followee_id', expertId)
      setFollowedIds((prev) => { const s = new Set(prev); s.delete(expertId); return s })
    } else {
      await supabase.from('follows').insert({
        follower_id: currentUserId,
        followee_id: expertId,
        bell_enabled: false,
      })
      setFollowedIds((prev) => new Set(prev).add(expertId))
    }
  }

  return (
    <div className="min-h-screen bg-white max-w-[430px] mx-auto">

      {/* ── Expert strip (horizontal scroll) ── */}
      {experts.length > 0 && (
        <section className="border-b border-gray-100 py-4">
          <div className="flex gap-4 px-4 overflow-x-auto scrollbar-hide pb-1">
            {experts.slice(0, 20).map((expert) => (
              <Link
                key={expert.id}
                href={`/community/user/${expert.id}`}
                className="flex flex-col items-center gap-1.5 flex-shrink-0"
              >
                <div className="relative">
                  <div className="w-12 h-12 rounded-full bg-gray-200 overflow-hidden ring-2 ring-[#FFD700]">
                    {expert.avatar_url ? (
                      <Image
                        src={expert.avatar_url}
                        alt={expert.nickname}
                        width={48}
                        height={48}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-sm font-bold text-white">
                        {expert.nickname[0]?.toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-[#FFD700] rounded-full flex items-center justify-center">
                    <Star size={9} className="text-gray-900" fill="currentColor" />
                  </div>
                </div>
                <span className="text-[10px] text-gray-600 font-medium text-center w-14 truncate">
                  {expert.nickname}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── TOP 5 Leaderboard ── */}
      <section className="border-b border-gray-100 px-4 py-4">
        <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1.5">
          <Star size={14} className="text-[#FFD700]" fill="currentColor" />
          전문가 TOP 5
        </h2>
        <div className="flex flex-col gap-3">
          {top5.map((expert, i) => (
            <div key={expert.id} className="flex items-center gap-3">
              <span className={cn('text-sm font-bold w-5 text-center flex-shrink-0', RANK_COLORS[i])}>
                {i + 1}
              </span>
              <div className="w-9 h-9 rounded-full bg-gray-200 overflow-hidden flex-shrink-0 ring-1 ring-[#FFD700]/40">
                {expert.avatar_url ? (
                  <Image src={expert.avatar_url} alt={expert.nickname} width={36} height={36} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-xs font-bold text-white">
                    {expert.nickname[0]?.toUpperCase()}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <Link href={`/community/user/${expert.id}`} className="text-sm font-semibold text-gray-900 truncate block">
                  {expert.nickname}
                </Link>
                <p className="text-xs text-gray-400">팔로워 {formatFollowerCount(expert.follower_count)}</p>
              </div>
              <button
                onClick={() => handleFollow(expert.id)}
                className={cn(
                  'text-xs font-semibold px-3 py-1.5 rounded-full border flex-shrink-0 transition-all',
                  followedIds.has(expert.id)
                    ? 'border-gray-200 text-gray-400 bg-gray-50'
                    : 'border-[#FFD700] text-gray-900 bg-[#FFD700]'
                )}
              >
                {followedIds.has(expert.id) ? '팔로잉' : '팔로우'}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ── Expert disclaimer ── */}
      <div className="mx-4 my-3 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 flex gap-2">
        <Info size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-amber-700 leading-relaxed">
          전문가 탭의 계정은 금융 전문 자격을 보유한 것이 아닌, 커뮤니티 활동 기준으로 선정된 인플루언서입니다.
        </p>
      </div>

      {/* ── Expert Feed ── */}
      <section>
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-700 rounded-full animate-spin" />
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center py-12 gap-2 text-gray-400">
            <p className="text-sm">전문가 게시글이 없어요.</p>
          </div>
        ) : (
          posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentUserId={currentUserId}
              onUpdate={(updated) => setPosts((prev) => prev.map((p) => p.id === updated.id ? updated : p))}
              onDelete={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))}
            />
          ))
        )}
      </section>
    </div>
  )
}
