import { createClient } from '@/lib/supabase/server'
import type { ResolvedPeriod } from '@/lib/reports/period'

export type PaymentMethodUsageRow = {
  methodId: string
  name: string
  total: number
  feeTotal: number
  count: number
  percent: number
}

export type PaymentMethodsUsage = {
  rows: PaymentMethodUsageRow[]
  grossTotal: number // receita bruta (Σ amount)
  feeTotal: number // Σ taxas de cartão (Σ fee_amount)
  netTotal: number // receita líquida = bruta − taxas
}

// Relatório 6: uso por forma de pagamento. appointment_payments ativos no período (por paid_at).
// Uma comanda pode aparecer em N formas (pagamento dividido) — soma natural. amount é receita BRUTA
// (cliente paga cheio); fee_amount é o custo de cartão do salão. Líquida = bruta − Σ fee_amount.
export async function getPaymentMethodsUsage(salonId: string, period: ResolvedPeriod): Promise<PaymentMethodsUsage> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('appointment_payments')
    .select(`
      amount, fee_amount, payment_method_id,
      method:payment_methods!appointment_payments_payment_method_id_fkey(name)
    `)
    .eq('salon_id', salonId)
    .eq('active', true)
    .gte('paid_at', period.start)
    .lte('paid_at', period.end)

  if (error) throw error

  type Raw = { amount: number; fee_amount: number | null; payment_method_id: string; method: { name: string } | null }
  const map = new Map<string, { name: string; total: number; feeTotal: number; count: number }>()
  let grossTotal = 0
  let feeTotal = 0
  for (const r of (data ?? []) as unknown as Raw[]) {
    const cur = map.get(r.payment_method_id) ?? { name: r.method?.name ?? '—', total: 0, feeTotal: 0, count: 0 }
    cur.total += Number(r.amount)
    cur.feeTotal += Number(r.fee_amount ?? 0)
    cur.count += 1
    grossTotal += Number(r.amount)
    feeTotal += Number(r.fee_amount ?? 0)
    map.set(r.payment_method_id, cur)
  }

  const rows = [...map.entries()]
    .map(([methodId, v]) => ({
      methodId,
      name: v.name,
      total: v.total,
      feeTotal: v.feeTotal,
      count: v.count,
      percent: grossTotal > 0 ? (v.total / grossTotal) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total)

  return { rows, grossTotal, feeTotal, netTotal: grossTotal - feeTotal }
}
