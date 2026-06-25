'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { PERIOD_LABELS, type PeriodKey } from '@/lib/reports/period'

export type ExtraFilter =
  | { kind: 'select'; key: string; label: string; value: string; options: { value: string; label: string }[] }
  | { kind: 'number'; key: string; label: string; value: string; placeholder?: string }

interface Props {
  period: PeriodKey
  start?: string
  end?: string
  extras?: ExtraFilter[]
}

const PERIOD_KEYS: Exclude<PeriodKey, 'custom'>[] = ['hoje', '7d', '30d', 'mes_atual', 'mes_anterior', '12m']

export function ReportFilters({ period, start, end, extras = [] }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [customStart, setCustomStart] = useState(start ?? '')
  const [customEnd, setCustomEnd] = useState(end ?? '')

  function pushWith(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v === undefined || v === '') params.delete(k)
      else params.set(k, v)
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  const btnCls = (active: boolean) =>
    `text-xs font-semibold rounded-lg px-3 py-1.5 border transition-colors ${
      active
        ? 'bg-tracy-gold/10 border-tracy-gold/40 text-tracy-gold'
        : 'border-tracy-border text-tracy-muted hover:text-tracy-text hover:border-tracy-muted'
    }`

  return (
    <div className="space-y-3 mb-6">
      <div className="flex flex-wrap items-center gap-2">
        {PERIOD_KEYS.map((k) => (
          <button key={k} onClick={() => pushWith({ period: k, start: undefined, end: undefined })} className={btnCls(period === k)}>
            {PERIOD_LABELS[k]}
          </button>
        ))}
        <button onClick={() => pushWith({ period: 'custom' })} className={btnCls(period === 'custom')}>
          Personalizado
        </button>
      </div>

      {period === 'custom' && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="bg-tracy-surface border border-tracy-border rounded-lg px-3 py-1.5 text-tracy-text text-sm [color-scheme:dark] focus:outline-none focus:border-tracy-gold"
          />
          <span className="text-tracy-muted text-sm">até</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="bg-tracy-surface border border-tracy-border rounded-lg px-3 py-1.5 text-tracy-text text-sm [color-scheme:dark] focus:outline-none focus:border-tracy-gold"
          />
          <button
            onClick={() => pushWith({ period: 'custom', start: customStart, end: customEnd })}
            className="text-xs font-semibold bg-tracy-gold text-tracy-bg rounded-lg px-3 py-1.5"
          >
            Aplicar
          </button>
        </div>
      )}

      {extras.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {extras.map((f) =>
            f.kind === 'select' ? (
              <select
                key={f.key}
                value={f.value}
                onChange={(e) => pushWith({ [f.key]: e.target.value || undefined })}
                className="bg-tracy-surface border border-tracy-border rounded-lg px-3 py-1.5 text-tracy-text text-sm focus:outline-none focus:border-tracy-gold"
                aria-label={f.label}
              >
                <option value="">{f.label}: todos</option>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            ) : (
              <label key={f.key} className="flex items-center gap-2 text-xs text-tracy-muted">
                {f.label}
                <input
                  type="number"
                  min="0"
                  defaultValue={f.value}
                  placeholder={f.placeholder}
                  onBlur={(e) => pushWith({ [f.key]: e.target.value || undefined })}
                  className="w-20 bg-tracy-surface border border-tracy-border rounded-lg px-2 py-1.5 text-tracy-text text-sm text-right focus:outline-none focus:border-tracy-gold"
                />
              </label>
            )
          )}
        </div>
      )}
    </div>
  )
}
