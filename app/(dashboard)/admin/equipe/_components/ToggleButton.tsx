'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getFutureAppointmentsCount, toggleTeamMemberAction } from '@/app/actions/team'

interface Props {
  memberId: string
  isActive: boolean
  memberName: string
}

type Status = 'idle' | 'checking' | 'confirming' | 'submitting'

export function ToggleButton({ memberId, isActive, memberName }: Props) {
  const router = useRouter()
  const [status, setStatus] = useState<Status>('idle')
  const [futureCount, setFutureCount] = useState(0)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(t)
  }, [toast])

  async function doToggle() {
    setStatus('submitting')
    const result = await toggleTeamMemberAction(memberId)
    if ('error' in result) {
      setToast({ msg: result.error, ok: false })
      setStatus('idle')
      return
    }
    setToast({
      msg: isActive ? `${memberName} inativada.` : `${memberName} reativada.`,
      ok: true,
    })
    setStatus('idle')
    router.refresh()
  }

  async function handleClick() {
    if (!isActive) {
      await doToggle()
      return
    }
    setStatus('checking')
    const count = await getFutureAppointmentsCount(memberId)
    if (count > 0) {
      setFutureCount(count)
      setStatus('confirming')
      return
    }
    await doToggle()
  }

  const isLoading = status === 'checking' || status === 'submitting'

  return (
    <>
      <button
        onClick={handleClick}
        disabled={isLoading}
        className="text-xs text-tracy-muted hover:text-tracy-text border border-tracy-border hover:border-tracy-muted rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isLoading ? '…' : isActive ? 'Inativar' : 'Reativar'}
      </button>

      {status === 'confirming' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-tracy-surface border border-tracy-border rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-tracy-text font-bold text-base mb-3">
              Inativar {memberName}?
            </h3>
            <p className="text-tracy-muted text-sm leading-relaxed mb-6">
              Esta profissional tem{' '}
              <span className="text-tracy-gold font-semibold">{futureCount}</span>{' '}
              comanda{futureCount !== 1 ? 's' : ''} futura
              {futureCount !== 1 ? 's' : ''} agendada{futureCount !== 1 ? 's' : ''}.
              Inativá-la não cancela esses atendimentos, mas ela não poderá ser selecionada
              em novas comandas. Deseja continuar?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setStatus('idle')}
                className="flex-1 text-sm text-tracy-muted border border-tracy-border rounded-lg py-2 hover:border-tracy-muted hover:text-tracy-text transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={doToggle}
                className="flex-1 text-sm bg-tracy-gold text-black font-semibold rounded-lg py-2 hover:opacity-90 transition-opacity"
              >
                Inativar mesmo assim
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded-lg text-sm font-semibold shadow-lg ${
            toast.ok ? 'bg-tracy-gold text-black' : 'bg-red-500/90 text-white'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </>
  )
}
