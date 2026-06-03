'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Heart, MessageCircle, Repeat2, UserPlus, Bell, AtSign } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { cn, formatTimestamp } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { NotificationType } from '@/types'

interface NotificationRow {
  id: string
  type: NotificationType
  is_read: boolean
  post_id: string | null
  comment_id: string | null
  created_at: string
  sender: {
    id: string
    nickname: string
    profile_image: string | null
  } | null
}

interface NotificationsClientProps {
  notifications: NotificationRow[]
  currentUserId: string
}

const TYPE_LABEL: Record<NotificationType, string> = {
  N1_LIKE: '님이 회원님의 게시글을 좋아합니다.',
  N2_COMMENT: '님이 댓글을 남겼습니다.',
  N3_POST_MENTION: '님이 게시글에서 회원님을 언급했습니다.',
  N4_COMMENT_MENTION: '님이 댓글에서 회원님을 언급했습니다.',
  N5_REPOST: '님이 회원님의 게시글을 리포스트했습니다.',
  N6_NEW_FOLLOWER: '님이 회원님을 팔로우하기 시작했습니다.',
  N7_NEW_POST: '님이 새 게시글을 올렸습니다.',
}

const TYPE_ICON: Record<NotificationType, React.ComponentType<{ size?: number; className?: string }>> = {
  N1_LIKE: Heart,
  N2_COMMENT: MessageCircle,
  N3_POST_MENTION: AtSign,
  N4_COMMENT_MENTION: AtSign,
  N5_REPOST: Repeat2,
  N6_NEW_FOLLOWER: UserPlus,
  N7_NEW_POST: Bell,
}

const TYPE_COLOR: Record<NotificationType, string> = {
  N1_LIKE: 'text-[#E8003D]',
  N2_COMMENT: 'text-[#0046BE]',
  N3_POST_MENTION: 'text-purple-500',
  N4_COMMENT_MENTION: 'text-purple-500',
  N5_REPOST: 'text-green-500',
  N6_NEW_FOLLOWER: 'text-[#FFD700]',
  N7_NEW_POST: 'text-gray-700',
}

function groupByDate(notifications: NotificationRow[]): Record<string, NotificationRow[]> {
  const groups: Record<string, NotificationRow[]> = {}
  for (const n of notifications) {
    const dateKey = format(new Date(n.created_at), 'M월 d일 EEEE', { locale: ko })
    if (!groups[dateKey]) groups[dateKey] = []
    groups[dateKey].push(n)
  }
  return groups
}

export default function NotificationsClient({ notifications, currentUserId }: NotificationsClientProps) {
  const router = useRouter()
  const supabase = createClient()
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set())
  const grouped = groupByDate(notifications)

  const handleFollow = async (senderId: string) => {
    if (followedIds.has(senderId)) return
    await supabase.from('follows').insert({
      follower_id: currentUserId,
      followee_id: senderId,
      bell_on: false,
    })
    setFollowedIds((prev) => new Set(prev).add(senderId))
  }

  if (notifications.length === 0) {
    return (
      <div className="min-h-screen bg-white max-w-[430px] mx-auto flex flex-col">
        <header className="sticky top-0 z-20 bg-white border-b border-gray-100">
          <div className="flex items-center gap-2 px-2 h-14">
            <button onClick={() => router.back()} className="p-2 text-gray-700">
              <ChevronLeft size={22} />
            </button>
            <h1 className="text-base font-bold text-gray-900">알림</h1>
          </div>
        </header>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400 pb-20">
          <Bell size={40} className="text-gray-200" />
          <p className="text-sm">아직 알림이 없어요.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white max-w-[430px] mx-auto flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white border-b border-gray-100">
        <div className="flex items-center gap-2 px-2 h-14">
          <button onClick={() => router.back()} className="p-2 text-gray-700">
            <ChevronLeft size={22} />
          </button>
          <h1 className="text-base font-bold text-gray-900">알림</h1>
        </div>
      </header>

      {/* Notification list grouped by date */}
      <div className="flex-1 overflow-y-auto pb-10">
        {Object.entries(grouped).map(([dateLabel, items]) => (
          <div key={dateLabel}>
            {/* Date header */}
            <div className="sticky top-14 bg-gray-50 px-4 py-2 border-b border-gray-100 z-10">
              <p className="text-xs font-semibold text-gray-500">{dateLabel}</p>
            </div>

            {/* Items */}
            {items.map((n) => {
              const TypeIcon = TYPE_ICON[n.type]
              const iconColor = TYPE_COLOR[n.type]
              const label = TYPE_LABEL[n.type]
              const isNewFollower = n.type === 'N6_NEW_FOLLOWER'
              const hasPost = n.post_id !== null

              return (
                <div
                  key={n.id}
                  className={cn(
                    'flex items-start gap-3 px-4 py-3 border-b border-gray-50 transition-colors',
                    !n.is_read && 'bg-yellow-50/40'
                  )}
                >
                  {/* Sender avatar */}
                  <div className="relative flex-shrink-0">
                    <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden">
                      {n.sender?.profile_image ? (
                        <Image
                          src={n.sender.profile_image}
                          alt={n.sender.nickname ?? ''}
                          width={40}
                          height={40}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-sm font-bold text-white">
                          {n.sender?.nickname?.[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>
                    {/* Type icon badge */}
                    <div className={cn(
                      'absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-white flex items-center justify-center shadow-sm',
                    )}>
                      <TypeIcon size={11} className={iconColor} />
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 leading-snug">
                      <Link
                        href={`/community/user/${n.sender?.id}`}
                        className="font-semibold hover:underline"
                      >
                        {n.sender?.nickname}
                      </Link>
                      {label}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {formatTimestamp(n.created_at)}
                    </p>
                  </div>

                  {/* Action buttons */}
                  <div className="flex-shrink-0">
                    {isNewFollower && n.sender && (
                      <button
                        onClick={() => handleFollow(n.sender!.id)}
                        disabled={followedIds.has(n.sender!.id)}
                        className={cn(
                          'text-xs font-semibold px-3 py-1.5 rounded-full border transition-all',
                          followedIds.has(n.sender!.id)
                            ? 'border-gray-200 text-gray-400 bg-gray-50'
                            : 'border-[#FFD700] text-gray-900 bg-[#FFD700]'
                        )}
                      >
                        {followedIds.has(n.sender!.id) ? '팔로잉' : '팔로우'}
                      </button>
                    )}
                    {!isNewFollower && hasPost && (
                      <Link
                        href={`/community/post/${n.post_id}`}
                        className="text-xs text-gray-400 border border-gray-200 px-2 py-1 rounded-lg"
                      >
                        보기
                      </Link>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
