'use client'

import type { AppointmentStatus } from '@/lib/types/database'
import { formatAppointmentNumber } from '@/lib/appointments/format'

interface Props {
  clientName: string
  serviceName: string
  time: string
  status: AppointmentStatus
  isClosed: boolean
  appointmentNumber: number | null
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

export function ComandaCard({ clientName, serviceName, time, status, isClosed, appointmentNumber, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`absolute inset-x-1 top-0 h-full overflow-hidden rounded-lg border text-left px-2 py-1.5 transition-colors ${visualClasses(
        status,
        isClosed
      )}`}
    >
      <div className="flex items-center justify-between gap-1 leading-none">
        <p className="text-[10px] font-bold tabular-nums text-tracy-muted">{time}</p>
        <p className="text-[10px] font-semibold tabular-nums text-tracy-muted/70">
          {formatAppointmentNumber(appointmentNumber)}
        </p>
      </div>
      <p className="text-xs font-bold text-tracy-text truncate mt-0.5">{clientName}</p>
      <p className="text-[11px] text-tracy-muted truncate">{serviceName}</p>
    </button>
  )
}
