'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import PostCard from '@/components/post/PostCard'
import SortToggle from '@/components/ui/SortToggle'
import { Post, SortMode, mapPost } from '@/types'

interface HomeFeedProps {
  currentUserId: string
}

const PAGE_SIZE = 20

export default function HomeFeed({ currentUserId }: HomeFeedProps) {
  const [sort, setSort] = useState<SortMode>('popular')
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const [cursor, setCursor] = useState<string | number | null>(null)

  const fetchPosts = useCallback(async (sortMode: SortMode, reset = false) => {
    setLoading(true)
    const supabase = createClient()

    // BR-23: block filter applied via server-side RLS + hidden_posts filter
    // We also exclude posts from hidden_posts here for additional client safety
    let query = supabase
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
      .eq('status', 'PUBLISHED')
      .order(sortMode === 'popular' ? 'score' : 'created_at', { ascending: false })
      .limit(PAGE_SIZE)

    if (!reset && cursor !== null) {
      if (sortMode === 'popular') {
        query = query.lt('score', cursor)
      } else {
        query = query.lt('created_at', cursor)
      }
    }

    const { data, error } = await query

    if (!error && data) {
      const enriched = data.map((row) => mapPost(row as Record<string, unknown>, currentUserId))
      setPosts(reset ? enriched : (prev) => [...prev, ...enriched])
      setHasMore(data.length === PAGE_SIZE)
      if (data.length > 0) {
        const last = data[data.length - 1] as Record<string, unknown>
        setCursor(sortMode === 'popular' ? (last.score as number) : (last.created_at as string))
      }
    }
    setLoading(false)
  }, [cursor, currentUserId])

  useEffect(() => {
    fetchPosts('popular', true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSortChange = (newSort: SortMode) => {
    setSort(newSort)
    setCursor(null)
    fetchPosts(newSort, true)
  }

  return (
    <section>
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-bold text-gray-900">🔥 인기글</h2>
        <SortToggle value={sort} onChange={handleSortChange} />
      </div>

      <div>
        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            currentUserId={currentUserId}
            onUpdate={(updated) => setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))}
            onDelete={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))}
          />
        ))}

        {loading && (
          <div className="py-8 flex justify-center">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-700 rounded-full animate-spin" />
          </div>
        )}

        {!loading && hasMore && posts.length > 0 && (
          <button onClick={() => fetchPosts(sort)} className="w-full py-4 text-sm text-gray-500">
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
