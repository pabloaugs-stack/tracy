import { createClient } from '@/lib/supabase/server'
import type {
  CommissionEntryStatus,
  CommissionRoleResolved,
  CommissionPaymentRow,
  UserRole,
} from '@/lib/types/database'

// Entrada de comissão com o contexto da comanda (data, cliente, serviço) e da profissional (nome/cargo).
// Escopo por salão e gate garantidos pela RLS (ce_select: financeiro OU a própria profissional).
export type CommissionEntryWithContext = {
  id: string
  appointment_id: string
  professional_id: string
  professionalName: string
  professionalRole: UserRole
  service_commission: number
  product_commission: number
  total_commission: number
  commission_percent_used: number | null
  role_resolved: CommissionRoleResolved | null
  override_used: boolean
  discount_applied: boolean
  has_divergence: boolean
  status: CommissionEntryStatus
  commission_payment_id: string | null
  resolved_at: string | null
  created_at: string
  scheduled_at: string | null
  closed_at: string | null
  clientName: string | null
  serviceName: string | null
}

export type CommissionEntryFilters = {
  professionalId?: string
  status?: CommissionEntryStatus | 'todas'
  start?: string
  end?: string
}

type RawEntry = {
  id: string
  appointment_id: string
  professional_id: string
  service_commission: number
  product_commission: number
  total_commission: number
  commission_percent_used: number | null
  role_resolved: CommissionRoleResolved | null
  override_used: boolean
  discount_applied: boolean
  has_divergence: boolean
  status: CommissionEntryStatus
  commission_payment_id: string | null
  resolved_at: string | null
  created_at: string
  professional: { name: string; role: UserRole } | null
  appointment: {
    scheduled_at: string | null
    closed_at: string | null
    client: { name: string } | null
    service: { name: string } | null
  } | null
}

// Lista entradas de comissão ativas do salão, com filtros opcionais (profissional/status/período por created_at).
export async function listCommissionEntries(
  salonId: string,
  filters: CommissionEntryFilters = {}
): Promise<CommissionEntryWithContext[]> {
  const supabase = await createClient()
  let query = supabase
    .from('commission_entries')
    .select(`
      id, appointment_id, professional_id, service_commission, product_commission, total_commission,
      commission_percent_used, role_resolved, override_used, discount_applied, has_divergence, status,
      commission_payment_id, resolved_at, created_at,
      professional:users!commission_entries_professional_id_fkey(name, role),
      appointment:appointments!commission_entries_appointment_id_fkey(
        scheduled_at, closed_at,
        client:clients!appointments_client_id_fkey(name),
        service:services!appointments_service_id_fkey(name)
      )
    `)
    .eq('salon_id', salonId)
    .eq('active', true)
    .order('created_at', { ascending: false })

  if (filters.professionalId) query = query.eq('professional_id', filters.professionalId)
  if (filters.status && filters.status !== 'todas') query = query.eq('status', filters.status)
  if (filters.start) query = query.gte('created_at', `${filters.start}T00:00:00-03:00`)
  if (filters.end) query = query.lte('created_at', `${filters.end}T23:59:59.999-03:00`)

  const { data, error } = await query
  if (error) throw error

  return ((data ?? []) as unknown as RawEntry[]).map((e) => ({
    id: e.id,
    appointment_id: e.appointment_id,
    professional_id: e.professional_id,
    professionalName: e.professional?.name ?? '—',
    professionalRole: e.professional?.role ?? 'trancista',
    service_commission: Number(e.service_commission),
    product_commission: Number(e.product_commission),
    total_commission: Number(e.total_commission),
    commission_percent_used: e.commission_percent_used != null ? Number(e.commission_percent_used) : null,
    role_resolved: e.role_resolved,
    override_used: e.override_used,
    discount_applied: e.discount_applied,
    has_divergence: e.has_divergence,
    status: e.status,
    commission_payment_id: e.commission_payment_id,
    resolved_at: e.resolved_at,
    created_at: e.created_at,
    scheduled_at: e.appointment?.scheduled_at ?? null,
    closed_at: e.appointment?.closed_at ?? null,
    clientName: e.appointment?.client?.name ?? null,
    serviceName: e.appointment?.service?.name ?? null,
  }))
}

// Grupo de pendências de uma profissional (para a tela Comissões a pagar).
export type PendingCommissionGroup = {
  professionalId: string
  name: string
  role: UserRole
  total: number
  entries: CommissionEntryWithContext[]
}

// Pendentes agrupadas por profissional: nome, cargo, Σ pendente e a lista de entradas.
export async function listPendingCommissionsByProfessional(
  salonId: string,
  filters: Omit<CommissionEntryFilters, 'status'> = {}
): Promise<PendingCommissionGroup[]> {
  const entries = await listCommissionEntries(salonId, { ...filters, status: 'pendente' })
  const map = new Map<string, PendingCommissionGroup>()
  for (const e of entries) {
    const g =
      map.get(e.professional_id) ??
      { professionalId: e.professional_id, name: e.professionalName, role: e.professionalRole, total: 0, entries: [] }
    g.total += e.total_commission
    g.entries.push(e)
    map.set(e.professional_id, g)
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
}

// Total pendente global do salão + quebra por profissional (para resumo/cabeçalho).
export type CommissionSummary = {
  totalPending: number
  byProfessional: { professionalId: string; name: string; total: number }[]
}
export async function getCommissionSummary(salonId: string): Promise<CommissionSummary> {
  const groups = await listPendingCommissionsByProfessional(salonId)
  return {
    totalPending: groups.reduce((s, g) => s + g.total, 0),
    byProfessional: groups.map((g) => ({ professionalId: g.professionalId, name: g.name, total: g.total })),
  }
}

// Histórico de pagamentos de comissão do salão (com nome da profissional).
export type CommissionPaymentWithName = CommissionPaymentRow & { professionalName: string }
type RawPayment = CommissionPaymentRow & { professional: { name: string } | null }

export async function listCommissionPayments(
  salonId: string,
  filters: { professionalId?: string; start?: string; end?: string } = {}
): Promise<CommissionPaymentWithName[]> {
  const supabase = await createClient()
  let query = supabase
    .from('commission_payments')
    .select(`
      id, salon_id, professional_id, paid_at, total_amount, nf_emitida, nf_number, notes, created_by, created_at,
      professional:users!commission_payments_professional_id_fkey(name)
    `)
    .eq('salon_id', salonId)
    .order('paid_at', { ascending: false })
    .order('created_at', { ascending: false })

  if (filters.professionalId) query = query.eq('professional_id', filters.professionalId)
  if (filters.start) query = query.gte('paid_at', filters.start)
  if (filters.end) query = query.lte('paid_at', filters.end)

  const { data, error } = await query
  if (error) throw error
  return ((data ?? []) as unknown as RawPayment[]).map((p) => ({
    ...p,
    professionalName: p.professional?.name ?? '—',
  }))
}
