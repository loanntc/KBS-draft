'use client'

import { SortMode } from '@/types'
import { cn } from '@/lib/utils'

interface SortToggleProps {
  value: SortMode
  onChange: (mode: SortMode) => void
}

export default function SortToggle({ value, onChange }: SortToggleProps) {
  return (
    <div className="flex items-center bg-gray-100 rounded-full p-0.5 text-xs font-medium">
      <button
        onClick={() => onChange('popular')}
        className={cn(
          'px-3 py-1 rounded-full transition-all',
          value === 'popular' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
        )}
      >
        인기
      </button>
      <button
        onClick={() => onChange('latest')}
        className={cn(
          'px-3 py-1 rounded-full transition-all',
          value === 'latest' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
        )}
      >
        최신
      </button>
    </div>
  )
}
