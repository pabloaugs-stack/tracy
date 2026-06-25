import { getClosedComandas } from './_closed-comandas'
import type { ResolvedPeriod } from '@/lib/reports/period'

export type ProfessionalRevenueRow = {
  userId: string
  name: string
  count: number
  revenue: number
  avgTicket: number
}

// Relatório 2: atendimentos por profissional + ticket médio (comandas fechadas no período).
// Cada comanda credita todas as profissionais alocadas. Ordena por ticket médio desc.
export async function getRevenueByProfessional(
  salonId: string,
  period: ResolvedPeriod
): Promise<ProfessionalRevenueRow[]> {
  const comandas = await getClosedComandas(salonId, period)
  const map = new Map<string, { name: string; count: number; revenue: number }>()

  for (const c of comandas) {
    for (const p of c.professionals) {
      const cur = map.get(p.user_id) ?? { name: p.user.name, count: 0, revenue: 0 }
      cur.count += 1
      cur.revenue += c.finalTotal
      map.set(p.user_id, cur)
    }
  }

  return [...map.entries()]
    .map(([userId, v]) => ({
      userId,
      name: v.name,
      count: v.count,
      revenue: v.revenue,
      avgTicket: v.count > 0 ? v.revenue / v.count : 0,
    }))
    .sort((a, b) => b.avgTicket - a.avgTicket)
}
