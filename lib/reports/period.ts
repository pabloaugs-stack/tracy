// Resolução de período para relatórios. Tudo no fuso de Brasília.
export type PeriodKey = 'hoje' | '7d' | '30d' | 'mes_atual' | 'mes_anterior' | '12m' | 'custom'

export interface ResolvedPeriod {
  start: string // YYYY-MM-DD inclusivo
  end: string // YYYY-MM-DD inclusivo
}

export function brazilToday(): string {
  return new Intl.DateTimeFormat('sv', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

function shift(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const nd = new Date(Date.UTC(y, m - 1, d + deltaDays))
  return nd.toISOString().slice(0, 10)
}

function monthBounds(year: number, monthIndex0: number): ResolvedPeriod {
  const first = new Date(Date.UTC(year, monthIndex0, 1))
  const last = new Date(Date.UTC(year, monthIndex0 + 1, 0))
  return { start: first.toISOString().slice(0, 10), end: last.toISOString().slice(0, 10) }
}

export function resolvePeriod(key: PeriodKey, customStart?: string, customEnd?: string): ResolvedPeriod {
  const today = brazilToday()
  const [y, m] = today.split('-').map(Number)
  switch (key) {
    case 'hoje':
      return { start: today, end: today }
    case '7d':
      return { start: shift(today, -6), end: today }
    case '30d':
      return { start: shift(today, -29), end: today }
    case 'mes_atual':
      return monthBounds(y, m - 1)
    case 'mes_anterior':
      return monthBounds(m === 1 ? y - 1 : y, m === 1 ? 11 : m - 2)
    case '12m': {
      // Início = primeiro dia do mês, 11 meses atrás (Date.UTC ajusta o ano se o índice for negativo).
      const startDate = new Date(Date.UTC(y, m - 1 - 11, 1))
      return { start: startDate.toISOString().slice(0, 10), end: today }
    }
    case 'custom':
      return { start: customStart || today, end: customEnd || today }
    default:
      return { start: today, end: today }
  }
}

// Limites timestamptz [início, fim_exclusivo) no fuso de Brasília — para colunas timestamptz.
export function tsBounds(p: ResolvedPeriod): { startTs: string; endTs: string } {
  return {
    startTs: `${p.start}T00:00:00-03:00`,
    endTs: `${shift(p.end, 1)}T00:00:00-03:00`,
  }
}

const VALID_KEYS: PeriodKey[] = ['hoje', '7d', '30d', 'mes_atual', 'mes_anterior', '12m', 'custom']

// Lê period/start/end dos searchParams e resolve. `defaultKey` quando ausente/ inválido.
export function parsePeriod(
  sp: { period?: string; start?: string; end?: string },
  defaultKey: PeriodKey = '30d'
): { key: PeriodKey; start?: string; end?: string; resolved: ResolvedPeriod } {
  const key = (VALID_KEYS.includes(sp.period as PeriodKey) ? (sp.period as PeriodKey) : defaultKey)
  const resolved = resolvePeriod(key, sp.start, sp.end)
  return { key, start: sp.start, end: sp.end, resolved }
}

export const PERIOD_LABELS: Record<Exclude<PeriodKey, 'custom'>, string> = {
  hoje: 'Hoje',
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  mes_atual: 'Mês atual',
  mes_anterior: 'Mês anterior',
  '12m': 'Últimos 12 meses',
}
