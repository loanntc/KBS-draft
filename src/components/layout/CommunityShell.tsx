'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { Home, Users, Star, User, Bell, Settings, Edit3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import PostComposer from '@/components/composer/PostComposer'

interface CommunityShellProps {
  children: React.ReactNode
  currentUser: {
    id: string
    nickname: string
    profileImage: string | null
  }
}

// LNB order confirmed v.20260527: 홈 | AI·인사이트 | 팔로잉 | 내 피드 (G-20)
const NAV_TABS = [
  { href: '/community',           label: '홈',       icon: Home,  exact: true  },
  { href: '/community/expert',    label: 'AI·인사이트', icon: Star,  exact: false },
  { href: '/community/following', label: '팔로잉',   icon: Users, exact: false },
  { href: '/community/my',        label: '내 피드',  icon: User,  exact: false },
]

// Tab-specific header titles
const TAB_TITLES: Record<string, string> = {
  '/community':           '커뮤니티',
  '/community/expert':    'AI·인사이트',
  '/community/following': '팔로잉',
  '/community/my':        '내 피드',
}

// Tabs where the write FAB should be hidden (spec §1.6.2: no FAB on AI·Expert) (G-21)
const NO_FAB_PATHS = ['/community/expert']

export default function CommunityShell({ children, currentUser }: CommunityShellProps) {
  const pathname = usePathname()
  const [composerOpen, setComposerOpen] = useState(false)

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname.startsWith(href)

  const showFab = !NO_FAB_PATHS.some((p) => pathname.startsWith(p))

  // Find matching tab title, fall back to 커뮤니티
  const currentTitle = Object.entries(TAB_TITLES)
    .sort((a, b) => b[0].length - a[0].length) // longest match first
    .find(([path]) => pathname.startsWith(path))?.[1] ?? '커뮤니티'

  return (
    <div className="mobile-container">
      {/* ── Top Bar ── */}
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center justify-between px-4 h-14">
          <span className="text-lg font-bold text-gray-900">{currentTitle}</span>
          <div className="flex items-center gap-1">
            <Link href="/community/notifications" className="p-2 text-gray-600 hover:text-gray-900 transition-colors">
              <Bell size={22} />
            </Link>
            <Link href="/community/settings" className="p-2 text-gray-600 hover:text-gray-900 transition-colors">
              <Settings size={22} />
            </Link>
          </div>
        </div>
      </header>

      {/* ── Page Content ── */}
      <main className="page-content">{children}</main>

      {/* ── Floating Write Button (hidden on AI·인사이트 tab per spec §1.6.2) ── */}
      {showFab && (
        <button
          onClick={() => setComposerOpen(true)}
          className="fixed z-30 bottom-[calc(56px+env(safe-area-inset-bottom)+12px)] right-[max(16px,calc((100vw-430px)/2+16px))] flex items-center gap-2 bg-[#FFD700] text-gray-900 font-semibold text-sm px-4 py-3 rounded-full shadow-lg active:scale-95 transition-transform"
        >
          <Edit3 size={16} />
          <span>글쓰기</span>
        </button>
      )}

      {/* ── Bottom Nav Bar ── */}
      <nav className="tab-bar">
        <div className="flex h-14">
          {NAV_TABS.map(({ href, label, icon: Icon, exact }) => {
            const active = isActive(href, exact)
            return (
              <Link
                key={href}
                href={href}
                prefetch={true}
                className={cn(
                  'flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors',
                  active ? 'text-gray-900' : 'text-gray-400'
                )}
              >
                {label === 'MY' && currentUser.profileImage ? (
                  <div className={cn(
                    'w-6 h-6 rounded-full overflow-hidden',
                    active ? 'ring-2 ring-gray-900' : 'ring-1 ring-gray-300'
                  )}>
                    <Image src={currentUser.profileImage} alt="MY" width={24} height={24} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
                )}
                <span>{label}</span>
              </Link>
            )
          })}
        </div>
      </nav>

      {composerOpen && (
        <PostComposer onClose={() => setComposerOpen(false)} currentUser={currentUser} />
      )}
    </div>
  )
}
