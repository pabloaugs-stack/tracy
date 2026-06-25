import { createClient } from '@/lib/supabase/server'
import type { ResolvedPeriod } from '@/lib/reports/period'

export type RevenueMonthRow = { month: string; total: number } // month = 'YYYY-MM'

// Relatório 5: faturamento por mês. Lê appointment_payments ATIVOS agrupados por mês de paid_at.
// IMPORTANTE: usa paid_at (caixa real), NÃO created_at nem a data da comanda.
export async function getRevenueByMonth(salonId: string, period: ResolvedPeriod): Promise<RevenueMonthRow[]> {
  const supabase = await createClient()

  // paid_at é date — comparação direta por YYYY-MM-DD (inclusivo nas duas pontas).
  const { data, error } = await supabase
    .from('appointment_payments')
    .select('amount, paid_at')
    .eq('salon_id', salonId)
    .eq('active', true)
    .gte('paid_at', period.start)
    .lte('paid_at', period.end)

  if (error) throw error

  const map = new Map<string, number>()
  for (const r of data ?? []) {
    const month = (r.paid_at as string).slice(0, 7) // YYYY-MM
    map.set(month, (map.get(month) ?? 0) + Number(r.amount))
  }

  return [...map.entries()]
    .map(([month, total]) => ({ month, total }))
    .sort((a, b) => a.month.localeCompare(b.month))
}
