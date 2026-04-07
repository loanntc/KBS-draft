'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye, EyeOff, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('next') || '/community'
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return
    setLoading(true)
    setError(null)

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      if (authError.message.includes('Invalid login credentials')) {
        setError('이메일 또는 비밀번호가 올바르지 않아요.')
      } else if (authError.message.includes('Email not confirmed')) {
        setError('이메일 인증이 완료되지 않았어요. 이메일을 확인해주세요.')
      } else {
        setError('로그인에 실패했어요. 잠시 후 다시 시도해주세요.')
      }
      setLoading(false)
      return
    }

    router.push(redirectTo)
  }

  const isFormValid = email.length > 0 && password.length >= 6

  return (
    <div className="min-h-screen bg-white flex flex-col max-w-[430px] mx-auto">
      {/* Logo / Branding */}
      <div className="flex flex-col items-center pt-20 pb-10 px-5">
        <div className="w-14 h-14 rounded-2xl bg-[#FFD700] flex items-center justify-center mb-4 shadow-md">
          <span className="text-2xl font-black text-gray-900">M</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">M-able 커뮤니티</h1>
        <p className="text-sm text-gray-500 mt-1 text-center">
          투자 인사이트를 나누는 공간
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleLogin} className="flex-1 flex flex-col px-5 gap-4">
        {/* Email */}
        <div>
          <label className="text-sm font-semibold text-gray-700 block mb-1.5">이메일</label>
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(null) }}
            placeholder="이메일을 입력해주세요"
            autoComplete="email"
            className={cn(
              'w-full px-4 py-3.5 rounded-xl border text-sm bg-gray-50 outline-none transition-all',
              error ? 'border-red-400' : 'border-gray-200 focus:border-[#FFD700]'
            )}
          />
        </div>

        {/* Password */}
        <div>
          <label className="text-sm font-semibold text-gray-700 block mb-1.5">비밀번호</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null) }}
              placeholder="비밀번호를 입력해주세요"
              autoComplete="current-password"
              className={cn(
                'w-full px-4 py-3.5 pr-11 rounded-xl border text-sm bg-gray-50 outline-none transition-all',
                error ? 'border-red-400' : 'border-gray-200 focus:border-[#FFD700]'
              )}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 p-1"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 rounded-xl">
            <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}

        {/* Login Button */}
        <button
          type="submit"
          disabled={!isFormValid || loading}
          className={cn(
            'w-full py-4 rounded-2xl text-base font-bold transition-all mt-2',
            isFormValid && !loading
              ? 'bg-[#FFD700] text-gray-900 active:scale-[0.98]'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          )}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              로그인 중...
            </span>
          ) : '로그인'}
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 my-2">
          <div className="flex-1 h-px bg-gray-100" />
          <span className="text-xs text-gray-400">또는</span>
          <div className="flex-1 h-px bg-gray-100" />
        </div>

        {/* KB SSO hint */}
        <button
          type="button"
          className="w-full py-4 rounded-2xl text-base font-bold border-2 border-[#0046BE] text-[#0046BE] transition-all active:scale-[0.98]"
          onClick={() => {/* KB SSO integration point */}}
        >
          KB 금융 계정으로 로그인
        </button>
      </form>

      {/* Footer */}
      <div className="px-5 py-8 text-center">
        <p className="text-xs text-gray-400">
          로그인하면 KB증권 M-able{' '}
          <button className="text-[#0046BE] underline">이용약관</button>
          {' '}및{' '}
          <button className="text-[#0046BE] underline">개인정보처리방침</button>
          에 동의하게 됩니다.
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-gray-200 border-t-[#FFD700] rounded-full animate-spin" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
