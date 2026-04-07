import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ChevronLeft, ChevronRight, Bell, Eye, UserX, Flag, BookOpen, EyeOff } from 'lucide-react'
import SettingsBackButton from './SettingsBackButton'

interface MenuItem {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  href: string | null
  description?: string
}

const MENU_ITEMS: MenuItem[] = [
  {
    icon: Bell,
    label: '알림 설정',
    href: '/community/settings/notifications',
    description: '팔로우, 댓글, 좋아요 알림 관리',
  },
  {
    icon: Eye,
    label: '정보 공개 설정',
    href: '/community/settings/privacy',
    description: '투자 정보, 피드 공개 범위 설정',
  },
  {
    icon: UserX,
    label: '차단 계정',
    href: '/community/settings/blocked',
    description: '차단한 사용자 관리',
  },
  {
    icon: Flag,
    label: '신고·삭제된 내 글',
    href: null,
    description: '신고 처리 현황 확인',
  },
  {
    icon: BookOpen,
    label: '커뮤니티 이용규칙',
    href: null,
    description: 'M-able 커뮤니티 운영 정책',
  },
  {
    icon: EyeOff,
    label: '숨긴 게시글',
    href: '/community/settings/hidden',
    description: '내가 숨긴 게시글 목록',
  },
]

export default async function CommunitySettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/community/settings')

  const { data: communityUser } = await supabase
    .from('community_users')
    .select('id, nickname, avatar_url')
    .eq('user_id', user.id)
    .single()

  if (!communityUser) redirect('/community/join')

  return (
    <div className="min-h-screen bg-gray-50 max-w-[430px] mx-auto">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white border-b border-gray-100">
        <div className="flex items-center gap-2 px-2 h-14">
          <SettingsBackButton />
          <h1 className="text-base font-bold text-gray-900">커뮤니티 설정</h1>
        </div>
      </header>

      {/* Profile summary */}
      <div className="bg-white px-5 py-4 mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden">
            {communityUser.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={communityUser.avatar_url}
                alt={communityUser.nickname}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-sm font-bold text-white">
                {communityUser.nickname[0]?.toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{communityUser.nickname}</p>
            <Link
              href="/community/settings/profile"
              className="text-xs text-[#0046BE] font-medium"
            >
              프로필 편집
            </Link>
          </div>
        </div>
      </div>

      {/* Menu List */}
      <div className="bg-white rounded-2xl mx-3 overflow-hidden shadow-sm">
        {MENU_ITEMS.map(({ icon: Icon, label, href, description }, index) => {
          const content = (
            <div className="flex items-center gap-3 px-4 py-4">
              <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                <Icon size={18} className="text-gray-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">{label}</p>
                {description && (
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{description}</p>
                )}
              </div>
              <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
            </div>
          )

          return (
            <div key={label}>
              {index > 0 && <div className="h-px bg-gray-50 mx-4" />}
              {href ? (
                <Link href={href} className="block active:bg-gray-50 transition-colors">
                  {content}
                </Link>
              ) : (
                <button
                  className="w-full text-left active:bg-gray-50 transition-colors opacity-60"
                  disabled
                >
                  {content}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Version info */}
      <p className="text-center text-xs text-gray-300 py-6">
        M-able 커뮤니티 v1.0.0
      </p>
    </div>
  )
}
