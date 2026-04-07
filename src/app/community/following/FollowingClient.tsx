'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Medal } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn, formatFollowerCount } from '@/lib/utils'
import PostCard from '@/components/post/PostCard'
import { Post } from '@/types'

interface FollowUser {
  id: string
  nickname: string
  avatar_url: string | null
  is_expert: boolean
  follower_count: number
  post_count: number
}

interface FollowEntry {
  followee_id: string
  bell_enabled: boolean
  followee: FollowUser | null
}

interface FollowingClientProps {
  currentUserId: string
  following: FollowEntry[]
  top5: FollowUser[]
}

const RANK_COLORS = [
  'text-yellow-500',
  'text-gray-400',
  'text-amber-600',
  'text-gray-500',
  'text-gray-500',
]

export default function FollowingClient({ currentUserId, following, top5 }: FollowingClientProps) {
  const supabase = createClient()
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [followedIds, setFollowedIds] = useState<Set<string>>(
    new Set(following.map((f) => f.followee_id))
  )

  // Fetch recent posts from followed accounts
  const fetchFollowingPosts = useCallback(async () => {
    setLoading(true)
    const ids = following.map((f) => f.followee_id).filter(Boolean)

    if (ids.length === 0) {
      setLoading(false)
      return
    }

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
      .in('author_id', ids)
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
  }, [following, currentUserId, supabase])

  useEffect(() => {
    fetchFollowingPosts()
  }, [fetchFollowingPosts])

  const handleFollow = async (userId: string) => {
    if (followedIds.has(userId)) {
      await supabase.from('follows').delete()
        .eq('follower_id', currentUserId).eq('followee_id', userId)
      setFollowedIds((prev) => { const s = new Set(prev); s.delete(userId); return s })
    } else {
      await supabase.from('follows').insert({
        follower_id: currentUserId,
        followee_id: userId,
        bell_enabled: false,
      })
      setFollowedIds((prev) => new Set(prev).add(userId))
    }
  }

  const isFollowing = following.length > 0

  // Red dot: posted in last 24h - simplistic check via post's created_at
  const recentPosterIds = new Set(
    posts
      .filter((p) => {
        const hrs = (Date.now() - new Date(p.createdAt).getTime()) / 3600000
        return hrs < 24
      })
      .map((p) => p.authorId)
  )

  return (
    <div className="min-h-screen bg-white max-w-[430px] mx-auto">

      {/* ── Following strip ── */}
      {isFollowing && (
        <section className="border-b border-gray-100 py-4">
          <div className="flex gap-4 px-4 overflow-x-auto scrollbar-hide pb-1">
            {following.map(({ followee_id, followee }) => {
              if (!followee) return null
              return (
                <Link
                  key={followee_id}
                  href={`/community/user/${followee_id}`}
                  className="flex flex-col items-center gap-1.5 flex-shrink-0"
                >
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full bg-gray-200 overflow-hidden">
                      {followee.avatar_url ? (
                        <Image
                          src={followee.avatar_url}
                          alt={followee.nickname}
                          width={48}
                          height={48}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-sm font-bold text-white">
                          {followee.nickname[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>
                    {/* Red dot if posted in last 24h */}
                    {recentPosterIds.has(followee_id) && (
                      <span className="absolute top-0 right-0 w-3 h-3 bg-[#E8003D] border-2 border-white rounded-full" />
                    )}
                  </div>
                  <span className="text-[10px] text-gray-600 font-medium text-center w-14 truncate">
                    {followee.nickname}
                  </span>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* ── TOP 5 Leaderboard ── */}
      <section className="border-b border-gray-100 px-4 py-4">
        <h2 className="text-sm font-bold text-gray-900 mb-3">🏆 팔로워 TOP 5</h2>
        <div className="flex flex-col gap-3">
          {top5.map((u, i) => (
            <div key={u.id} className="flex items-center gap-3">
              {/* Rank */}
              <span className={cn('text-sm font-bold w-5 text-center flex-shrink-0', RANK_COLORS[i])}>
                {i === 0 ? <Medal size={18} className="text-yellow-500" /> : i + 1}
              </span>

              {/* Avatar */}
              <div className="w-9 h-9 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
                {u.avatar_url ? (
                  <Image src={u.avatar_url} alt={u.nickname} width={36} height={36} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-xs font-bold text-white">
                    {u.nickname[0]?.toUpperCase()}
                  </div>
                )}
              </div>

              {/* Name + stats */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <Link href={`/community/user/${u.id}`} className="text-sm font-semibold text-gray-900 truncate">
                    {u.nickname}
                  </Link>
                  {u.is_expert && (
                    <span className="text-[9px] text-blue-600 bg-blue-50 px-1 rounded-full flex-shrink-0">전문가</span>
                  )}
                </div>
                <p className="text-xs text-gray-400">팔로워 {formatFollowerCount(u.follower_count)}</p>
              </div>

              {/* Follow btn */}
              <button
                onClick={() => handleFollow(u.id)}
                className={cn(
                  'text-xs font-semibold px-3 py-1.5 rounded-full border flex-shrink-0 transition-all',
                  followedIds.has(u.id)
                    ? 'border-gray-200 text-gray-400 bg-gray-50'
                    : 'border-[#FFD700] text-gray-900 bg-[#FFD700]'
                )}
              >
                {followedIds.has(u.id) ? '팔로잉' : '팔로우'}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ── Feed ── */}
      <section>
        {!isFollowing && (
          <div className="flex flex-col items-center py-10 px-6 gap-3 text-center">
            <p className="text-sm font-semibold text-gray-700">아직 팔로우한 계정이 없어요.</p>
            <p className="text-xs text-gray-400">관심 있는 사람들을 팔로우하면<br />최신 게시글을 여기서 볼 수 있어요!</p>
          </div>
        )}

        {isFollowing && loading && (
          <div className="flex justify-center py-12">
            <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-700 rounded-full animate-spin" />
          </div>
        )}

        {isFollowing && !loading && posts.length === 0 && (
          <div className="flex flex-col items-center py-12 gap-2 text-gray-400">
            <p className="text-sm">팔로우한 계정의 새 게시글이 없어요.</p>
          </div>
        )}

        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            currentUserId={currentUserId}
            onUpdate={(updated) => setPosts((prev) => prev.map((p) => p.id === updated.id ? updated : p))}
            onDelete={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))}
          />
        ))}
      </section>
    </div>
  )
}
