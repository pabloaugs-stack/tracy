import { createClient } from '@/lib/supabase/server'
import { tsBounds, brazilToday, type ResolvedPeriod } from '@/lib/reports/period'

export type ClientReturnRow = {
  clientId: string
  name: string
  lastVisit: string // YYYY-MM-DD
  daysSince: number
  avgIntervalDays: number | null
  visitCount: number
}

function brDate(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
}
function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000)
}

// Relatório 8: retorno de cliente. Visitas = comandas concluídas no período.
// Filtro minDays: só clientes que não retornam há mais de X dias. Ordena por dias desde a última desc.
export async function getClientReturn(
  salonId: string,
  period: ResolvedPeriod,
  minDays = 60
): Promise<ClientReturnRow[]> {
  const supabase = await createClient()
  const { startTs, endTs } = tsBounds(period)

  const { data, error } = await supabase
    .from('appointments')
    .select(`
      scheduled_at, client_id,
      client:clients!appointments_client_id_fkey(name)
    `)
    .eq('salon_id', salonId)
    .eq('status', 'concluido')
    .gte('scheduled_at', startTs)
    .lt('scheduled_at', endTs)
    .order('scheduled_at', { ascending: true })

  if (error) throw error

  type Raw = { scheduled_at: string; client_id: string; client: { name: string } | null }
  const map = new Map<string, { name: string; dates: string[] }>()
  for (const r of (data ?? []) as unknown as Raw[]) {
    const cur = map.get(r.client_id) ?? { name: r.client?.name ?? '—', dates: [] }
    cur.dates.push(brDate(r.scheduled_at))
    map.set(r.client_id, cur)
  }

  const today = brazilToday()
  const rows: ClientReturnRow[] = []
  for (const [clientId, v] of map.entries()) {
    const dates = v.dates.sort()
    const lastVisit = dates[dates.length - 1]
    const daysSince = daysBetween(lastVisit, today)
    let avgIntervalDays: number | null = null
    if (dates.length >= 2) {
      let sum = 0
      for (let i = 1; i < dates.length; i++) sum += daysBetween(dates[i - 1], dates[i])
      avgIntervalDays = Math.round(sum / (dates.length - 1))
    }
    rows.push({ clientId, name: v.name, lastVisit, daysSince, avgIntervalDays, visitCount: dates.length })
  }

  return rows.filter((r) => r.daysSince > minDays).sort((a, b) => b.daysSince - a.daysSince)
}
