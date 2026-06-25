'use client'

import { useRouter } from 'next/navigation'

interface Props {
  selectedDate: string
  today: string
}

// Soma `delta` dias a uma data YYYY-MM-DD com aritmética pura (independe do timezone do servidor).
function shiftDate(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const next = new Date(y, m - 1, d + delta)
  return [
    next.getFullYear(),
    String(next.getMonth() + 1).padStart(2, '0'),
    String(next.getDate()).padStart(2, '0'),
  ].join('-')
}

export function AgendaDatePicker({ selectedDate, today }: Props) {
  const router = useRouter()
  const isToday = selectedDate === today

  function goto(dateStr: string) {
    router.push(`/admin/agenda?date=${dateStr}`)
  }

  const navBtnCls =
    'flex items-center justify-center w-8 h-8 rounded-lg border border-tracy-border text-tracy-muted hover:text-tracy-gold hover:border-tracy-gold/40 transition-colors'

  return (
    <div className="flex items-center gap-2 mb-6">
      <button
        type="button"
        onClick={() => goto(shiftDate(selectedDate, -1))}
        aria-label="Dia anterior"
        className={navBtnCls}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      <input
        type="date"
        value={selectedDate}
        onChange={(e) => {
          if (!e.target.value) return
          goto(e.target.value)
        }}
        className="bg-tracy-surface border border-tracy-border rounded-lg px-3 py-1.5 text-tracy-text text-sm focus:outline-none focus:border-tracy-gold [color-scheme:dark]"
      />

      <button
        type="button"
        onClick={() => goto(shiftDate(selectedDate, 1))}
        aria-label="Próximo dia"
        className={navBtnCls}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      {!isToday && (
        <button
          onClick={() => router.push('/admin/agenda')}
          className="text-xs text-tracy-gold border border-tracy-gold/30 rounded-lg px-3 py-1.5 hover:bg-tracy-gold/10 transition-colors"
        >
          Hoje
        </button>
      )}
    </div>
  )
}
