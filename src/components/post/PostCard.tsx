'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Heart, MessageCircle, Repeat2, Share2, Bookmark, MoreHorizontal } from 'lucide-react'
import toast from 'react-hot-toast'
import { Post } from '@/types'
import { cn, formatTimestamp } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import PostTypeContent from './PostTypeContent'
import PostMoreMenu from './PostMoreMenu'

interface PostCardProps {
  post: Post
  currentUserId: string
  onUpdate: (post: Post) => void
  onDelete: (id: string) => void
}

export default function PostCard({ post, currentUserId, onUpdate, onDelete }: PostCardProps) {
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [showFullBody, setShowFullBody] = useState(false)
  const isOwn = post.author?.id === currentUserId
  const supabase = createClient()

  // ── DELETED placeholder ──────────────────────────────────────────────────
  if (post.status === 'DELETED_BY_AUTHOR' || post.status === 'DELETED_BY_ADMIN') {
    return (
      <div className="post-card text-center text-gray-400 text-sm py-6">
        {post.status === 'DELETED_BY_AUTHOR'
          ? '삭제된 게시글입니다.'
          : '운영 정책에 의해 삭제된 게시글입니다.'
        }
      </div>
    )
  }

  // ── LIKE handler ─────────────────────────────────────────────────────────
  const handleLike = async () => {
    const optimisticPost = {
      ...post,
      isLiked: !post.isLiked,
      likeCount: post.isLiked ? post.likeCount - 1 : post.likeCount + 1,
    }
    onUpdate(optimisticPost)

    try {
      if (post.isLiked) {
        await supabase
          .from('likes')
          .delete()
          .eq('user_id', currentUserId)
          .eq('post_id', post.id)
      } else {
        await supabase
          .from('likes')
          .insert({ user_id: currentUserId, post_id: post.id })
      }
    } catch {
      // Revert on error
      onUpdate(post)
      toast.error('잠시 후 다시 시도해주세요.')
    }
  }

  // ── SCRAP handler ────────────────────────────────────────────────────────
  const handleScrap = async () => {
    const optimisticPost = {
      ...post,
      isScrapped: !post.isScrapped,
      scrapCount: post.isScrapped ? post.scrapCount - 1 : post.scrapCount + 1,
    }
    onUpdate(optimisticPost)

    try {
      if (post.isScrapped) {
        await supabase
          .from('scraps')
          .delete()
          .eq('user_id', currentUserId)
          .eq('post_id', post.id)
      } else {
        await supabase
          .from('scraps')
          .insert({ user_id: currentUserId, post_id: post.id })
      }
    } catch {
      onUpdate(post)
      toast.error('잠시 후 다시 시도해주세요.')
    }
  }

  // ── SHARE handler ────────────────────────────────────────────────────────
  const handleShare = async () => {
    const url = `${window.location.origin}/community/post/${post.id}`
    try {
      await navigator.share({ url })
    } catch {
      await navigator.clipboard.writeText(url)
      toast.success('링크가 복사되었어요.')
    }
  }

  return (
    <article className="post-card">
      {/* ── Author row ── */}
      <div className="flex items-start justify-between mb-3">
        <Link href={`/community/user/${post.author?.id}`} className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
            {post.author?.avatarUrl ? (
              <Image
                src={post.author.avatarUrl}
                alt={post.author.nickname}
                width={36}
                height={36}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-yellow-400 to-orange-400 flex items-center justify-center text-white text-xs font-bold">
                {post.author?.nickname?.[0]?.toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center gap-1">
              <span className="text-sm font-semibold text-gray-900">{post.author?.nickname}</span>
              {post.author?.isExpert && (
                <span className="text-[10px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">전문가</span>
              )}
            </div>
            <p className="text-xs text-gray-400">{formatTimestamp(post.createdAt)}</p>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          {/* Follow button — only on other users' posts */}
          {!isOwn && (
            <button className="text-xs font-medium text-[#FFD700] border border-[#FFD700] px-3 py-1 rounded-full">
              팔로우
            </button>
          )}
          <button
            onClick={() => setShowMoreMenu(true)}
            className="p-1 text-gray-400"
          >
            <MoreHorizontal size={18} />
          </button>
        </div>
      </div>

      {/* ── Topic tags ── */}
      {post.topicTags && post.topicTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {post.topicTags.map((tag) => (
            <Link
              key={tag.value}
              href={tag.type === 'theme'
                ? `/community/theme/${tag.value}`
                : `/community/hashtag/${encodeURIComponent(tag.value)}`
              }
              className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md"
            >
              #{tag.displayName}
            </Link>
          ))}
        </div>
      )}

      {/* ── Post body (text, max 5 lines) ── */}
      {post.body && (
        <div className="mb-3">
          <p className={cn(
            'text-sm text-gray-800 leading-relaxed whitespace-pre-wrap',
            !showFullBody && 'line-clamp-5'
          )}>
            {post.body}
          </p>
          {!showFullBody && post.body.split('\n').length > 5 && (
            <button
              onClick={() => setShowFullBody(true)}
              className="text-xs text-gray-500 mt-1"
            >
              더보기
            </button>
          )}
          {post.isEdited && (
            <span className="text-[10px] text-gray-400 ml-1">(수정됨)</span>
          )}
        </div>
      )}

      {/* ── Type-specific content ── */}
      <PostTypeContent post={post} currentUserId={currentUserId} />

      {/* ── AI Hashtags ── */}
      {post.aiHashtags && post.aiHashtags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2 mb-3">
          {post.aiHashtags.map((tag) => (
            <Link
              key={tag}
              href={`/community/hashtag/${encodeURIComponent(tag)}`}
              className="text-xs text-gray-500"
            >
              AI: #{tag}
            </Link>
          ))}
        </div>
      )}

      {/* ── Under Review label ── */}
      {post.status === 'UNDER_REVIEW' && isOwn && (
        <div className="mb-2">
          <span className="text-xs font-medium text-orange-600 bg-orange-50 px-2 py-1 rounded">검토중</span>
        </div>
      )}

      {/* ── Interaction row ── */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-50">
        <div className="flex items-center gap-4">
          {/* Like */}
          <button
            onClick={handleLike}
            className={cn('flex items-center gap-1.5 text-xs', post.isLiked ? 'like-active' : 'text-gray-500')}
          >
            <Heart size={18} fill={post.isLiked ? 'currentColor' : 'none'} />
            <span>{post.likeCount > 0 ? post.likeCount : ''}</span>
          </button>

          {/* Comment */}
          <Link
            href={`/community/post/${post.id}#comments`}
            className="flex items-center gap-1.5 text-xs text-gray-500"
          >
            <MessageCircle size={18} />
            <span>{post.commentCount > 0 ? post.commentCount : ''}</span>
          </Link>

          {/* Repost — blocked for UNDER_REVIEW (FR-11.6.1) */}
          {post.status !== 'UNDER_REVIEW' && (
            <Link
              href={`/community?repost=${post.id}`}
              className="flex items-center gap-1.5 text-xs text-gray-500"
            >
              <Repeat2 size={18} />
              <span>{post.repostCount > 0 ? post.repostCount : ''}</span>
            </Link>
          )}

          {/* Share — blocked for UNDER_REVIEW */}
          {post.status !== 'UNDER_REVIEW' && (
            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 text-xs text-gray-500"
            >
              <Share2 size={18} />
            </button>
          )}
        </div>

        {/* Scrap */}
        <button
          onClick={handleScrap}
          className={cn('flex items-center gap-1.5 text-xs', post.isScrapped ? 'scrap-active' : 'text-gray-500')}
        >
          <Bookmark size={18} fill={post.isScrapped ? 'currentColor' : 'none'} />
        </button>
      </div>

      {/* ── More Menu ── */}
      {showMoreMenu && (
        <PostMoreMenu
          post={post}
          isOwn={isOwn}
          currentUserId={currentUserId}
          onClose={() => setShowMoreMenu(false)}
          onDelete={onDelete}
          onUpdate={onUpdate}
        />
      )}
    </article>
  )
}
