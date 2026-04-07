'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { Heart, CornerDownRight, Send, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn, formatTimestamp } from '@/lib/utils'
import { Comment } from '@/types'

interface CommentSectionProps {
  postId: string
  currentUserId: string
}

interface CommentWithReplies extends Comment {
  repliesExpanded: boolean
}

export default function CommentSection({ postId, currentUserId }: CommentSectionProps) {
  const supabase = createClient()
  const [comments, setComments] = useState<CommentWithReplies[]>([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [replyTarget, setReplyTarget] = useState<{ id: string; nickname: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // ── Fetch comments ─────────────────────────────────────────────────────────
  const fetchComments = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('comments')
      .select(`
        id, post_id, author_id, body, is_deleted, like_count, parent_comment_id, created_at,
        author:community_users!comments_author_id_fkey(
          id, nickname, avatar_url, is_expert
        ),
        likes!left(id, user_id)
      `)
      .eq('post_id', postId)
      .is('parent_comment_id', null)
      .order('created_at', { ascending: false })

    if (!error && data) {
      const enriched = await Promise.all(
        data.map(async (c: Record<string, unknown>) => {
          // Fetch replies
          const { data: replies } = await supabase
            .from('comments')
            .select(`
              id, post_id, author_id, body, is_deleted, like_count, parent_comment_id, created_at,
              author:community_users!comments_author_id_fkey(
                id, nickname, avatar_url, is_expert
              ),
              likes!left(id, user_id)
            `)
            .eq('parent_comment_id', c.id as string)
            .order('created_at', { ascending: true })

          const replyList = (replies || []).map((r: Record<string, unknown>) => ({
            id: r.id as string,
            postId: r.post_id as string,
            authorId: r.author_id as string,
            author: r.author as Comment['author'],
            body: r.body as string,
            isDeleted: r.is_deleted as boolean,
            likeCount: r.like_count as number,
            isLiked: (r.likes as {user_id: string}[])?.some((l) => l.user_id === currentUserId) ?? false,
            parentCommentId: r.parent_comment_id as string,
            replies: [],
            replyCount: 0,
            createdAt: r.created_at as string,
          })) as Comment[]

          return {
            id: c.id as string,
            postId: c.post_id as string,
            authorId: c.author_id as string,
            author: c.author as Comment['author'],
            body: c.body as string,
            isDeleted: c.is_deleted as boolean,
            likeCount: c.like_count as number,
            isLiked: (c.likes as {user_id: string}[])?.some((l) => l.user_id === currentUserId) ?? false,
            parentCommentId: null,
            replies: replyList,
            replyCount: replyList.length,
            createdAt: c.created_at as string,
            repliesExpanded: false,
          } as CommentWithReplies
        })
      )
      setComments(enriched)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchComments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId])

  // ── Like comment ───────────────────────────────────────────────────────────
  const handleLikeComment = async (commentId: string, currentlyLiked: boolean) => {
    // Optimistic update
    setComments((prev) => prev.map((c) => {
      if (c.id === commentId) {
        return {
          ...c,
          isLiked: !currentlyLiked,
          likeCount: currentlyLiked ? c.likeCount - 1 : c.likeCount + 1,
        }
      }
      return {
        ...c,
        replies: c.replies.map((r) => r.id === commentId
          ? { ...r, isLiked: !currentlyLiked, likeCount: currentlyLiked ? r.likeCount - 1 : r.likeCount + 1 }
          : r
        ),
      }
    }))

    if (currentlyLiked) {
      await supabase.from('comment_likes').delete()
        .eq('user_id', currentUserId).eq('comment_id', commentId)
    } else {
      await supabase.from('comment_likes').insert({ user_id: currentUserId, comment_id: commentId })
    }
  }

  // ── Submit comment ─────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    const trimmed = input.trim()
    if (!trimmed || submitting) return
    setSubmitting(true)

    const payload: Record<string, unknown> = {
      post_id: postId,
      author_id: currentUserId,
      body: trimmed,
      is_deleted: false,
      like_count: 0,
      parent_comment_id: replyTarget?.id ?? null,
    }

    const { error } = await supabase.from('comments').insert(payload)

    if (!error) {
      setInput('')
      setReplyTarget(null)
      await fetchComments()
    }

    setSubmitting(false)
  }

  const handleReply = (commentId: string, nickname: string) => {
    setReplyTarget({ id: commentId, nickname })
    setInput(`@${nickname} `)
    inputRef.current?.focus()
  }

  const cancelReply = () => {
    setReplyTarget(null)
    setInput('')
  }

  const toggleReplies = (commentId: string) => {
    setComments((prev) => prev.map((c) =>
      c.id === commentId ? { ...c, repliesExpanded: !c.repliesExpanded } : c
    ))
  }

  // ── Avatar ─────────────────────────────────────────────────────────────────
  const Avatar = ({ user }: { user: Comment['author'] }) => (
    <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
      {user?.avatarUrl ? (
        <Image src={user.avatarUrl} alt={user.nickname} width={32} height={32} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-xs font-bold text-white">
          {user?.nickname?.[0]?.toUpperCase()}
        </div>
      )}
    </div>
  )

  // ── Comment row ────────────────────────────────────────────────────────────
  const CommentRow = ({ comment, isReply = false }: { comment: Comment; isReply?: boolean }) => {
    if (comment.isDeleted) {
      return (
        <div className={cn('py-3', isReply && 'pl-10')}>
          <p className="text-xs text-gray-400 italic">삭제된 댓글입니다.</p>
        </div>
      )
    }

    return (
      <div className={cn('flex gap-3 py-3', isReply && 'pl-10')}>
        {isReply && <CornerDownRight size={14} className="text-gray-300 flex-shrink-0 mt-1" />}
        <Avatar user={comment.author} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-semibold text-gray-900">{comment.author?.nickname}</span>
            {comment.author?.isExpert && (
              <span className="text-[9px] font-medium text-blue-600 bg-blue-50 px-1 py-0.5 rounded-full">전문가</span>
            )}
            <span className="text-[10px] text-gray-400">{formatTimestamp(comment.createdAt)}</span>
          </div>
          <p className="text-sm text-gray-800 mt-0.5 leading-relaxed">{comment.body}</p>
          <div className="flex items-center gap-4 mt-1.5">
            <button
              onClick={() => handleLikeComment(comment.id, comment.isLiked)}
              className={cn(
                'flex items-center gap-1 text-xs',
                comment.isLiked ? 'text-[#E8003D]' : 'text-gray-400'
              )}
            >
              <Heart size={13} fill={comment.isLiked ? 'currentColor' : 'none'} />
              {comment.likeCount > 0 && <span>{comment.likeCount}</span>}
            </button>
            {!isReply && (
              <button
                onClick={() => handleReply(comment.id, comment.author?.nickname ?? '')}
                className="text-xs text-gray-400 flex items-center gap-1"
              >
                <CornerDownRight size={13} />
                답글
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Comment list ── */}
      <div className="flex-1 overflow-y-auto px-4" id="comments">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-700 rounded-full animate-spin" />
          </div>
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <p className="text-sm text-gray-400">아직 댓글이 없어요.</p>
            <p className="text-xs text-gray-300">첫 번째 댓글을 남겨보세요!</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {comments.map((comment) => (
              <div key={comment.id}>
                <CommentRow comment={comment} />

                {/* Replies */}
                {comment.replyCount > 0 && !comment.repliesExpanded && (
                  <button
                    onClick={() => toggleReplies(comment.id)}
                    className="ml-11 mb-2 flex items-center gap-1 text-xs text-[#0046BE] font-medium"
                  >
                    <ChevronDown size={14} />
                    답글 {comment.replyCount}개 더보기
                  </button>
                )}

                {comment.repliesExpanded && comment.replies.map((reply) => (
                  <CommentRow key={reply.id} comment={reply} isReply />
                ))}

                {comment.repliesExpanded && comment.replyCount > 0 && (
                  <button
                    onClick={() => toggleReplies(comment.id)}
                    className="ml-11 mb-2 flex items-center gap-1 text-xs text-gray-400"
                  >
                    <ChevronDown size={14} className="rotate-180" />
                    답글 숨기기
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Input bar ── */}
      <div className="border-t border-gray-100 bg-white px-4 py-3 safe-bottom">
        {replyTarget && (
          <div className="flex items-center justify-between bg-blue-50 rounded-lg px-3 py-1.5 mb-2">
            <span className="text-xs text-blue-700">
              <span className="font-semibold">@{replyTarget.nickname}</span>에게 답글 작성 중
            </span>
            <button onClick={cancelReply} className="text-blue-400">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}
        <div className="flex items-center gap-3">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
            placeholder={replyTarget ? `@${replyTarget.nickname}에게 답글...` : '댓글을 입력하세요...'}
            className="flex-1 px-4 py-2.5 rounded-full bg-gray-100 text-sm outline-none text-gray-900 placeholder:text-gray-400"
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || submitting}
            className={cn(
              'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all',
              input.trim() && !submitting ? 'bg-[#FFD700]' : 'bg-gray-100'
            )}
          >
            <Send size={16} className={input.trim() && !submitting ? 'text-gray-900' : 'text-gray-400'} />
          </button>
        </div>
      </div>
    </div>
  )
}
