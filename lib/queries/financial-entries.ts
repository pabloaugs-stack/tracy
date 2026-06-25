import { createClient } from '@/lib/supabase/server'
import type { FinancialEntryRow, FinancialEntryStatus } from '@/lib/types/database'

// Lista lançamentos do salão no período (filtra por due_date). Só ativos. Escopo por salão e
// gate can_view_financial garantidos pela RLS — o client normal já aplica os dois.
export async function listFinancialEntries(
  salonId: string,
  opts: { start: string; end: string; status?: FinancialEntryStatus }
): Promise<FinancialEntryRow[]> {
  const supabase = await createClient()
  let query = supabase
    .from('financial_entries')
    .select('*')
    .eq('salon_id', salonId)
    .eq('active', true)
    .gte('due_date', opts.start)
    .lte('due_date', opts.end)
    .order('due_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (opts.status) query = query.eq('status', opts.status)

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function getFinancialEntryById(id: string): Promise<FinancialEntryRow | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('financial_entries').select('*').eq('id', id).maybeSingle()
  return data ?? null
}

// Modelos recorrentes ativos do salão (is_recurring=true, sem parent). Base da projeção de previsão
// (lib/financial/recurrence.ts → projectFutureOccurrences) e da soma de despesas fixas.
export async function listActiveRecurringModels(salonId: string): Promise<FinancialEntryRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('financial_entries')
    .select('*')
    .eq('salon_id', salonId)
    .eq('active', true)
    .eq('is_recurring', true)
    .is('parent_recurring_id', null)
    .neq('recurrence', 'nenhuma')
    .order('due_date', { ascending: true })
  if (error) throw error
  return data ?? []
}

// "Despesas fixas ativas": comprometimento por OCORRÊNCIA (não soma ocorrências futuras) — soma o
// valor dos modelos de despesa recorrentes e ativos.
export async function getActiveFixedExpenses(salonId: string): Promise<{ count: number; total: number }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('financial_entries')
    .select('amount')
    .eq('salon_id', salonId)
    .eq('active', true)
    .eq('is_recurring', true)
    .eq('kind', 'despesa')
  if (error) throw error
  const rows = data ?? []
  return { count: rows.length, total: rows.reduce((s, r) => s + Number(r.amount), 0) }
}

// Alertas de vencimento para o dashboard: pendentes ativos vencidos (due_date < today) e a vencer
// nos próximos `windowDays` dias (today..today+windowDays inclusive).
export type FinancialAlerts = {
  vencidos: { count: number; total: number }
  aVencer: { count: number; total: number }
}
export async function getFinancialAlerts(
  salonId: string,
  today: string,
  windowDays = 7
): Promise<FinancialAlerts> {
  const [y, m, d] = today.split('-').map(Number)
  const horizon = new Date(Date.UTC(y, m - 1, d + windowDays)).toISOString().slice(0, 10)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('financial_entries')
    .select('amount, due_date')
    .eq('salon_id', salonId)
    .eq('active', true)
    .eq('status', 'pendente')
    .lte('due_date', horizon)
  if (error) throw error

  const result: FinancialAlerts = { vencidos: { count: 0, total: 0 }, aVencer: { count: 0, total: 0 } }
  for (const r of data ?? []) {
    const bucket = (r.due_date as string) < today ? result.vencidos : result.aVencer
    bucket.count++
    bucket.total += Number(r.amount)
  }
  return result
}
