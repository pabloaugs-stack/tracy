'use client'

import type { AppointmentStatus } from '@/lib/types/database'

interface Props {
  clientName: string
  serviceName: string
  time: string
  status: AppointmentStatus
  isClosed: boolean
  onClick: () => void
}

// Estado visual derivado de status + closed_at (precedência: cancelado > fechada > em andamento > agendado).
function visualClasses(status: AppointmentStatus, isClosed: boolean): string {
  if (status === 'cancelado' || status === 'nao_compareceu') {
    return 'bg-tracy-surface/40 border-tracy-border/50 opacity-40 line-through'
  }
  if (isClosed) {
    return 'bg-tracy-surface/50 border-tracy-border opacity-60'
  }
  if (status === 'em_andamento') {
    return 'bg-tracy-gold/10 border-tracy-gold shadow-[0_0_0_1px_var(--tracy-gold)]'
  }
  return 'bg-tracy-surface border-tracy-border hover:border-tracy-muted'
}

export function ComandaCard({ clientName, serviceName, time, status, isClosed, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`absolute inset-x-1 top-0 h-full overflow-hidden rounded-lg border text-left px-2 py-1.5 transition-colors ${visualClasses(
        status,
        isClosed
      )}`}
    >
      <p className="text-[10px] font-bold tabular-nums text-tracy-muted leading-none">{time}</p>
      <p className="text-xs font-bold text-tracy-text truncate mt-0.5">{clientName}</p>
      <p className="text-[11px] text-tracy-muted truncate">{serviceName}</p>
    </button>
  )
}
