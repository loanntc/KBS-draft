'use client'

import BottomSheet from './BottomSheet'
import { ExternalLink, AlertTriangle } from 'lucide-react'

interface ExternalLinkWarningProps {
  url: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * BR-20: External link safety — all outbound URLs must show this warning.
 */
export default function ExternalLinkWarning({ url, onConfirm, onCancel }: ExternalLinkWarningProps) {
  const domain = (() => {
    try { return new URL(url).hostname } catch { return url }
  })()

  return (
    <BottomSheet onClose={onCancel} title="외부 링크로 이동합니다">
      <div className="space-y-3 mb-5 text-sm text-gray-600">
        <div className="flex items-start gap-2 p-3 bg-yellow-50 rounded-lg">
          <AlertTriangle size={16} className="text-yellow-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p>이 링크는 KB M-able 외부 사이트로 연결됩니다.</p>
            <p className="text-xs text-gray-500 font-mono">{domain}</p>
          </div>
        </div>
        <ul className="space-y-1.5 text-xs text-gray-500 list-disc list-inside">
          <li>KB증권은 외부 사이트의 내용에 책임지지 않습니다.</li>
          <li>개인정보 및 금융정보 입력에 주의하세요.</li>
          <li>출처 불명의 링크는 피싱 사이트일 수 있습니다.</li>
          <li>투자 정보는 반드시 공식 채널에서 확인하세요.</li>
        </ul>
      </div>
      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700"
        >
          취소
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 py-3 rounded-xl bg-[#FFD700] text-gray-900 text-sm font-semibold flex items-center justify-center gap-2"
        >
          <ExternalLink size={14} />
          이동하기
        </button>
      </div>
    </BottomSheet>
  )
}
