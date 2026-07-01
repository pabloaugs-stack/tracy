import { createClient } from '@/lib/supabase/server'
import { brazilToday } from '@/lib/reports/period'
import {
  assembleMovements,
  assemblePreview,
  buildRunningBalance,
  filterForDisplay,
  summarize,
  shiftDate,
  type ApRow,
  type FeRow,
  type CpRow,
  type PpRow,
  type FePreviewRow,
  type PpPreviewRow,
  type CePreviewRow,
  type CashflowEntry,
  type CashflowPreviewEntry,
  type CashflowSummary,
  type CashflowFilters,
} from '@/lib/cashflow/compute'

// ── Caixa (Sprint 7 / Fatia 4) — camada de IO ──
// O extrato NÃO é uma tabela: é CALCULADO em regime de caixa a partir de 4 fontes já existentes
// (pagamentos de comanda, lançamentos, pagamentos de comissão, parcelas de compra). Esta camada só
// busca os dados; toda a montagem/ordenação/acúmulo do saldo é pura (lib/cashflow/compute.ts).

export type {
  CashflowEntry,
  CashflowPreviewEntry,
  CashflowSummary,
  CashflowFilters,
  CashflowCategory,
  CashflowType,
} from '@/lib/cashflow/compute'

// Carrega opening_balance/opening_balance_date do salão (com defaults seguros).
async function getOpeningBalance(salonId: string): Promise<{ balance: number; date: string | null }> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('salon_settings')
    .select('opening_balance, opening_balance_date')
    .eq('salon_id', salonId)
    .maybeSingle()
  return {
    balance: data?.opening_balance != null ? Number(data.opening_balance) : 0,
    date: data?.opening_balance_date ?? null,
  }
}

// Busca as 4 fontes de movimentação (regime de caixa) a partir de opening_balance_date até `until`,
// e mapeia para o formato cru agnóstico de IO que a camada pura consome.
async function fetchMovementRows(
  salonId: string,
  openingBalanceDate: string | null,
  until: string
): Promise<{ ap: ApRow[]; fe: FeRow[]; cp: CpRow[]; pp: PpRow[] }> {
  const supabase = await createClient()
  const from = openingBalanceDate

  let apQuery = supabase
    .from('appointment_payments')
    .select(`
      id, amount, paid_at, payment_type, created_at,
      appointment:appointments!appointment_payments_appointment_id_fkey(appointment_number)
    `)
    .eq('salon_id', salonId)
    .eq('active', true)
    .lte('paid_at', until)
  if (from) apQuery = apQuery.gte('paid_at', from)

  let feQuery = supabase
    .from('financial_entries')
    .select('id, amount, paid_at, kind, description, created_at')
    .eq('salon_id', salonId)
    .eq('active', true)
    .eq('status', 'pago')
    .in('kind', ['aporte', 'despesa', 'retirada'])
    .lte('paid_at', until)
  if (from) feQuery = feQuery.gte('paid_at', from)

  let cpQuery = supabase
    .from('commission_payments')
    .select(`
      id, total_amount, paid_at, created_at,
      professional:users!commission_payments_professional_id_fkey(name)
    `)
    .eq('salon_id', salonId)
    .lte('paid_at', until)
  if (from) cpQuery = cpQuery.gte('paid_at', from)

  let ppQuery = supabase
    .from('inventory_purchase_payments')
    .select(`
      id, amount, paid_at, installment_number, installment_total, created_at,
      purchase:inventory_purchases!inventory_purchase_payments_purchase_id_fkey(notes, purchase_date)
    `)
    .eq('salon_id', salonId)
    .eq('status', 'pago')
    .lte('paid_at', until)
  if (from) ppQuery = ppQuery.gte('paid_at', from)

  const [apRes, feRes, cpRes, ppRes] = await Promise.all([apQuery, feQuery, cpQuery, ppQuery])
  if (apRes.error) throw apRes.error
  if (feRes.error) throw feRes.error
  if (cpRes.error) throw cpRes.error
  if (ppRes.error) throw ppRes.error

  const ap: ApRow[] = ((apRes.data ?? []) as unknown as {
    id: string; amount: number; paid_at: string; payment_type: string; created_at: string
    appointment: { appointment_number: number | null } | null
  }[]).map((r) => ({
    id: r.id, amount: r.amount, paid_at: r.paid_at, payment_type: r.payment_type, created_at: r.created_at,
    appointment_number: r.appointment?.appointment_number ?? null,
  }))

  const fe = (feRes.data ?? []) as unknown as FeRow[]

  const cp: CpRow[] = ((cpRes.data ?? []) as unknown as {
    id: string; total_amount: number; paid_at: string; created_at: string; professional: { name: string } | null
  }[]).map((r) => ({
    id: r.id, total_amount: r.total_amount, paid_at: r.paid_at, created_at: r.created_at,
    professional_name: r.professional?.name ?? null,
  }))

  const pp: PpRow[] = ((ppRes.data ?? []) as unknown as {
    id: string; amount: number; paid_at: string; installment_number: number; installment_total: number
    created_at: string; purchase: { notes: string | null; purchase_date: string } | null
  }[]).map((r) => ({
    id: r.id, amount: r.amount, paid_at: r.paid_at, installment_number: r.installment_number,
    installment_total: r.installment_total, created_at: r.created_at,
    purchase_notes: r.purchase?.notes ?? null, purchase_date: r.purchase?.purchase_date ?? null,
  }))

  return { ap, fe, cp, pp }
}

// Para cada commission_payment, o intervalo de datas (min–max) das comandas cobertas por ele.
async function commissionDateRanges(
  salonId: string,
  paymentIds: string[]
): Promise<Map<string, { min: string; max: string }>> {
  const out = new Map<string, { min: string; max: string }>()
  if (paymentIds.length === 0) return out

  const supabase = await createClient()
  const { data } = await supabase
    .from('commission_entries')
    .select(`
      commission_payment_id, created_at,
      appointment:appointments!commission_entries_appointment_id_fkey(closed_at, scheduled_at)
    `)
    .eq('salon_id', salonId)
    .in('commission_payment_id', paymentIds)

  for (const e of (data ?? []) as unknown as {
    commission_payment_id: string | null; created_at: string
    appointment: { closed_at: string | null; scheduled_at: string | null } | null
  }[]) {
    if (!e.commission_payment_id) continue
    const raw = e.appointment?.closed_at ?? e.appointment?.scheduled_at ?? e.created_at
    const date = raw.slice(0, 10)
    const cur = out.get(e.commission_payment_id)
    if (!cur) out.set(e.commission_payment_id, { min: date, max: date })
    else out.set(e.commission_payment_id, { min: date < cur.min ? date : cur.min, max: date > cur.max ? date : cur.max })
  }
  return out
}

// Extrato do Caixa: lista de movimentações com saldo corrente, filtrada pelo período/tipo/categoria.
export async function getCashflowEntries(
  salonId: string,
  filters: CashflowFilters = {}
): Promise<CashflowEntry[]> {
  const { balance, date: openingDate } = await getOpeningBalance(salonId)
  const until = filters.end ?? brazilToday()

  const rows = await fetchMovementRows(salonId, openingDate, until)
  const ranges = await commissionDateRanges(salonId, rows.cp.map((c) => c.id))
  const movements = assembleMovements({ ...rows, commissionRanges: ranges })
  const all = buildRunningBalance(movements, balance)
  return filterForDisplay(all, filters)
}

// Resumo do Caixa: totais do período + saldo acumulado atual (até hoje).
export async function getCashflowSummary(
  salonId: string,
  filters: CashflowFilters = {}
): Promise<CashflowSummary> {
  const { balance, date: openingDate } = await getOpeningBalance(salonId)
  const today = brazilToday()
  const rows = await fetchMovementRows(salonId, openingDate, today)
  const ranges = await commissionDateRanges(salonId, rows.cp.map((c) => c.id))
  const movements = assembleMovements({ ...rows, commissionRanges: ranges })
  return summarize(movements, balance, openingDate, filters)
}

// Previsão de saídas futuras (NÃO afeta o saldo): parcelas de compra e lançamentos pendentes com
// vencimento em até `horizon` dias, e comissões pendentes (estimativa). Ordenada por due_date.
export async function getCashflowPreview(salonId: string, horizon = 30): Promise<CashflowPreviewEntry[]> {
  const supabase = await createClient()
  const today = brazilToday()
  const limit = shiftDate(today, horizon)

  const [feRes, ppRes, ceRes] = await Promise.all([
    supabase
      .from('financial_entries')
      .select('id, amount, due_date, kind, description')
      .eq('salon_id', salonId)
      .eq('active', true)
      .eq('status', 'pendente')
      .in('kind', ['despesa', 'retirada'])
      .lte('due_date', limit),
    supabase
      .from('inventory_purchase_payments')
      .select(`
        id, amount, due_date, installment_number, installment_total,
        purchase:inventory_purchases!inventory_purchase_payments_purchase_id_fkey(notes, purchase_date)
      `)
      .eq('salon_id', salonId)
      .eq('status', 'pendente')
      .lte('due_date', limit),
    supabase
      .from('commission_entries')
      .select(`
        id, total_commission, created_at,
        professional:users!commission_entries_professional_id_fkey(name)
      `)
      .eq('salon_id', salonId)
      .eq('active', true)
      .eq('status', 'pendente'),
  ])
  if (feRes.error) throw feRes.error
  if (ppRes.error) throw ppRes.error
  if (ceRes.error) throw ceRes.error

  const fe = (feRes.data ?? []) as unknown as FePreviewRow[]
  const pp: PpPreviewRow[] = ((ppRes.data ?? []) as unknown as {
    id: string; amount: number; due_date: string; installment_number: number; installment_total: number
    purchase: { notes: string | null; purchase_date: string } | null
  }[]).map((r) => ({
    id: r.id, amount: r.amount, due_date: r.due_date, installment_number: r.installment_number,
    installment_total: r.installment_total,
    purchase_notes: r.purchase?.notes ?? null, purchase_date: r.purchase?.purchase_date ?? null,
  }))
  const ce: CePreviewRow[] = ((ceRes.data ?? []) as unknown as {
    id: string; total_commission: number; created_at: string; professional: { name: string } | null
  }[]).map((r) => ({
    id: r.id, total_commission: r.total_commission, created_at: r.created_at,
    professional_name: r.professional?.name ?? null,
  }))

  return assemblePreview({ fe, pp, ce })
}
