import Link from 'next/link'
import { ThemeCommunityId } from '@/types'

interface ThemeEntry {
  id: ThemeCommunityId
  name: string
  emoji: string
  color: string
  bgColor: string
}

const THEMES: ThemeEntry[] = [
  {
    id: 'us-stocks',
    name: '미국주식이야기',
    emoji: '🇺🇸',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
  },
  {
    id: 'kr-stocks',
    name: '국내주식이야기',
    emoji: '🇰🇷',
    color: 'text-red-700',
    bgColor: 'bg-red-50',
  },
  {
    id: 'asset-growth',
    name: '자산성장노하우',
    emoji: '📈',
    color: 'text-green-700',
    bgColor: 'bg-green-50',
  },
  {
    id: 'prime-club',
    name: '프라임클럽',
    emoji: '👑',
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-50',
  },
]

export default function ThemeShortcuts() {
  return (
    <section className="px-4 py-4 border-b border-gray-100">
      <h2 className="text-sm font-bold text-gray-900 mb-3">테마 커뮤니티</h2>
      <div className="grid grid-cols-4 gap-2">
        {THEMES.map(({ id, name, emoji, color, bgColor }) => (
          <Link
            key={id}
            href={`/community/theme/${id}`}
            className="flex flex-col items-center gap-1.5 group"
          >
            <div className={`w-14 h-14 rounded-2xl ${bgColor} flex items-center justify-center text-2xl group-active:scale-95 transition-transform`}>
              {emoji}
            </div>
            <span className={`text-[10px] font-medium text-center leading-tight ${color} line-clamp-2`}>
              {name}
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
