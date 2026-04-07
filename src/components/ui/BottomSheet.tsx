'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'

interface BottomSheetProps {
  children: React.ReactNode
  onClose: () => void
  title?: string
  subtitle?: string
}

export default function BottomSheet({ children, onClose, title, subtitle }: BottomSheetProps) {
  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  return (
    <>
      {/* Backdrop */}
      <div className="bottom-sheet-overlay" onClick={onClose} />

      {/* Sheet */}
      <div className="bottom-sheet">
        {/* Drag indicator */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        {(title || subtitle) && (
          <div className="px-5 pt-3 pb-4">
            {title && (
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-gray-900">{title}</h3>
                <button onClick={onClose} className="p-1 text-gray-400">
                  <X size={20} />
                </button>
              </div>
            )}
            {subtitle && (
              <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
            )}
          </div>
        )}

        {/* Content */}
        <div className="px-5 pb-6">
          {children}
        </div>
      </div>
    </>
  )
}
