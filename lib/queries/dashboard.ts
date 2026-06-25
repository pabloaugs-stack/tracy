import { createClient } from '@/lib/supabase/server'
import { getRevenueByMonth } from '@/lib/queries/reports/revenue-by-month'
import { getClosedComandas } from '@/lib/queries/reports/_closed-comandas'
import { resolvePeriod, brazilToday } from '@/lib/reports/period'
import { comandaFinalTotal } from '@/lib/reports/total'
import type { AppointmentStatus } from '@/lib/types/database'

export interface DashboardMetrics {
  hoje: {
    faturamento: number
    atendimentosTotal: number
    atendimentosPorStatus: Record<AppointmentStatus, number>
    comandasAbertas: number
  }
  mes: {
    faturamento: number
    atendimentosConcluidos: number
    atendimentosSemana: number
    ticketMedio: number
  }
  previstoProximos7Dias: number
}

// YYYY-MM-DD deslocado por N dias (aritmética UTC pura, independe do fuso do servidor).
function shift(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + deltaDays)).toISOString().slice(0, 10)
}

// Semana corrente segunda→domingo (no fuso de Brasília), como ResolvedPeriod inclusivo.
function weekBounds(today: string): { start: string; end: string } {
  const [y, m, d] = today.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0=domingo … 6=sábado
  const sinceMonday = (dow + 6) % 7 // 0 quando é segunda
  return { start: shift(today, -sinceMonday), end: shift(today, 6 - sinceMonday) }
}

const EMPTY_STATUS: Record<AppointmentStatus, number> = {
  agendado: 0, em_andamento: 0, concluido: 0, cancelado: 0, nao_compareceu: 0,
}

// Métricas do dashboard do dono/gerente. Reaproveita as queries de relatórios (Sprint 6) sempre
// que possível — faturamento sai do mesmo getRevenueByMonth (por paid_at), atendimentos concluídos
// saem do mesmo getClosedComandas (por closed_at).
export async function getDashboardMetrics(salonId: string): Promise<DashboardMetrics> {
  const supabase = await createClient()
  const today = brazilToday()
  const mesAtual = resolvePeriod('mes_atual')
  const semana = weekBounds(today)

  // Limites timestamptz do dia de hoje e da janela de previsão (próximos 7 dias, incluindo hoje).
  const todayStartTs = `${today}T00:00:00-03:00`
  const tomorrowStartTs = `${shift(today, 1)}T00:00:00-03:00`
  const forecastEndTs = `${shift(today, 8)}T00:00:00-03:00` // hoje .. hoje+7 inclusive

  const [
    faturamentoHojeRows,
    faturamentoMesRows,
    apptsHoje,
    concluidosMes,
    concluidosSemana,
    previstoComandas,
  ] = await Promise.all([
    getRevenueByMonth(salonId, { start: today, end: today }),
    getRevenueByMonth(salonId, mesAtual),
    supabase
      .from('appointments')
      .select('status, closed_at')
      .eq('salon_id', salonId)
      .gte('scheduled_at', todayStartTs)
      .lt('scheduled_at', tomorrowStartTs),
    getClosedComandas(salonId, mesAtual),
    getClosedComandas(salonId, semana),
    supabase
      .from('appointments')
      .select(`
        total_price, discount_type, discount_value, total_override,
        products:appointment_products!appointment_products_appointment_id_fkey(quantity, unit_price, active)
      `)
      .eq('salon_id', salonId)
      .in('status', ['agendado', 'em_andamento'])
      .gte('scheduled_at', todayStartTs)
      .lt('scheduled_at', forecastEndTs),
  ])

  if (apptsHoje.error) throw apptsHoje.error
  if (previstoComandas.error) throw previstoComandas.error

  const faturamentoHoje = faturamentoHojeRows.reduce((s, r) => s + r.total, 0)
  const faturamentoMes = faturamentoMesRows.reduce((s, r) => s + r.total, 0)

  const atendimentosPorStatus = { ...EMPTY_STATUS }
  let comandasAbertas = 0
  for (const a of apptsHoje.data ?? []) {
    const st = a.status as AppointmentStatus
    atendimentosPorStatus[st] = (atendimentosPorStatus[st] ?? 0) + 1
    // "Abertas agora": não fechada e ainda em jogo (exclui canceladas e não-compareceu).
    if (a.closed_at === null && st !== 'cancelado' && st !== 'nao_compareceu') comandasAbertas++
  }
  const atendimentosTotal = (apptsHoje.data ?? []).length

  const atendimentosConcluidosMes = concluidosMes.length
  const ticketMedio = atendimentosConcluidosMes > 0 ? faturamentoMes / atendimentosConcluidosMes : 0

  // Previsão: mesma fórmula de total da comanda (computeFinalTotal) — desconto e override aplicados;
  // produtos ativos somados. É PREVISÃO (comandas ainda não fechadas), exibida com label próprio na UI.
  type RawProduct = { quantity: number; unit_price: number; active: boolean }
  type RawComanda = {
    total_price: number; discount_type: string | null; discount_value: number | null
    total_override: number | null; products: RawProduct[]
  }
  const previstoProximos7Dias = ((previstoComandas.data ?? []) as unknown as RawComanda[]).reduce((sum, c) => {
    const productsTotal = (c.products ?? []).filter((p) => p.active).reduce((s, p) => s + p.quantity * Number(p.unit_price), 0)
    return sum + comandaFinalTotal(c.total_price, c.discount_type, c.discount_value, c.total_override, productsTotal)
  }, 0)

  return {
    hoje: { faturamento: faturamentoHoje, atendimentosTotal, atendimentosPorStatus, comandasAbertas },
    mes: {
      faturamento: faturamentoMes,
      atendimentosConcluidos: atendimentosConcluidosMes,
      atendimentosSemana: concluidosSemana.length,
      ticketMedio,
    },
    previstoProximos7Dias,
  }
}
