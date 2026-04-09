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
    profileImage: string | null  // DB: profile_image
  }
}

const NAV_TABS = [
  { href: '/community', label: '홈', icon: Home, exact: true },
  { href: '/community/following', label: '팔로잉', icon: Users, exact: false },
  { href: '/community/expert', label: '전문가', icon: Star, exact: false },
  { href: '/community/my', label: 'MY', icon: User, exact: false },
]

export default function CommunityShell({ children, currentUser }: CommunityShellProps) {
  const pathname = usePathname()
  const [composerOpen, setComposerOpen] = useState(false)

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname.startsWith(href)

  return (
    <div className="mobile-container">
      {/* ── Top Bar ── */}
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between px-4 h-14">
          <Link href="/community" className="text-lg font-bold text-gray-900">
            커뮤니티
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/community/notifications" className="relative p-1">
              <Bell size={22} className="text-gray-700" />
            </Link>
            <Link href="/community/settings" className="p-1">
              <Settings size={22} className="text-gray-700" />
            </Link>
          </div>
        </div>
      </header>

      {/* ── Page Content ── */}
      <main className="pb-24">{children}</main>

      {/* ── Floating Write Button ── */}
      <button
        onClick={() => setComposerOpen(true)}
        className="fixed z-30 bottom-20 right-4 flex items-center gap-2 bg-[#FFD700] text-gray-900 font-semibold text-sm px-4 py-3 rounded-full shadow-lg"
      >
        <Edit3 size={16} />
        <span>글쓰기</span>
      </button>

      {/* ── Bottom Nav Bar ── */}
      <nav className="tab-bar">
        <div className="flex">
          {NAV_TABS.map(({ href, label, icon: Icon, exact }) => {
            const active = isActive(href, exact)
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition-colors',
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
