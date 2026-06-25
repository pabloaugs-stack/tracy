import type { AppointmentWithRelations } from '@/lib/queries/appointments'

// Coluna do grid da agenda. `unassigned` marca a coluna fallback "Sem profissional".
export interface AgendaColumn {
  id: string
  name: string
  unassigned?: boolean
}

export const UNASSIGNED_ID = '__unassigned__'

// Fonte de verdade ÚNICA do grid da agenda: agrupa as comandas por coluna de profissional.
// Usada tanto pela renderização (AgendaGrid) quanto pela contagem do subheader (countAgenda),
// para que cards renderizados e número exibido nunca divirjam.
//
// Uma comanda com N profissionais alocadas a N colunas ativas aparece em N colunas (N cards =
// N "alocações") — é o diferencial do Tracy (trancista + auxiliar na mesma comanda). Comanda cujas
// profissionais não correspondem a nenhuma coluna ativa (legado/soft-delete) cai na coluna fallback
// "Sem profissional", em vez de sumir do grid.
export function groupAppointmentsByColumn(
  appointments: AppointmentWithRelations[],
  columns: { id: string; name: string }[]
): {
  renderColumns: AgendaColumn[]
  groups: Record<string, AppointmentWithRelations[]>
  orphans: AppointmentWithRelations[]
} {
  const realIds = new Set(columns.map((c) => c.id))
  const orphans = appointments.filter((a) => !a.professionals.some((p) => realIds.has(p.user_id)))

  const groups: Record<string, AppointmentWithRelations[]> = {}
  for (const col of columns) {
    groups[col.id] = appointments.filter((a) => a.professionals.some((p) => p.user_id === col.id))
  }

  const renderColumns: AgendaColumn[] = columns.map((c) => ({ id: c.id, name: c.name }))
  if (orphans.length > 0) {
    renderColumns.push({ id: UNASSIGNED_ID, name: 'Sem profissional', unassigned: true })
    groups[UNASSIGNED_ID] = orphans
  }

  return { renderColumns, groups, orphans }
}

// Contagem do subheader da agenda derivada do MESMO agrupamento que o grid usa para renderizar:
// - comandas: comandas distintas do dia (cada comanda conta 1, independente de quantas colunas ocupa).
// - alocacoes: total de cards renderizados (a comanda conta 1 por coluna de profissional em que aparece).
// Invariante: alocacoes >= comandas (toda comanda renderiza em ao menos uma coluna, inclusive a fallback).
export function countAgenda(
  appointments: AppointmentWithRelations[],
  columns: { id: string; name: string }[]
): { comandas: number; alocacoes: number } {
  const { groups } = groupAppointmentsByColumn(appointments, columns)
  const alocacoes = Object.values(groups).reduce((sum, list) => sum + list.length, 0)
  return { comandas: appointments.length, alocacoes }
}
