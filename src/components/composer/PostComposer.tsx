'use client'

import { useState, useRef } from 'react'
import {
  X, Type, Image as ImageIcon, BarChart2, TrendingUp, Link as LinkIcon,
  Repeat2, Hash, Sparkles, Plus, Trash2, ChevronDown, ChevronUp, AlertTriangle
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { PostType } from '@/types'

interface PostComposerProps {
  onClose: () => void
  currentUser: {
    id: string
    nickname: string
    profileImage: string | null
  }
}

type Tab = PostType

const TABS: { type: Tab; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { type: 'TEXT', label: '텍스트', icon: Type },
  { type: 'IMAGE', label: '이미지', icon: ImageIcon },
  { type: 'VOTE', label: '투표', icon: BarChart2 },
  { type: 'PROFIT_RATE', label: '수익률', icon: TrendingUp },
  { type: 'LINK', label: '링크', icon: LinkIcon },
  { type: 'REPOST', label: '리포스트', icon: Repeat2 },
]

export default function PostComposer({ onClose, currentUser }: PostComposerProps) {
  const supabase = createClient()

  const [activeTab, setActiveTab] = useState<Tab>('TEXT')
  const [body, setBody] = useState('')
  const [imageUrls, setImageUrls] = useState<string[]>([''])
  const [voteOptions, setVoteOptions] = useState<string[]>(['', ''])
  const [linkUrl, setLinkUrl] = useState('')
  const [repostId, setRepostId] = useState('')
  const [topicTags, setTopicTags] = useState<string[]>([])
  const [topicInput, setTopicInput] = useState('')
  const [aiHashtagEnabled, setAiHashtagEnabled] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // ── Has content check ──────────────────────────────────────────────────────
  const hasContent = (() => {
    switch (activeTab) {
      case 'TEXT': return body.trim().length > 0
      case 'IMAGE': return imageUrls.some((u) => u.trim().length > 0)
      case 'VOTE': return voteOptions.filter((o) => o.trim().length > 0).length >= 2
      case 'PROFIT_RATE': return false // placeholder
      case 'LINK': return linkUrl.trim().length > 0
      case 'REPOST': return repostId.trim().length > 0
      default: return false
    }
  })()

  // ── Can publish check ──────────────────────────────────────────────────────
  const canPublish = (() => {
    if (topicTags.length === 0) return false
    switch (activeTab) {
      case 'TEXT': return body.trim().length > 0
      case 'IMAGE': return imageUrls.some((u) => u.trim().length > 0)
      case 'VOTE': return voteOptions.filter((o) => o.trim().length > 0).length >= 2
      case 'PROFIT_RATE': return false
      case 'LINK': return /^https?:\/\/.+/.test(linkUrl.trim())
      case 'REPOST': return repostId.trim().length > 0
      default: return false
    }
  })()

  const handleClose = () => {
    if (hasContent) {
      setShowDiscardConfirm(true)
    } else {
      onClose()
    }
  }

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab)
    setPublishError(null)
  }

  // ── Topic tags ─────────────────────────────────────────────────────────────
  const addTopicTag = () => {
    const trimmed = topicInput.trim().replace(/^#/, '')
    if (!trimmed || topicTags.includes(trimmed) || topicTags.length >= 3) return
    setTopicTags((prev) => [...prev, trimmed])
    setTopicInput('')
  }

  const removeTopicTag = (tag: string) => {
    setTopicTags((prev) => prev.filter((t) => t !== tag))
  }

  // ── Vote options ───────────────────────────────────────────────────────────
  const addVoteOption = () => {
    if (voteOptions.length >= 15) return
    setVoteOptions((prev) => [...prev, ''])
  }

  const removeVoteOption = (i: number) => {
    if (voteOptions.length <= 2) return
    setVoteOptions((prev) => prev.filter((_, idx) => idx !== i))
  }

  const updateVoteOption = (i: number, value: string) => {
    setVoteOptions((prev) => prev.map((o, idx) => idx === i ? value.slice(0, 20) : o))
  }

  // ── Image URLs ─────────────────────────────────────────────────────────────
  const addImageUrl = () => {
    if (imageUrls.length >= 15) return
    setImageUrls((prev) => [...prev, ''])
  }

  const updateImageUrl = (i: number, value: string) => {
    setImageUrls((prev) => prev.map((u, idx) => idx === i ? value : u))
  }

  const removeImageUrl = (i: number) => {
    if (imageUrls.length <= 1) { setImageUrls(['']); return }
    setImageUrls((prev) => prev.filter((_, idx) => idx !== i))
  }

  // ── Publish ────────────────────────────────────────────────────────────────
  const handlePublish = async () => {
    if (!canPublish || publishing) return
    setPublishing(true)
    setPublishError(null)

    try {
      // Build topic_tags as JSONB array (inline in posts table)
      const topicTagsJson = topicTags.map((tag) => ({
        type: 'theme',
        value: tag,
        displayName: tag,
      }))

      // Build vote_options as JSONB array (inline in posts table)
      const voteOptionsJson = activeTab === 'VOTE'
        ? voteOptions
            .filter((o) => o.trim())
            .map((label, i) => ({
              id: crypto.randomUUID(),
              label,
              voteCount: 0,
              percentage: 0,
              isUserVote: false,
              sortOrder: i,
            }))
        : null

      const postPayload: Record<string, unknown> = {
        author_id: currentUser.id,
        type: activeTab,
        status: 'PUBLISHED',
        body: activeTab === 'TEXT' ? body.trim() : (body.trim() || null),
        images: activeTab === 'IMAGE' ? imageUrls.filter((u) => u.trim()) : null,
        link_url: activeTab === 'LINK' ? linkUrl.trim() : null,
        repost_of: activeTab === 'REPOST' ? repostId.trim() : null,
        topic_tags: topicTagsJson,
        ai_hashtags: aiHashtagEnabled ? [] : null,
        vote_options: voteOptionsJson,
        profit_rate_holdings: null,
        like_count: 0,
        comment_count: 0,
        repost_count: 0,
        scrap_count: 0,
        external_share_count: 0,
        score: 0,
        is_edited: false,
      }

      const { error: postError } = await supabase
        .from('posts')
        .insert(postPayload)

      if (postError) {
        setPublishError('게시글 등록에 실패했어요. 다시 시도해주세요.')
        setPublishing(false)
        return
      }

      onClose()
    } catch {
      setPublishError('오류가 발생했어요. 다시 시도해주세요.')
      setPublishing(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={handleClose}
      />

      {/* Composer Sheet */}
      <div className="fixed inset-0 z-50 flex flex-col bg-white max-w-[430px] mx-auto">
        {/* ── Top Bar ── */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-gray-100">
          <button onClick={handleClose} className="p-1 text-gray-600">
            <X size={20} />
          </button>
          <span className="text-sm font-bold text-gray-900">새 게시글</span>
          <button
            onClick={handlePublish}
            disabled={!canPublish || publishing}
            className={cn(
              'px-4 py-1.5 rounded-full text-sm font-bold transition-all',
              canPublish && !publishing
                ? 'bg-[#FFD700] text-gray-900'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            )}
          >
            {publishing ? '등록 중...' : '게시'}
          </button>
        </div>

        {/* ── Tab Bar ── */}
        <div className="flex overflow-x-auto border-b border-gray-100 px-2 gap-1 py-2 scrollbar-hide">
          {TABS.map(({ type, label, icon: Icon }) => (
            <button
              key={type}
              onClick={() => handleTabChange(type)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 transition-all',
                activeTab === type
                  ? 'bg-[#FFD700] text-gray-900'
                  : 'bg-gray-100 text-gray-600'
              )}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        {/* ── Author row ── */}
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center flex-shrink-0 overflow-hidden">
            {currentUser.profileImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={currentUser.profileImage} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-sm font-bold text-white">{currentUser.nickname[0]?.toUpperCase()}</span>
            )}
          </div>
          <span className="text-sm font-semibold text-gray-900">{currentUser.nickname}</span>
        </div>

        {/* ── Content area ── */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">

          {/* TEXT */}
          {activeTab === 'TEXT' && (
            <textarea
              ref={textareaRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="무슨 생각을 하고 계신가요?"
              className="w-full h-40 text-sm text-gray-900 bg-transparent outline-none resize-none placeholder:text-gray-400"
              autoFocus
            />
          )}

          {/* IMAGE */}
          {activeTab === 'IMAGE' && (
            <div className="flex flex-col gap-3">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="이미지에 대한 설명을 입력하세요 (선택)"
                className="w-full h-20 text-sm text-gray-900 bg-transparent outline-none resize-none placeholder:text-gray-400"
              />
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-gray-500">이미지 URL ({imageUrls.length}/15)</p>
                {imageUrls.map((url, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => updateImageUrl(i, e.target.value)}
                      placeholder={`이미지 URL ${i + 1}`}
                      className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm bg-gray-50 outline-none focus:border-[#FFD700]"
                    />
                    <button onClick={() => removeImageUrl(i)} className="text-gray-400 p-1">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                {imageUrls.length < 15 && (
                  <button
                    onClick={addImageUrl}
                    className="flex items-center gap-2 text-sm text-[#0046BE] font-medium py-1"
                  >
                    <Plus size={16} />
                    이미지 추가
                  </button>
                )}
              </div>
            </div>
          )}

          {/* VOTE */}
          {activeTab === 'VOTE' && (
            <div className="flex flex-col gap-3">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="투표 질문을 입력하세요 (선택)"
                className="w-full h-20 text-sm text-gray-900 bg-transparent outline-none resize-none placeholder:text-gray-400"
              />
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-gray-500">투표 항목 ({voteOptions.length}/15, 최소 2개)</p>
                {voteOptions.map((option, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={option}
                      onChange={(e) => updateVoteOption(i, e.target.value)}
                      placeholder={`항목 ${i + 1}`}
                      maxLength={20}
                      className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm bg-gray-50 outline-none focus:border-[#FFD700]"
                    />
                    <span className="text-xs text-gray-400 w-8 text-right">{option.length}/20</span>
                    {voteOptions.length > 2 && (
                      <button onClick={() => removeVoteOption(i)} className="text-gray-400 p-1">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
                {voteOptions.length < 15 && (
                  <button
                    onClick={addVoteOption}
                    className="flex items-center gap-2 text-sm text-[#0046BE] font-medium py-1"
                  >
                    <Plus size={16} />
                    항목 추가
                  </button>
                )}
              </div>
            </div>
          )}

          {/* PROFIT_RATE */}
          {activeTab === 'PROFIT_RATE' && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <TrendingUp size={40} className="text-gray-300" />
              <p className="text-sm text-gray-500 font-medium">수익률 공유</p>
              <p className="text-xs text-gray-400 max-w-[240px]">
                M-able 앱에서 보유 종목을 연동하면<br />수익률을 공유할 수 있어요.
              </p>
            </div>
          )}

          {/* LINK */}
          {activeTab === 'LINK' && (
            <div className="flex flex-col gap-3">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="링크 소개를 입력하세요 (선택)"
                className="w-full h-20 text-sm text-gray-900 bg-transparent outline-none resize-none placeholder:text-gray-400"
              />
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">링크 URL</p>
                <input
                  type="url"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://"
                  className={cn(
                    'w-full px-3 py-3 rounded-lg border text-sm bg-gray-50 outline-none transition-all',
                    linkUrl && !/^https?:\/\/.+/.test(linkUrl.trim())
                      ? 'border-red-300'
                      : 'border-gray-200 focus:border-[#FFD700]'
                  )}
                />
                {linkUrl && !/^https?:\/\/.+/.test(linkUrl.trim()) && (
                  <p className="text-xs text-red-500 mt-1">올바른 URL을 입력해주세요. (https://...)</p>
                )}
              </div>
            </div>
          )}

          {/* REPOST */}
          {activeTab === 'REPOST' && (
            <div className="flex flex-col gap-3">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="리포스트에 코멘트를 추가하세요 (선택)"
                className="w-full h-20 text-sm text-gray-900 bg-transparent outline-none resize-none placeholder:text-gray-400"
              />
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">게시글 ID</p>
                <input
                  type="text"
                  value={repostId}
                  onChange={(e) => setRepostId(e.target.value)}
                  placeholder="리포스트할 게시글 ID"
                  className="w-full px-3 py-3 rounded-lg border border-gray-200 text-sm bg-gray-50 outline-none focus:border-[#FFD700]"
                />
              </div>
            </div>
          )}

          {/* ── Topic Tags Section ── */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <Hash size={14} className="text-gray-500" />
              <span className="text-xs font-semibold text-gray-700">
                토픽 태그 <span className="text-[#E8003D]">*</span>
                <span className="font-normal text-gray-400 ml-1">(최소 1개, 최대 3개)</span>
              </span>
            </div>

            {/* Tag chips */}
            {topicTags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {topicTags.map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 px-2 py-1 rounded-full"
                  >
                    #{tag}
                    <button onClick={() => removeTopicTag(tag)} className="text-blue-400">
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {topicTags.length < 3 && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={topicInput}
                  onChange={(e) => setTopicInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTopicTag() } }}
                  placeholder="태그 입력 후 Enter"
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm bg-gray-50 outline-none focus:border-[#FFD700]"
                />
                <button
                  onClick={addTopicTag}
                  className="px-3 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium"
                >
                  추가
                </button>
              </div>
            )}
          </div>

          {/* ── AI Hashtag Toggle ── */}
          <div className="mt-4 flex items-center justify-between py-3 px-3 bg-gray-50 rounded-xl">
            <div className="flex items-center gap-2">
              <Sparkles size={15} className="text-[#FFD700]" />
              <div>
                <p className="text-xs font-semibold text-gray-800">AI 해시태그 자동 생성</p>
                <p className="text-[10px] text-gray-400 mt-0.5">게시 후 AI가 관련 태그를 자동으로 붙여드려요</p>
              </div>
            </div>
            <button
              onClick={() => setAiHashtagEnabled(!aiHashtagEnabled)}
              className={cn(
                'w-10 h-6 rounded-full transition-all relative flex-shrink-0',
                aiHashtagEnabled ? 'bg-[#FFD700]' : 'bg-gray-200'
              )}
            >
              <span className={cn(
                'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all',
                aiHashtagEnabled ? 'left-[18px]' : 'left-0.5'
              )} />
            </button>
          </div>

          {/* Error */}
          {publishError && (
            <div className="mt-3 flex items-center gap-2 p-3 bg-red-50 rounded-xl">
              <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
              <p className="text-xs text-red-600">{publishError}</p>
            </div>
          )}

          {/* Required topic tag warning */}
          {topicTags.length === 0 && hasContent && (
            <p className="mt-2 text-xs text-amber-600 text-center">
              토픽 태그를 1개 이상 추가해야 게시할 수 있어요.
            </p>
          )}
        </div>
      </div>

      {/* ── Discard Confirmation ── */}
      {showDiscardConfirm && (
        <>
          <div className="fixed inset-0 bg-black/50 z-[60]" />
          <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto z-[70] bg-white rounded-t-2xl p-5">
            <div className="flex justify-center mb-4">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-1">작성 중인 내용이 있어요</h3>
            <p className="text-sm text-gray-500 mb-5">
              지금 나가면 작성 중인 게시글이 삭제됩니다.<br />
              정말 나가시겠어요?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDiscardConfirm(false)}
                className="flex-1 py-3.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700"
              >
                계속 작성
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-3.5 rounded-xl bg-[#E8003D] text-white text-sm font-semibold"
              >
                나가기
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
