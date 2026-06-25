import { createClient } from '@/lib/supabase/server'
import { tsBounds, type ResolvedPeriod } from '@/lib/reports/period'

export type ProductRankRow = {
  productId: string
  name: string
  qty: number
  revenue: number
}

// Relatório 4: ranking de produtos. Lê appointment_products ativos de comandas FECHADAS no período.
export async function getProductsRanking(salonId: string, period: ResolvedPeriod): Promise<ProductRankRow[]> {
  const supabase = await createClient()
  const { startTs, endTs } = tsBounds(period)

  const { data, error } = await supabase
    .from('appointment_products')
    .select(`
      quantity, unit_price, product_id,
      product:products!appointment_products_product_id_fkey(name),
      appointment:appointments!appointment_products_appointment_id_fkey!inner(salon_id, closed_at)
    `)
    .eq('active', true)
    .eq('appointment.salon_id', salonId)
    .not('appointment.closed_at', 'is', null)
    .gte('appointment.closed_at', startTs)
    .lt('appointment.closed_at', endTs)

  if (error) throw error

  type Raw = { quantity: number; unit_price: number; product_id: string; product: { name: string } | null }
  const map = new Map<string, { name: string; qty: number; revenue: number }>()
  for (const r of (data ?? []) as unknown as Raw[]) {
    const cur = map.get(r.product_id) ?? { name: r.product?.name ?? '—', qty: 0, revenue: 0 }
    cur.qty += r.quantity
    cur.revenue += r.quantity * Number(r.unit_price)
    map.set(r.product_id, cur)
  }

  return [...map.entries()]
    .map(([productId, v]) => ({ productId, name: v.name, qty: v.qty, revenue: v.revenue }))
    .sort((a, b) => b.qty - a.qty)
}
