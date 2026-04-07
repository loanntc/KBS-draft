'use client'

import { useState } from 'react'
import Image from 'next/image'
import { ExternalLink, ChevronRight } from 'lucide-react'
import { Post } from '@/types'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import ExternalLinkWarning from '@/components/ui/ExternalLinkWarning'

interface PostTypeContentProps {
  post: Post
  currentUserId: string
}

export default function PostTypeContent({ post, currentUserId }: PostTypeContentProps) {
  switch (post.type) {
    case 'IMAGE':
      return <ImageContent post={post} />
    case 'VOTE':
      return <VoteContent post={post} currentUserId={currentUserId} />
    case 'PROFIT_RATE':
      return <ProfitRateContent post={post} />
    case 'LINK':
      return <LinkContent post={post} />
    case 'REPOST':
      return <RepostContent post={post} />
    default:
      return null
  }
}

// ── Image Post (Type 2) ──────────────────────────────────────────────────────

function ImageContent({ post }: { post: Post }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const images = post.images ?? []
  if (!images.length) return null

  return (
    <div className="relative rounded-lg overflow-hidden mb-3 bg-gray-100">
      <div className="relative aspect-square">
        <Image
          src={images[currentIndex]}
          alt={`Image ${currentIndex + 1}`}
          fill
          className="object-cover"
        />
      </div>
      {images.length > 1 && (
        <div className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full">
          {currentIndex + 1} / {images.length}
        </div>
      )}
      {images.length > 1 && (
        <div className="flex gap-1.5 justify-center mt-2">
          {images.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentIndex(i)}
              className={cn(
                'w-1.5 h-1.5 rounded-full transition-colors',
                i === currentIndex ? 'bg-gray-800' : 'bg-gray-300'
              )}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Vote Post (Type 3) ────────────────────────────────────────────────────────

function VoteContent({ post, currentUserId }: { post: Post; currentUserId: string }) {
  const [options, setOptions] = useState(post.voteOptions ?? [])
  const [voting, setVoting] = useState(false)
  const supabase = createClient()
  const hasVoted = options.some((o) => o.isUserVote)
  const totalVotes = options.reduce((sum, o) => sum + o.voteCount, 0)

  const handleVote = async (optionId: string) => {
    if (hasVoted || voting) return
    setVoting(true)

    const { error } = await supabase
      .from('vote_records')
      .insert({ post_id: post.id, option_id: optionId, voter_id: currentUserId })

    if (!error) {
      setOptions((prev) =>
        prev.map((o) => ({
          ...o,
          isUserVote: o.id === optionId,
          voteCount: o.id === optionId ? o.voteCount + 1 : o.voteCount,
        }))
      )
    }
    setVoting(false)
  }

  const handleCancelVote = async () => {
    const voted = options.find((o) => o.isUserVote)
    if (!voted) return

    await supabase
      .from('vote_records')
      .delete()
      .eq('post_id', post.id)
      .eq('voter_id', currentUserId)

    setOptions((prev) =>
      prev.map((o) => ({
        ...o,
        isUserVote: false,
        voteCount: o.isUserVote ? Math.max(0, o.voteCount - 1) : o.voteCount,
      }))
    )
  }

  return (
    <div className="mb-3 space-y-2">
      {/* FR-6.3.1 vote disclaimer (auto-applied for stock-tagged posts) */}
      {(post as Post & { has_vote_disclaimer?: boolean }).has_vote_disclaimer && (
        <p className="text-[10px] text-orange-600 bg-orange-50 px-2 py-1 rounded mb-2">
          이 투표는 투자 조언이 아닙니다. 투자 결정은 본인의 책임입니다.
        </p>
      )}
      {options.map((option) => {
        const pct = totalVotes > 0 ? Math.round((option.voteCount / totalVotes) * 100) : 0
        return (
          <button
            key={option.id}
            onClick={() => handleVote(option.id)}
            disabled={hasVoted}
            className={cn(
              'relative w-full text-left px-4 py-2.5 rounded-lg border text-sm font-medium overflow-hidden transition-all',
              option.isUserVote
                ? 'border-[#FFD700] bg-yellow-50 text-gray-900'
                : hasVoted
                  ? 'border-gray-200 bg-gray-50 text-gray-700'
                  : 'border-gray-200 hover:border-gray-400 text-gray-800'
            )}
          >
            {hasVoted && (
              <div
                className="absolute inset-y-0 left-0 bg-yellow-100/60 transition-all"
                style={{ width: `${pct}%` }}
              />
            )}
            <div className="relative flex items-center justify-between">
              <span>{option.label}</span>
              {hasVoted && (
                <span className={cn('text-xs', option.isUserVote ? 'font-bold text-yellow-700' : 'text-gray-500')}>
                  {pct}%
                </span>
              )}
            </div>
          </button>
        )
      })}
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>{totalVotes}명 참여</span>
        {hasVoted && (
          <button onClick={handleCancelVote} className="text-gray-500 underline">
            참여 취소
          </button>
        )}
      </div>
    </div>
  )
}

// ── Profit Rate Post (Type 4) ─────────────────────────────────────────────────

function ProfitRateContent({ post }: { post: Post }) {
  const items = post.profitRateItems ?? []
  if (!items.length) return null

  return (
    <div className="mb-3">
      {/* FR-6.4.1 — Compliance disclaimer (always visible) */}
      <p className="text-[10px] text-orange-600 bg-orange-50 px-2 py-1.5 rounded mb-2">
        투자 성과는 개인의 과거 실적이며, 미래 수익을 보장하지 않습니다.
      </p>
      <div className="space-y-2">
        {items.map((item) => {
          const isPositive = item.unrealisedPnl > 0
          const isNegative = item.unrealisedPnl < 0
          return (
            <div
              key={item.stockCode}
              className={cn(
                'flex items-center justify-between p-3 rounded-lg border',
                isPositive ? 'bg-red-50 border-red-100' :
                isNegative ? 'bg-blue-50 border-blue-100' :
                'bg-gray-50 border-gray-100'
              )}
            >
              <div className="flex items-center gap-2">
                {item.logoUrl ? (
                  <Image src={item.logoUrl} alt={item.stockName} width={28} height={28} className="rounded-full" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-gray-300 flex items-center justify-center text-xs font-bold text-gray-600">
                    {item.stockName[0]}
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold text-gray-900">{item.stockName}</p>
                  <p className="text-xs text-gray-500">{item.stockCode}</p>
                </div>
              </div>
              <div className="text-right">
                <p className={cn(
                  'text-sm font-bold',
                  isPositive ? 'pnl-positive' : isNegative ? 'pnl-negative' : 'pnl-neutral'
                )}>
                  {isPositive ? '+' : ''}{item.returnRate.toFixed(2)}%
                </p>
                <p className={cn(
                  'text-xs',
                  isPositive ? 'pnl-positive' : isNegative ? 'pnl-negative' : 'pnl-neutral'
                )}>
                  {isPositive ? '+' : ''}{item.unrealisedPnl.toLocaleString()}원
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Link Post (Type 5) ────────────────────────────────────────────────────────

function LinkContent({ post }: { post: Post }) {
  const [showWarning, setShowWarning] = useState(false)
  const [pendingUrl, setPendingUrl] = useState<string | null>(null)
  const meta = post.linkMeta
  if (!meta) return null

  const handleTap = () => {
    setPendingUrl(meta.url)
    setShowWarning(true)
  }

  return (
    <>
      <button
        onClick={handleTap}
        className="w-full text-left rounded-lg border border-gray-200 overflow-hidden mb-3 hover:border-gray-300 transition-colors"
      >
        {meta.imageUrl && (
          <div className="relative h-36 bg-gray-100">
            <Image src={meta.imageUrl} alt={meta.title ?? ''} fill className="object-cover" />
          </div>
        )}
        <div className="p-3">
          {meta.title && (
            <p className="text-sm font-semibold text-gray-900 line-clamp-2 mb-1">{meta.title}</p>
          )}
          <p className="text-xs text-gray-400 flex items-center gap-1 truncate">
            <ExternalLink size={12} />
            {meta.url}
          </p>
        </div>
      </button>

      {/* BR-20: External link warning */}
      {showWarning && pendingUrl && (
        <ExternalLinkWarning
          url={pendingUrl}
          onConfirm={() => {
            window.open(pendingUrl, '_blank', 'noopener,noreferrer')
            setShowWarning(false)
            setPendingUrl(null)
          }}
          onCancel={() => {
            setShowWarning(false)
            setPendingUrl(null)
          }}
        />
      )}
    </>
  )
}

// ── Repost (Type 6) ────────────────────────────────────────────────────────────

function RepostContent({ post }: { post: Post }) {
  const parent = post.repostParent
  if (!parent) return null

  const isDeleted = parent.status === 'DELETED_BY_AUTHOR' || parent.status === 'DELETED_BY_ADMIN'

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 mb-3">
      {isDeleted ? (
        <p className="text-sm text-gray-400 text-center py-2">삭제된 게시글입니다.</p>
      ) : (
        <a href={`/community/post/${parent.id}`} className="block">
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className="w-5 h-5 rounded-full bg-gray-300 overflow-hidden">
              {parent.author?.avatarUrl && (
                <Image src={parent.author.avatarUrl} alt="" width={20} height={20} />
              )}
            </div>
            <span className="text-xs font-medium text-gray-700">{parent.author?.nickname}</span>
            <ChevronRight size={12} className="text-gray-400" />
          </div>
          <p className="text-sm text-gray-700 line-clamp-3">{parent.body}</p>
        </a>
      )}
    </div>
  )
}
