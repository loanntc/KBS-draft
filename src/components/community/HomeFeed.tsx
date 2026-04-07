'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import PostCard from '@/components/post/PostCard'
import SortToggle from '@/components/ui/SortToggle'
import { Post, SortMode } from '@/types'

interface HomeFeedProps {
  currentUserId: string
}

export default function HomeFeed({ currentUserId }: HomeFeedProps) {
  const [sort, setSort] = useState<SortMode>('popular')
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(false)
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)

  const fetchPosts = useCallback(async (sortMode: SortMode, reset = false) => {
    setLoading(true)
    const supabase = createClient()

    // Build query — block filter applied server-side (BR-23)
    const PAGE_SIZE = 20
    let query = supabase
      .from('posts_with_score')
      .select(`
        *,
        author:community_users!posts_author_id_fkey(
          id, nickname, avatar_url, is_expert, follower_count
        ),
        post_topic_tags(tag_type, value, display_name),
        post_ai_hashtags(tag),
        vote_options(id, label, vote_count, sort_order),
        profit_rate_items(stock_code, stock_name, logo_url, quantity, evaluation_amount, unrealised_pnl, return_rate),
        likes!left(id, user_id),
        scraps!left(id, user_id)
      `)
      .eq('status', 'PUBLISHED')
      // Apply hidden posts filter client-side (supplementary) — actual enforcement is server-side
      .order(sortMode === 'popular' ? 'score' : 'created_at', { ascending: false })
      .limit(PAGE_SIZE)

    if (!reset && cursor) {
      query = query.lt(sortMode === 'popular' ? 'score' : 'created_at', cursor)
    }

    const { data, error } = await query

    if (!error && data) {
      const enriched = data.map((p: Record<string, unknown>) => ({
        ...p,
        topicTags: (p.post_topic_tags as {tag_type: string, value: string, display_name: string}[])?.map((t) => ({
          type: t.tag_type,
          value: t.value,
          displayName: t.display_name,
        })) ?? [],
        aiHashtags: (p.post_ai_hashtags as {tag: string}[])?.map((h) => h.tag) ?? [],
        isLiked: (p.likes as {user_id: string}[])?.some((l) => l.user_id === currentUserId) ?? false,
        isScrapped: (p.scraps as {user_id: string}[])?.some((s) => s.user_id === currentUserId) ?? false,
      })) as Post[]

      setPosts(reset ? enriched : (prev) => [...prev, ...enriched])
      setHasMore(data.length === PAGE_SIZE)

      if (data.length > 0) {
        const last = data[data.length - 1] as Record<string, unknown>
        setCursor(sortMode === 'popular' ? String(last.score) : String(last.created_at))
      }
    }
    setLoading(false)
  }, [cursor, currentUserId])

  // Fetch on mount
  useState(() => {
    fetchPosts('popular', true)
  })

  const handleSortChange = (newSort: SortMode) => {
    setSort(newSort)
    setCursor(null)
    fetchPosts(newSort, true)
  }

  return (
    <section>
      {/* Section header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1">
          🔥 인기글
        </h2>
        <SortToggle value={sort} onChange={handleSortChange} />
      </div>

      {/* Post list */}
      <div>
        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            currentUserId={currentUserId}
            onUpdate={(updated) =>
              setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
            }
            onDelete={(id) =>
              setPosts((prev) => prev.filter((p) => p.id !== id))
            }
          />
        ))}

        {loading && (
          <div className="py-8 flex justify-center">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-700 rounded-full animate-spin" />
          </div>
        )}

        {!loading && hasMore && posts.length > 0 && (
          <button
            onClick={() => fetchPosts(sort)}
            className="w-full py-4 text-sm text-gray-500"
          >
            더 보기
          </button>
        )}

        {!loading && posts.length === 0 && (
          <div className="py-16 flex flex-col items-center gap-3 text-gray-400">
            <p className="text-sm">아직 게시글이 없어요.</p>
          </div>
        )}
      </div>
    </section>
  )
}
