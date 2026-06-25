'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateCardFeePassthroughSetting } from '@/app/actions/salon-settings'
import type { SalonSettingsRow } from '@/lib/types/database'

interface Props {
  settings: SalonSettingsRow | null
}

export function CardFeeSettingsSection({ settings }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [enabled, setEnabled] = useState(settings?.card_fee_passthrough_enabled ?? false)
  const [saved, setSaved] = useState(false)

  function toggle(next: boolean) {
    setEnabled(next)
    setSaved(false)
    const fd = new FormData()
    fd.set('card_fee_passthrough_enabled', next ? 'true' : 'false')
    startTransition(async () => {
      const r = await updateCardFeePassthroughSetting(undefined, fd)
      if (!('error' in r)) {
        setSaved(true)
        router.refresh()
      } else {
        setEnabled(!next) // reverte em erro
      }
    })
  }

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-base font-bold text-tracy-text">Repasse de taxa de cartão</h2>
        <p className="text-xs text-tracy-muted mt-0.5">
          Quando ligado, a taxa da maquininha é somada ao valor cobrado da cliente no cartão — o salão
          recebe o líquido da parcela inteiro. O total da comanda e o faturamento não mudam; a taxa
          aparece como custo separado nos relatórios.
        </p>
      </div>

      <div className="bg-tracy-surface border border-tracy-border rounded-xl p-5 flex items-center justify-between gap-4">
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            disabled={pending}
            onChange={(e) => toggle(e.target.checked)}
            className="rounded accent-tracy-gold w-4 h-4"
          />
          <span className="text-sm text-tracy-text">Repassar a taxa de cartão ao cliente</span>
        </label>
        {saved && !pending && <span className="text-xs text-green-400 shrink-0">Salvo.</span>}
      </div>
    </section>
  )
}
