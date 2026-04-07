'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

export default function SettingsBackButton() {
  const router = useRouter()
  return (
    <button onClick={() => router.back()} className="p-2 text-gray-700">
      <ChevronLeft size={22} />
    </button>
  )
}
