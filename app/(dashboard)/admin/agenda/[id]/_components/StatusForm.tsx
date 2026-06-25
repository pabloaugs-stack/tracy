'use client'

import { useActionState } from 'react'
import { updateAppointmentStatusAction } from '@/app/actions/appointments'
import type { AppointmentStatus } from '@/lib/types/database'

const STATUS_OPTIONS: { value: AppointmentStatus; label: string }[] = [
  { value: 'agendado', label: 'Agendado' },
  { value: 'em_andamento', label: 'Em andamento' },
  { value: 'concluido', label: 'Concluído' },
  { value: 'cancelado', label: 'Cancelado' },
  { value: 'nao_compareceu', label: 'Não compareceu' },
]

interface Props {
  appointmentId: string
  currentStatus: AppointmentStatus
  isLocked?: boolean
}

export default function StatusForm({ appointmentId, currentStatus, isLocked = false }: Props) {
  const boundAction = updateAppointmentStatusAction.bind(null, appointmentId)
  const [state, formAction, pending] = useActionState(boundAction, undefined)

  if (isLocked) {
    return (
      <p className="text-sm text-tracy-muted mt-2">
        Comanda fechada — reabra para alterar o status.
      </p>
    )
  }

  return (
    <form action={formAction} className="flex items-center gap-2 mt-2">
      <select
        name="status"
        defaultValue={currentStatus}
        disabled={pending}
        className="bg-tracy-surface border border-tracy-border rounded-lg px-3 py-1.5 text-tracy-text text-sm focus:outline-none focus:border-tracy-gold disabled:opacity-50"
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="text-xs bg-tracy-gold text-tracy-bg font-semibold rounded-lg px-3 py-1.5 hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {pending ? 'Salvando…' : 'Alterar'}
      </button>
      {state?.error && (
        <p className="text-xs text-red-400">{state.error}</p>
      )}
    </form>
  )
}
