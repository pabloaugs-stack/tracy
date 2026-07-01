'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateCommissionCycleSetting } from '@/app/actions/salon-settings'
import type { SalonSettingsRow, CommissionCycle } from '@/lib/types/database'

interface Props {
  settings: SalonSettingsRow | null
}

const CYCLE_OPTIONS: { value: CommissionCycle; label: string }[] = [
  { value: 'semanal', label: 'Semanal' },
  { value: 'quinzenal', label: 'Quinzenal' },
  { value: 'mensal', label: 'Mensal' },
  { value: 'livre', label: 'Livre' },
]

export function CommissionCycleSection({ settings }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [cycle, setCycle] = useState<CommissionCycle>(settings?.commission_cycle ?? 'livre')
  const [saved, setSaved] = useState(false)

  function change(next: CommissionCycle) {
    const prev = cycle
    setCycle(next)
    setSaved(false)
    const fd = new FormData()
    fd.set('commission_cycle', next)
    startTransition(async () => {
      const r = await updateCommissionCycleSetting(undefined, fd)
      if (!('error' in r)) {
        setSaved(true)
        router.refresh()
      } else {
        setCycle(prev) // reverte em erro
      }
    })
  }

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-base font-bold text-tracy-text">Ciclo padrão de comissão</h2>
        <p className="text-xs text-tracy-muted mt-0.5">
          Pré-filtra o período na tela de Comissões a pagar. Não força a periodicidade — o pagamento
          continua com seleção livre de pendências.
        </p>
      </div>

      <div className="bg-tracy-surface border border-tracy-border rounded-xl p-5 flex items-center justify-between gap-4">
        <select
          value={cycle}
          disabled={pending}
          onChange={(e) => change(e.target.value as CommissionCycle)}
          className="bg-tracy-bg border border-tracy-border rounded-lg px-3 py-2 text-tracy-text text-sm focus:outline-none focus:border-tracy-gold disabled:opacity-40"
        >
          {CYCLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {saved && !pending && <span className="text-xs text-green-400 shrink-0">Salvo.</span>}
      </div>
    </section>
  )
}
