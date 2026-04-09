'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { Post, ReportCategory } from '@/types'
import { createClient } from '@/lib/supabase/client'
import BottomSheet from '@/components/ui/BottomSheet'

interface PostMoreMenuProps {
  post: Post
  isOwn: boolean
  currentUserId: string
  onClose: () => void
  onDelete: (id: string) => void
  onUpdate: (post: Post) => void
}

const REPORT_CATEGORIES: { value: ReportCategory; label: string }[] = [
  { value: 'SPAM', label: '스팸 및 광고성' },
  { value: 'ABUSE', label: '욕설, 비하, 혐오' },
  { value: 'ADULT', label: '음란물 또는 선정적' },
  { value: 'ILLEGAL', label: '불법 행위' },
  { value: 'PRIVACY', label: '개인정보 노출' },
  { value: 'FLOOD', label: '도배 또는 반복' },
  { value: 'HARASSMENT', label: '괴롭히거나 불쾌' },
  { value: 'OFF_TOPIC', label: '주제 부적합' },
]

export default function PostMoreMenu({ post, isOwn, currentUserId, onClose, onDelete, onUpdate }: PostMoreMenuProps) {
  const [screen, setScreen] = useState<'main' | 'report' | 'confirmDelete'>('main')
  const [selectedCategory, setSelectedCategory] = useState<ReportCategory | null>(null)
  const supabase = createClient()

  // ── Delete (FR-11.8) ──────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (post.status === 'UNDER_REVIEW') {
      toast.error('검토 중인 게시글은 삭제할 수 없어요.')
      onClose(); return
    }
    const { error } = await supabase.from('posts')
      .update({ status: 'DELETED_BY_AUTHOR' }).eq('id', post.id)
    if (!error) {
      onDelete(post.id)
      toast.success('게시글이 삭제되었어요.')
    } else {
      toast.error('삭제 중 오류가 발생했어요.')
    }
    onClose()
  }

  // ── Hide (FR-11.7) ────────────────────────────────────────────────────────
  const handleHide = async () => {
    await supabase.from('hidden_posts')
      .upsert({ user_id: currentUserId, post_id: post.id })
    onDelete(post.id)
    toast.success('게시글을 숨겼어요.')
    onClose()
  }

  // ── Block author (FR-13.3 + BR-12) ───────────────────────────────────────
  const handleBlock = async () => {
    await supabase.from('blocks')
      .insert({ blocker_id: currentUserId, blocked_id: post.author?.id })
    // BR-12: auto-unfollow on block
    await supabase.from('follows').delete()
      .eq('follower_id', currentUserId).eq('followee_id', post.author?.id)
    toast.success(`${post.author?.nickname}님을 차단했어요.`)
    onDelete(post.id)
    onClose()
  }

  // ── Report (FR-11.6 + BR-24) ─────────────────────────────────────────────
  const handleReport = async () => {
    if (!selectedCategory) return
    const { error } = await supabase.from('post_reports')  // DB table: post_reports
      .insert({ reporter_id: currentUserId, post_id: post.id, category: selectedCategory })
    if (!error) {
      // BR-24: immediately hide from reporter's feed
      await supabase.from('hidden_posts')
        .upsert({ user_id: currentUserId, post_id: post.id })
      onDelete(post.id)
      toast.success('신고가 접수되었어요. 이 게시글은 더 이상 표시되지 않아요.')
    } else {
      toast.error('신고 중 오류가 발생했어요.')
    }
    onClose()
  }

  // ── Screens ───────────────────────────────────────────────────────────────

  if (screen === 'confirmDelete') {
    return (
      <BottomSheet onClose={onClose} title="게시글을 삭제할까요?">
        <p className="text-sm text-gray-500 text-center mb-6">삭제된 게시글은 복구할 수 없어요.</p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">취소</button>
          <button onClick={handleDelete} className="flex-1 py-3 rounded-xl bg-red-500 text-white text-sm font-medium">삭제하기</button>
        </div>
      </BottomSheet>
    )
  }

  if (screen === 'report') {
    return (
      <BottomSheet onClose={onClose} title="이 게시글이 불편한 이유를 알려주세요.">
        <div className="space-y-1 mb-4">
          {REPORT_CATEGORIES.map(({ value, label }) => (
            <button key={value} onClick={() => setSelectedCategory(value)}
              className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                selectedCategory === value ? 'bg-yellow-50 text-yellow-800 border border-yellow-200' : 'text-gray-700 hover:bg-gray-50'
              }`}>
              {label}
            </button>
          ))}
        </div>
        <button onClick={handleReport} disabled={!selectedCategory}
          className="w-full py-3.5 rounded-xl bg-[#FFD700] disabled:bg-gray-200 disabled:text-gray-400 text-gray-900 font-semibold text-sm">
          신고하기
        </button>
      </BottomSheet>
    )
  }

  return (
    <BottomSheet onClose={onClose}>
      <div className="space-y-1">
        {isOwn ? (
          <>
            {/* FR-7.2.1: own post actions */}
            <button onClick={() => setScreen('confirmDelete')}
              className="w-full text-left px-4 py-3.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg">
              게시글 삭제
            </button>
            <button className="w-full text-left px-4 py-3.5 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg">
              게시글 수정
            </button>
          </>
        ) : (
          <>
            <button onClick={handleBlock}
              className="w-full text-left px-4 py-3.5 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg">
              작성자 차단
            </button>
            <button onClick={() => setScreen('report')}
              className="w-full text-left px-4 py-3.5 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg">
              게시글 신고
            </button>
            <button onClick={handleHide}
              className="w-full text-left px-4 py-3.5 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg">
              이 게시글 숨기기
            </button>
          </>
        )}
        <button onClick={onClose} className="w-full py-3.5 text-sm text-gray-500 mt-2">취소</button>
      </div>
    </BottomSheet>
  )
}
