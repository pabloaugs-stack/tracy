import { createClient } from '@/lib/supabase/server'
import type { AppointmentStatus } from '@/lib/types/database'
import { tsBounds, type ResolvedPeriod } from '@/lib/reports/period'

export type StatusCountRow = { status: AppointmentStatus; count: number }

const ALL_STATUSES: AppointmentStatus[] = ['agendado', 'em_andamento', 'concluido', 'cancelado', 'nao_compareceu']

// Relatório 1: agendamentos por status (filtro período + profissional opcional).
export async function getAppointmentsByStatus(
  salonId: string,
  period: ResolvedPeriod,
  professionalId?: string
): Promise<StatusCountRow[]> {
  const supabase = await createClient()
  const { startTs, endTs } = tsBounds(period)

  let apptIds: string[] | null = null
  if (professionalId) {
    const { data: links } = await supabase
      .from('appointment_professionals')
      .select('appointment_id')
      .eq('user_id', professionalId)
    apptIds = (links ?? []).map((l) => l.appointment_id)
    if (apptIds.length === 0) return ALL_STATUSES.map((s) => ({ status: s, count: 0 }))
  }

  let q = supabase
    .from('appointments')
    .select('status')
    .eq('salon_id', salonId)
    .gte('scheduled_at', startTs)
    .lt('scheduled_at', endTs)
  if (apptIds) q = q.in('id', apptIds)

  const { data, error } = await q
  if (error) throw error

  const counts = new Map<AppointmentStatus, number>(ALL_STATUSES.map((s) => [s, 0]))
  for (const row of data ?? []) {
    const s = row.status as AppointmentStatus
    counts.set(s, (counts.get(s) ?? 0) + 1)
  }
  return ALL_STATUSES.map((s) => ({ status: s, count: counts.get(s) ?? 0 }))
}
