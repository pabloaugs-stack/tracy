import { getClosedComandas } from './_closed-comandas'
import type { ResolvedPeriod } from '@/lib/reports/period'

export type ServiceRankRow = {
  serviceId: string
  name: string
  count: number
  revenue: number
}

// Relatório 3: ranking de serviços (comandas fechadas no período). Faturamento = base do serviço
// (total_price). Filtro de categoria opcional. Ordena por qtd desc.
export async function getServicesRanking(
  salonId: string,
  period: ResolvedPeriod,
  categoryId?: string
): Promise<ServiceRankRow[]> {
  const comandas = await getClosedComandas(salonId, period)
  const map = new Map<string, { name: string; count: number; revenue: number }>()

  for (const c of comandas) {
    if (!c.service) continue
    if (categoryId && c.service.category_id !== categoryId) continue
    const cur = map.get(c.service.id) ?? { name: c.service.name, count: 0, revenue: 0 }
    cur.count += 1
    cur.revenue += Number(c.total_price)
    map.set(c.service.id, cur)
  }

  return [...map.entries()]
    .map(([serviceId, v]) => ({ serviceId, name: v.name, count: v.count, revenue: v.revenue }))
    .sort((a, b) => b.count - a.count)
}
