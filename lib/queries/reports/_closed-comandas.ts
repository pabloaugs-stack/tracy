import { createClient } from '@/lib/supabase/server'
import { tsBounds, type ResolvedPeriod } from '@/lib/reports/period'
import { comandaFinalTotal } from '@/lib/reports/total'

export type ClosedComandaProf = {
  user_id: string
  role_in_appointment: 'trancista' | 'auxiliar'
  commission_override: number | null
  user: { name: string }
}
export type ClosedComandaProduct = {
  quantity: number
  unit_price: number
  sold_by_user_id: string | null
  commission_percent_snapshot: number | null
}
export type ClosedComanda = {
  id: string
  total_price: number
  discount_type: string | null
  discount_value: number | null
  total_override: number | null
  closed_at: string
  service: { id: string; name: string; category_id: string; commission_default_trancista: number | null; commission_default_auxiliar: number | null } | null
  professionals: ClosedComandaProf[]
  products: ClosedComandaProduct[]
  productsTotal: number
  finalTotal: number
}

// Comandas FECHADAS (closed_at não nulo) no período (por closed_at), com serviço, profissionais e produtos ativos.
export async function getClosedComandas(salonId: string, period: ResolvedPeriod): Promise<ClosedComanda[]> {
  const supabase = await createClient()
  const { startTs, endTs } = tsBounds(period)

  const { data, error } = await supabase
    .from('appointments')
    .select(`
      id, total_price, discount_type, discount_value, total_override, closed_at,
      service:services!appointments_service_id_fkey(id, name, category_id, commission_default_trancista, commission_default_auxiliar),
      professionals:appointment_professionals!appointment_professionals_appointment_id_fkey(
        user_id, role_in_appointment, commission_override,
        user:users!appointment_professionals_user_id_fkey(name)
      ),
      products:appointment_products!appointment_products_appointment_id_fkey(quantity, unit_price, sold_by_user_id, commission_percent_snapshot, active)
    `)
    .eq('salon_id', salonId)
    .not('closed_at', 'is', null)
    .gte('closed_at', startTs)
    .lt('closed_at', endTs)
    .order('closed_at', { ascending: true })

  if (error) throw error

  type RawProduct = ClosedComandaProduct & { active: boolean }
  type Raw = {
    id: string
    total_price: number
    discount_type: string | null
    discount_value: number | null
    total_override: number | null
    closed_at: string
    service: ClosedComanda['service']
    professionals: ClosedComandaProf[]
    products: RawProduct[]
  }
  return ((data ?? []) as unknown as Raw[]).map((c) => {
    const activeProducts: ClosedComandaProduct[] = (c.products ?? []).filter((p) => p.active)
    const productsTotal = activeProducts.reduce((s, p) => s + p.quantity * Number(p.unit_price), 0)
    const finalTotal = comandaFinalTotal(c.total_price, c.discount_type, c.discount_value, c.total_override, productsTotal)
    return { ...c, products: activeProducts, productsTotal, finalTotal }
  })
}
