import { getClosedComandas } from './_closed-comandas'
import type { ResolvedPeriod } from '@/lib/reports/period'

export type CommissionRow = {
  userId: string
  name: string
  serviceCommission: number
  productCommission: number
  total: number
}

// Relatório 7: comissão por profissional (comandas fechadas no período).
// Serviço: (commission_override ?? padrão do serviço para o papel) % sobre total_price (valor do serviço).
// Produto: Σ commission_percent_snapshot % sobre o subtotal da linha onde sold_by_user_id = profissional.
export async function getCommissionByProfessional(
  salonId: string,
  period: ResolvedPeriod
): Promise<CommissionRow[]> {
  const comandas = await getClosedComandas(salonId, period)
  const map = new Map<string, { name: string; service: number; product: number }>()

  function ensure(userId: string, name: string) {
    const cur = map.get(userId) ?? { name, service: 0, product: 0 }
    if (name && !cur.name) cur.name = name
    map.set(userId, cur)
    return cur
  }

  for (const c of comandas) {
    const serviceValue = Number(c.total_price)
    for (const p of c.professionals) {
      const fallback =
        p.role_in_appointment === 'trancista'
          ? c.service?.commission_default_trancista ?? null
          : c.service?.commission_default_auxiliar ?? null
      const pct = p.commission_override != null ? Number(p.commission_override) : fallback != null ? Number(fallback) : 0
      const cur = ensure(p.user_id, p.user.name)
      cur.service += (pct / 100) * serviceValue
    }
    for (const prod of c.products) {
      if (!prod.sold_by_user_id) continue
      const pct = prod.commission_percent_snapshot != null ? Number(prod.commission_percent_snapshot) : 0
      if (pct === 0) continue
      const subtotal = prod.quantity * Number(prod.unit_price)
      const cur = ensure(prod.sold_by_user_id, map.get(prod.sold_by_user_id)?.name ?? '')
      cur.product += (pct / 100) * subtotal
    }
  }

  return [...map.entries()]
    .map(([userId, v]) => ({
      userId,
      name: v.name || '—',
      serviceCommission: v.service,
      productCommission: v.product,
      total: v.service + v.product,
    }))
    .sort((a, b) => b.total - a.total)
}
