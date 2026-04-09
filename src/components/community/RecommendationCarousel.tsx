'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Heart, MessageCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface RecommendationCarouselProps {
  userId: string
  nickname: string
}

interface RecommendedPost {
  id: string
  body: string | null
  like_count: number
  comment_count: number
  author: {
    id: string
    nickname: string
    profile_image: string | null
  } | null
}

export default function RecommendationCarousel({ userId, nickname }: RecommendationCarouselProps) {
  const supabase = createClient()
  const [posts, setPosts] = useState<RecommendedPost[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchRecommended = async () => {
      const { data } = await supabase
        .from('posts_with_score')
        .select(`
          id, body, like_count, comment_count, score,
          author:community_users!posts_author_id_fkey(
            id, nickname, profile_image
          )
        `)
        .eq('status', 'PUBLISHED')
        .order('score', { ascending: false })
        .limit(10)

      if (data) {
        // Supabase returns joined single row as array — flatten author field
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const normalized = data.map((p: any) => ({
          ...p,
          author: Array.isArray(p.author) ? (p.author[0] ?? null) : p.author,
        })) as RecommendedPost[]
        setPosts(normalized)
      }
      setLoading(false)
    }

    fetchRecommended()
  }, [userId, supabase])

  if (loading) {
    return (
      <section className="py-4 border-b border-gray-100">
        <div className="px-4 mb-3">
          <div className="h-4 w-48 bg-gray-100 rounded animate-pulse" />
        </div>
        <div className="flex gap-3 px-4 overflow-x-auto scrollbar-hide pb-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className="w-[180px] h-[120px] bg-gray-100 rounded-2xl flex-shrink-0 animate-pulse" />
          ))}
        </div>
      </section>
    )
  }

  if (posts.length === 0) return null

  return (
    <section className="py-4 border-b border-gray-100">
      {/* Section title */}
      <div className="px-4 mb-3">
        <h2 className="text-sm font-bold text-gray-900">
          ✨ <span className="text-[#0046BE]">{nickname}</span>님을 위한 추천글
        </h2>
      </div>

      {/* Horizontal scroll */}
      <div className="flex gap-3 px-4 overflow-x-auto scrollbar-hide pb-2">
        {posts.map((post) => (
          <Link
            key={post.id}
            href={`/community/post/${post.id}`}
            className="flex-shrink-0 w-[180px] bg-gray-50 rounded-2xl p-3 border border-gray-100 active:scale-[0.98] transition-transform"
          >
            {/* Author */}
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
                {post.author?.profile_image ? (
                  <Image
                    src={post.author.profile_image}
                    alt={post.author.nickname}
                    width={24}
                    height={24}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-[9px] font-bold text-white">
                    {post.author?.nickname?.[0]?.toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex items-center gap-1">
                <span className="text-[10px] font-semibold text-gray-700 truncate">
                  {post.author?.nickname}
                </span>
              </div>
            </div>

            {/* Excerpt */}
            <p className="text-xs text-gray-700 leading-relaxed line-clamp-3 mb-2">
              {post.body || '이미지/투표/링크 게시글'}
            </p>

            {/* Stats */}
            <div className="flex items-center gap-3">
              <span className={cn('flex items-center gap-1 text-[10px] text-gray-400')}>
                <Heart size={11} />
                {post.like_count}
              </span>
              <span className="flex items-center gap-1 text-[10px] text-gray-400">
                <MessageCircle size={11} />
                {post.comment_count}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
