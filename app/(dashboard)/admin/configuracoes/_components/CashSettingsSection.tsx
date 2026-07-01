'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateOpeningBalanceAction } from '@/app/actions/cashflow'
import type { SalonSettingsRow } from '@/lib/types/database'

interface Props {
  settings: SalonSettingsRow | null
}

const inputCls =
  'w-full bg-tracy-bg border border-tracy-border rounded-lg px-3 py-2 text-tracy-text text-sm focus:outline-none focus:border-tracy-gold [color-scheme:dark]'

export function CashSettingsSection({ settings }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [balance, setBalance] = useState(
    settings?.opening_balance != null ? String(settings.opening_balance) : '0'
  )
  const [date, setDate] = useState(settings?.opening_balance_date ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const today = new Intl.DateTimeFormat('sv', { timeZone: 'America/Sao_Paulo' }).format(new Date())

  function save() {
    setError(null)
    setSaved(false)
    const fd = new FormData()
    fd.set('opening_balance', balance || '0')
    fd.set('opening_balance_date', date)
    startTransition(async () => {
      const r = await updateOpeningBalanceAction(fd)
      if ('error' in r) {
        setError(r.error)
        return
      }
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <section id="caixa" className="scroll-mt-6">
      <div className="mb-4">
        <h2 className="text-base font-bold text-tracy-text">Caixa</h2>
        <p className="text-xs text-tracy-muted mt-0.5">
          Saldo inicial do caixa e data de início do extrato. Alterar esses valores recalcula todo o extrato.
        </p>
      </div>

      <div className="bg-tracy-surface border border-tracy-border rounded-xl p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] text-tracy-muted mb-1">Saldo inicial (R$)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              className={inputCls}
              placeholder="0,00"
            />
          </div>
          <div>
            <label className="block text-[11px] text-tracy-muted mb-1">
              Data de início do extrato <span className="opacity-50">(opcional)</span>
            </label>
            <input
              type="date"
              max={today}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputCls}
            />
            <p className="text-[10px] text-tracy-muted mt-1">
              Em branco = incluir toda a história. Preenchida = o extrato começa nesta data.
            </p>
          </div>
        </div>

        {error && (
          <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex items-center justify-end gap-3">
          {saved && !pending && <span className="text-xs text-green-400">Salvo.</span>}
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="bg-tracy-gold text-tracy-bg font-semibold rounded-lg px-5 py-2 text-sm disabled:opacity-50"
          >
            {pending ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </section>
  )
}
