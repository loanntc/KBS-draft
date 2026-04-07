'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Camera, ImageIcon, Shuffle, ChevronRight, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn, validateNickname } from '@/lib/utils'

// ─── Preset gradient avatars ────────────────────────────────────────────────
const PRESET_GRADIENTS = [
  'from-yellow-400 to-orange-500',
  'from-blue-400 to-indigo-600',
  'from-green-400 to-teal-600',
  'from-pink-400 to-rose-600',
  'from-purple-400 to-violet-600',
  'from-cyan-400 to-sky-600',
]

type Step = 'terms' | 'profile'

interface TermsState {
  termsService: boolean
  privacyConsent: boolean
  notificationConsent: boolean
  marketingConsent: boolean
}

export default function JoinPage() {
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState<Step>('terms')

  // ── Terms state ────────────────────────────────────────────────────────────
  const [terms, setTerms] = useState<TermsState>({
    termsService: false,
    privacyConsent: false,
    notificationConsent: false,
    marketingConsent: false,
  })

  const allRequired = terms.termsService && terms.privacyConsent && terms.notificationConsent
  const allChecked = allRequired && terms.marketingConsent

  const handleSelectAll = () => {
    const next = !allChecked
    setTerms({
      termsService: next,
      privacyConsent: next,
      notificationConsent: next,
      marketingConsent: next,
    })
  }

  const toggleTerm = (key: keyof TermsState) => {
    setTerms((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // ── Profile state ──────────────────────────────────────────────────────────
  const [gradientIndex, setGradientIndex] = useState(0)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [showPresetGallery, setShowPresetGallery] = useState(false)
  const [nickname, setNickname] = useState('')
  const [nicknameError, setNicknameError] = useState<string | null>(null)
  const [nicknameAvailable, setNicknameAvailable] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const checkNickname = useCallback(async (value: string) => {
    const formatError = validateNickname(value)
    if (formatError) {
      setNicknameError(formatError)
      setNicknameAvailable(null)
      return
    }
    setChecking(true)
    setNicknameError(null)
    const { data } = await supabase
      .from('community_users')
      .select('id')
      .eq('nickname', value)
      .maybeSingle()
    setChecking(false)
    if (data) {
      setNicknameError('이미 사용 중인 닉네임이에요.')
      setNicknameAvailable(false)
    } else {
      setNicknameAvailable(true)
    }
  }, [supabase])

  const handleNicknameChange = (value: string) => {
    setNickname(value)
    setNicknameAvailable(null)
    setNicknameError(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (value.length === 0) return
    debounceRef.current = setTimeout(() => checkNickname(value), 300)
  }

  const randomizeGradient = () => {
    setGradientIndex((prev) => (prev + 1) % PRESET_GRADIENTS.length)
    setAvatarUrl(null)
  }

  const canSubmitProfile = nickname.length >= 3 && nicknameAvailable === true && !checking

  const handleSubmit = async () => {
    if (!canSubmitProfile || submitting) return
    setSubmitting(true)
    setSubmitError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login?next=/community/join')
        return
      }

      const { error } = await supabase.from('community_users').insert({
        user_id: user.id,
        nickname,
        avatar_url: avatarUrl,
        avatar_gradient: PRESET_GRADIENTS[gradientIndex],
        terms_service: terms.termsService,
        privacy_consent: terms.privacyConsent,
        notification_consent: terms.notificationConsent,
        marketing_consent: terms.marketingConsent,
        is_expert: false,
        post_count: 0,
        follower_count: 0,
        following_count: 0,
        feed_public: true,
        holdings_public: false,
        performance_public: false,
        scrap_public: false,
      })

      if (error) {
        setSubmitError('프로필 설정에 실패했어요. 다시 시도해주세요.')
        setSubmitting(false)
        return
      }

      router.push('/community')
    } catch {
      setSubmitError('오류가 발생했어요. 다시 시도해주세요.')
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-end pb-0">
      <div className="w-full max-w-[430px] min-h-screen flex flex-col bg-white">

        {/* ── STEP 1: Terms ── */}
        {step === 'terms' && (
          <div className="flex flex-col flex-1">
            {/* Header */}
            <div className="px-5 pt-14 pb-8">
              <h1 className="text-2xl font-bold text-gray-900 leading-tight">
                커뮤니티 서비스<br />
                이용에 동의해 주세요
              </h1>
              <p className="text-sm text-gray-500 mt-2">
                M-able 커뮤니티를 시작하기 위해<br />
                아래 약관에 동의해주세요.
              </p>
            </div>

            {/* Select All */}
            <div className="mx-5 mb-3 rounded-xl bg-gray-50 px-4 py-3">
              <button
                onClick={handleSelectAll}
                className="flex items-center gap-3 w-full"
              >
                <div className={cn(
                  'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                  allChecked
                    ? 'bg-[#FFD700] border-[#FFD700]'
                    : 'border-gray-300'
                )}>
                  {allChecked && <Check size={12} className="text-white" strokeWidth={3} />}
                </div>
                <span className="text-sm font-bold text-gray-900">전체 동의</span>
              </button>
            </div>

            <div className="mx-5 h-px bg-gray-100 mb-3" />

            {/* Individual Terms */}
            <div className="mx-5 flex flex-col gap-3">
              {[
                { key: 'termsService' as keyof TermsState, label: '커뮤니티 서비스 이용 약관', required: true },
                { key: 'privacyConsent' as keyof TermsState, label: '개인정보 수집·이용 동의', required: true },
                { key: 'notificationConsent' as keyof TermsState, label: '정보성 알림 수신 동의', required: true },
                { key: 'marketingConsent' as keyof TermsState, label: '마케팅 정보 수신 동의', required: false },
              ].map(({ key, label, required }) => (
                <div key={key} className="flex items-center justify-between">
                  <button
                    onClick={() => toggleTerm(key)}
                    className="flex items-center gap-3 flex-1"
                  >
                    <div className={cn(
                      'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                      terms[key]
                        ? 'bg-[#FFD700] border-[#FFD700]'
                        : 'border-gray-300'
                    )}>
                      {terms[key] && <Check size={12} className="text-white" strokeWidth={3} />}
                    </div>
                    <span className="text-sm text-gray-800">
                      <span className={cn(
                        'text-xs font-medium mr-1',
                        required ? 'text-[#E8003D]' : 'text-gray-400'
                      )}>
                        [{required ? '필수' : '선택'}]
                      </span>
                      {label}
                    </span>
                  </button>
                  <button className="p-1 text-gray-400">
                    <ChevronRight size={16} />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex-1" />

            {/* Next Button */}
            <div className="px-5 pb-10 pt-6">
              <button
                onClick={() => allRequired && setStep('profile')}
                disabled={!allRequired}
                className={cn(
                  'w-full py-4 rounded-2xl text-base font-bold transition-all',
                  allRequired
                    ? 'bg-[#FFD700] text-gray-900'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                )}
              >
                다음
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Profile Setup ── */}
        {step === 'profile' && (
          <div className="flex flex-col flex-1">
            {/* Header */}
            <div className="flex items-center px-4 pt-12 pb-6">
              <button onClick={() => setStep('terms')} className="p-2 -ml-2 text-gray-700">
                <X size={20} />
              </button>
              <h1 className="text-lg font-bold text-gray-900 ml-2">프로필 설정</h1>
            </div>

            {/* Avatar */}
            <div className="flex flex-col items-center gap-4 pb-8">
              <div className="relative">
                <div className={cn(
                  'w-24 h-24 rounded-full overflow-hidden flex items-center justify-center',
                  !avatarUrl && `bg-gradient-to-br ${PRESET_GRADIENTS[gradientIndex]}`
                )}>
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-3xl font-bold text-white">
                      {nickname[0]?.toUpperCase() || '?'}
                    </span>
                  )}
                </div>
                <button
                  onClick={randomizeGradient}
                  className="absolute -bottom-1 -right-1 w-7 h-7 bg-gray-800 rounded-full flex items-center justify-center"
                >
                  <Shuffle size={13} className="text-white" />
                </button>
              </div>

              {/* Avatar options */}
              <div className="flex gap-4">
                <button className="flex flex-col items-center gap-1 text-xs text-gray-600">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                    <Camera size={18} className="text-gray-600" />
                  </div>
                  <span>카메라</span>
                </button>
                <button className="flex flex-col items-center gap-1 text-xs text-gray-600">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                    <ImageIcon size={18} className="text-gray-600" />
                  </div>
                  <span>앨범</span>
                </button>
                <button
                  onClick={() => setShowPresetGallery(!showPresetGallery)}
                  className="flex flex-col items-center gap-1 text-xs text-gray-600"
                >
                  <div className={cn(
                    'w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center',
                    showPresetGallery && 'ring-2 ring-[#FFD700]'
                  )}>
                    <Shuffle size={18} className="text-gray-600" />
                  </div>
                  <span>프리셋</span>
                </button>
              </div>

              {/* Preset gallery */}
              {showPresetGallery && (
                <div className="flex gap-3 px-5">
                  {PRESET_GRADIENTS.map((gradient, i) => (
                    <button
                      key={gradient}
                      onClick={() => { setGradientIndex(i); setAvatarUrl(null); setShowPresetGallery(false) }}
                      className={cn(
                        'w-12 h-12 rounded-full bg-gradient-to-br flex-shrink-0',
                        gradient,
                        i === gradientIndex && 'ring-2 ring-offset-2 ring-[#FFD700]'
                      )}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Nickname input */}
            <div className="px-5">
              <label className="text-sm font-semibold text-gray-700 block mb-2">닉네임</label>
              <div className="relative">
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => handleNicknameChange(e.target.value)}
                  placeholder="닉네임을 입력해주세요"
                  maxLength={10}
                  className={cn(
                    'w-full px-4 py-3.5 rounded-xl border text-sm bg-gray-50 outline-none transition-all',
                    nicknameError
                      ? 'border-red-400 bg-red-50'
                      : nicknameAvailable
                        ? 'border-green-400 bg-green-50'
                        : 'border-gray-200 focus:border-[#FFD700]'
                  )}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                  {nickname.length}/10
                </span>
              </div>

              {/* Feedback messages */}
              <div className="mt-1.5 min-h-[20px]">
                {checking && (
                  <p className="text-xs text-gray-400">확인 중...</p>
                )}
                {!checking && nicknameError && (
                  <p className="text-xs text-red-500">{nicknameError}</p>
                )}
                {!checking && nicknameAvailable === true && !nicknameError && (
                  <p className="text-xs text-green-600">사용 가능한 닉네임이에요.</p>
                )}
                {!nicknameError && !nicknameAvailable && !checking && nickname.length > 0 && (
                  <p className="text-xs text-gray-400">한글·영문 소문자·숫자 3~10자</p>
                )}
                {nickname.length === 0 && (
                  <p className="text-xs text-gray-400">한글·영문 소문자·숫자 3~10자</p>
                )}
              </div>

              {submitError && (
                <p className="mt-3 text-xs text-red-500 text-center">{submitError}</p>
              )}
            </div>

            <div className="flex-1" />

            {/* Submit Button */}
            <div className="px-5 pb-10 pt-6">
              <button
                onClick={handleSubmit}
                disabled={!canSubmitProfile || submitting}
                className={cn(
                  'w-full py-4 rounded-2xl text-base font-bold transition-all',
                  canSubmitProfile && !submitting
                    ? 'bg-[#FFD700] text-gray-900'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                )}
              >
                {submitting ? '설정 중...' : '커뮤니티 시작하기'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
