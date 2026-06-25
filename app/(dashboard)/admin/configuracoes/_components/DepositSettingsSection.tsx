'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateDepositSettings } from '@/app/actions/salon-settings'
import type { SalonSettingsRow } from '@/lib/types/database'

interface Props {
  settings: SalonSettingsRow | null
}

export function DepositSettingsSection({ settings }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [enabled, setEnabled] = useState(settings?.deposit_enabled ?? false)
  const [type, setType] = useState<'fixed' | 'percent'>(settings?.deposit_type ?? 'fixed')
  const [value, setValue] = useState(settings?.deposit_value != null ? String(settings.deposit_value) : '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Validação espelhando updateDepositSettings (server).
  const validationError: string | null = (() => {
    if (!enabled) return null
    const dv = parseFloat(value)
    if (!dv || dv <= 0) return 'Valor do sinal deve ser maior que zero.'
    if (type === 'percent' && dv > 100) return 'Porcentagem não pode ultrapassar 100%.'
    return null
  })()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    if (validationError) {
      setError(validationError)
      return
    }
    const fd = new FormData()
    fd.set('deposit_enabled', enabled ? 'true' : 'false')
    fd.set('deposit_type', type)
    fd.set('deposit_value', value)
    startTransition(async () => {
      const result = await updateDepositSettings(undefined, fd)
      if ('error' in result) {
        setError(result.error)
        return
      }
      setSaved(true)
      router.refresh()
    })
  }

  const typeBtnCls = (active: boolean) =>
    `text-xs rounded-lg px-3 py-1.5 border transition-colors ${
      active
        ? 'bg-tracy-gold text-tracy-bg border-tracy-gold font-semibold'
        : 'border-tracy-border text-tracy-muted hover:border-tracy-muted hover:text-tracy-text'
    }`

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-base font-bold text-tracy-text">Sinal padrão</h2>
        <p className="text-xs text-tracy-muted mt-0.5">
          Pré-preenche o sinal ao criar novas comandas. Editável caso a caso.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-tracy-surface border border-tracy-border rounded-xl p-5 space-y-4"
      >
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => { setEnabled(e.target.checked); setSaved(false) }}
            className="rounded accent-tracy-gold w-4 h-4"
          />
          <span className="text-sm text-tracy-text">Cobrar sinal por padrão</span>
        </label>

        {enabled && (
          <>
            <div className="flex gap-2">
              {(['fixed', 'percent'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setType(t); setSaved(false) }}
                  className={typeBtnCls(type === t)}
                >
                  {t === 'fixed' ? 'R$ fixo' : '% porcentagem'}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-tracy-muted shrink-0">{type === 'fixed' ? 'R$' : '%'}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={value}
                onChange={(e) => { setValue(e.target.value); setSaved(false) }}
                placeholder={type === 'fixed' ? '0,00' : '0'}
                className="flex-1 bg-tracy-bg border border-tracy-border rounded-lg px-2.5 py-1.5 text-tracy-text text-sm focus:outline-none focus:border-tracy-gold"
              />
            </div>
          </>
        )}

        {error && (
          <p className="text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={pending || !!validationError}
            className="bg-tracy-gold text-tracy-bg font-semibold rounded-lg px-5 py-2 text-sm disabled:opacity-50 transition-opacity"
          >
            {pending ? 'Salvando…' : 'Salvar'}
          </button>
          {saved && !pending && <span className="text-xs text-green-400">Salvo.</span>}
        </div>
      </form>
    </section>
  )
}
