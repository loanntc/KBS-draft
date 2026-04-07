'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Bell, Settings, Camera, Lock, Globe } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn, formatFollowerCount } from '@/lib/utils'
import PostCard from '@/components/post/PostCard'
import SortToggle from '@/components/ui/SortToggle'
import { Post, SortMode } from '@/types'

interface CommunityUserData {
  id: string
  nickname: string
  avatar_url: string | null
  bio: string | null
  post_count: number
  follower_count: number
  following_count: number
  feed_public: boolean
  scrap_public: boolean
}

type TabId = 'feed' | 'invest' | 'scrap'

const TABS: { id: TabId; label: string }[] = [
  { id: 'feed', label: '피드' },
  { id: 'invest', label: '투자' },
  { id: 'scrap', label: '스크랩' },
]

interface MyFeedClientProps {
  communityUser: CommunityUserData
}

export default function MyFeedClient({ communityUser }: MyFeedClientProps) {
  const router = useRouter()
  const supabase = createClient()

  const [activeTab, setActiveTab] = useState<TabId>('feed')
  const [sort, setSort] = useState<SortMode>('latest')
  const [feedPublic, setFeedPublic] = useState(communityUser.feed_public)
  const [posts, setPosts] = useState<Post[]>([])
  const [scrapPosts, setScrapPosts] = useState<Post[]>([])
  const [loadingFeed, setLoadingFeed] = useState(false)
  const [loadingScrap, setLoadingScrap] = useState(false)

  const fetchMyPosts = useCallback(async (sortMode: SortMode) => {
    setLoadingFeed(true)
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
      .eq('author_id', communityUser.id)
      .neq('status', 'DELETED_BY_AUTHOR')
      .neq('status', 'DELETED_BY_ADMIN')
      .order(sortMode === 'popular' ? 'score' : 'created_at', { ascending: false })
      .limit(50)

    if (data) {
      const enriched = data.map((p: Record<string, unknown>) => ({
        ...p,
        topicTags: (p.post_topic_tags as {tag_type: string; value: string; display_name: string}[] ?? []).map((t) => ({
          type: t.tag_type,
          value: t.value,
          displayName: t.display_name,
        })),
        aiHashtags: (p.post_ai_hashtags as {tag: string}[] ?? []).map((h) => h.tag),
        isLiked: (p.likes as {user_id: string}[] ?? []).some((l) => l.user_id === communityUser.id),
        isScrapped: (p.scraps as {user_id: string}[] ?? []).some((s) => s.user_id === communityUser.id),
        isHidden: false,
        voteOptions: p.vote_options ?? null,
        profitRateItems: null,
      })) as Post[]
      setPosts(enriched)
    }
    setLoadingFeed(false)
  }, [communityUser.id, supabase])

  const fetchScraps = useCallback(async () => {
    setLoadingScrap(true)
    const { data } = await supabase
      .from('scraps')
      .select(`
        post_id,
        post:posts!scraps_post_id_fkey(
          *,
          author:community_users!posts_author_id_fkey(
            id, nickname, avatar_url, is_expert, follower_count,
            feed_public, holdings_public, performance_public, scrap_public, bio, post_count, following_count, created_at
          ),
          post_topic_tags(tag_type, value, display_name),
          post_ai_hashtags(tag),
          vote_options(id, label, vote_count, sort_order),
          likes!left(id, user_id)
        )
      `)
      .eq('user_id', communityUser.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (data) {
      const enriched = data
        .map((row: Record<string, unknown>) => {
          const p = row.post as Record<string, unknown>
          if (!p) return null
          return {
            ...p,
            topicTags: (p.post_topic_tags as {tag_type: string; value: string; display_name: string}[] ?? []).map((t) => ({
              type: t.tag_type,
              value: t.value,
              displayName: t.display_name,
            })),
            aiHashtags: (p.post_ai_hashtags as {tag: string}[] ?? []).map((h) => h.tag),
            isLiked: (p.likes as {user_id: string}[] ?? []).some((l) => l.user_id === communityUser.id),
            isScrapped: true,
            isHidden: false,
            voteOptions: p.vote_options ?? null,
            profitRateItems: null,
          } as Post
        })
        .filter(Boolean) as Post[]
      setScrapPosts(enriched)
    }
    setLoadingScrap(false)
  }, [communityUser.id, supabase])

  useEffect(() => {
    fetchMyPosts('latest')
    fetchScraps()
  }, [fetchMyPosts, fetchScraps])

  const handleSortChange = (s: SortMode) => {
    setSort(s)
    fetchMyPosts(s)
  }

  const updatePost = (updated: Post) => {
    setPosts((prev) => prev.map((p) => p.id === updated.id ? updated : p))
  }
  const deletePost = (id: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== id))
  }
  const updateScrap = (updated: Post) => {
    setScrapPosts((prev) => prev.map((p) => p.id === updated.id ? updated : p))
  }

  return (
    <div className="min-h-screen bg-white max-w-[430px] mx-auto flex flex-col">
      {/* ── Top Bar ── */}
      <header className="sticky top-0 z-20 bg-white border-b border-gray-100">
        <div className="flex items-center justify-between px-2 h-14">
          <button onClick={() => router.back()} className="p-2 text-gray-700">
            <ChevronLeft size={22} />
          </button>
          <h1 className="text-base font-bold text-gray-900">내 피드</h1>
          <div className="flex items-center gap-1">
            <Link href="/community/notifications" className="p-2 text-gray-700">
              <Bell size={20} />
            </Link>
            <Link href="/community/settings" className="p-2 text-gray-700">
              <Settings size={20} />
            </Link>
          </div>
        </div>
      </header>

      {/* ── Profile Block ── */}
      <div className="px-5 py-5 border-b border-gray-100">
        <div className="flex items-start justify-between">
          <Link href="/community/settings/profile" className="relative">
            <div className="w-16 h-16 rounded-full bg-gray-200 overflow-hidden">
              {communityUser.avatar_url ? (
                <Image
                  src={communityUser.avatar_url}
                  alt={communityUser.nickname}
                  width={64}
                  height={64}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-xl font-bold text-white">
                  {communityUser.nickname[0]?.toUpperCase()}
                </div>
              )}
            </div>
            <div className="absolute bottom-0 right-0 w-5 h-5 bg-gray-800 rounded-full flex items-center justify-center">
              <Camera size={11} className="text-white" />
            </div>
          </Link>

          <Link
            href="/community/settings/profile"
            className="text-xs font-semibold text-gray-700 border border-gray-200 px-3 py-1.5 rounded-full"
          >
            프로필 편집
          </Link>
        </div>

        <div className="mt-3">
          <h2 className="text-base font-bold text-gray-900">{communityUser.nickname}</h2>
          {communityUser.bio && (
            <p className="text-sm text-gray-500 mt-1 leading-relaxed">{communityUser.bio}</p>
          )}
        </div>

        {/* Stats */}
        <div className="flex gap-6 mt-3">
          <div className="text-center">
            <p className="text-sm font-bold text-gray-900">{communityUser.post_count}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">게시글</p>
          </div>
          <Link href="/community/my/followers" className="text-center">
            <p className="text-sm font-bold text-gray-900">{formatFollowerCount(communityUser.follower_count)}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">팔로워</p>
          </Link>
          <Link href="/community/my/following" className="text-center">
            <p className="text-sm font-bold text-gray-900">{formatFollowerCount(communityUser.following_count)}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">팔로잉</p>
          </Link>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex border-b border-gray-100">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              'flex-1 py-3 text-sm font-semibold transition-colors',
              activeTab === id
                ? 'text-gray-900 border-b-2 border-gray-900'
                : 'text-gray-400'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      <div className="flex-1">

        {/* FEED TAB */}
        {activeTab === 'feed' && (
          <div>
            {/* Controls */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
              <SortToggle value={sort} onChange={handleSortChange} />
              <button
                onClick={() => setFeedPublic(!feedPublic)}
                className="flex items-center gap-1.5 text-xs text-gray-600 border border-gray-200 px-2.5 py-1.5 rounded-full"
              >
                {feedPublic ? <Globe size={13} /> : <Lock size={13} />}
                {feedPublic ? '공개' : '비공개'}
              </button>
            </div>

            {loadingFeed ? (
              <div className="flex justify-center py-12">
                <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-700 rounded-full animate-spin" />
              </div>
            ) : posts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
                <p className="text-sm">아직 게시글이 없어요.</p>
                <Link
                  href="/community"
                  className="text-xs text-[#FFD700] font-semibold border border-[#FFD700] px-4 py-2 rounded-full"
                >
                  첫 게시글 작성하기
                </Link>
              </div>
            ) : (
              posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  currentUserId={communityUser.id}
                  onUpdate={updatePost}
                  onDelete={deletePost}
                />
              ))
            )}
          </div>
        )}

        {/* INVEST TAB */}
        {activeTab === 'invest' && (
          <div className="flex flex-col items-center justify-center py-16 px-8 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center">
              <span className="text-2xl">📊</span>
            </div>
            <p className="text-sm font-semibold text-gray-700 text-center">투자 정보</p>
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-center">
              <p className="text-xs text-amber-700 leading-relaxed">
                이 탭은 M-able 앱과 연동된 투자 현황을 보여줍니다.<br />
                투자 정보는 본인의 공개 설정에 따라 노출 여부가 결정됩니다.
              </p>
            </div>
            <Link
              href="/community/settings/privacy"
              className="text-xs text-[#0046BE] font-semibold"
            >
              정보 공개 설정 변경
            </Link>
          </div>
        )}

        {/* SCRAP TAB */}
        {activeTab === 'scrap' && (
          <div>
            {loadingScrap ? (
              <div className="flex justify-center py-12">
                <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-700 rounded-full animate-spin" />
              </div>
            ) : scrapPosts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-gray-400">
                <p className="text-sm">스크랩한 게시글이 없어요.</p>
                <p className="text-xs">마음에 드는 게시글을 스크랩해보세요!</p>
              </div>
            ) : (
              scrapPosts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  currentUserId={communityUser.id}
                  onUpdate={updateScrap}
                  onDelete={(id) => setScrapPosts((prev) => prev.filter((p) => p.id !== id))}
                />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
