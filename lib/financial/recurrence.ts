// Lógica pura de recorrência de lançamentos financeiros.
// Sem dependência de banco — testável isoladamente (scripts/test-financial-entries.ts).
import type { FinancialRecurrence } from '@/lib/types/database'

// Avança uma data (YYYY-MM-DD) pela frequência. Aritmética em UTC para não sofrer fuso.
// Mensal/anual preservam o dia de origem (clamp ao último dia do mês quando o dia não existe,
// ex: 31/jan + 1 mês = 28/29 fev), evitando drift cumulativo.
export function nextDueDate(dateStr: string, freq: FinancialRecurrence): string | null {
  if (freq === 'nenhuma') return null
  const [y, m, d] = dateStr.split('-').map(Number)
  if (freq === 'semanal') {
    return new Date(Date.UTC(y, m - 1, d + 7)).toISOString().slice(0, 10)
  }
  if (freq === 'quinzenal') {
    return new Date(Date.UTC(y, m - 1, d + 14)).toISOString().slice(0, 10)
  }
  // mensal / anual: soma de meses preservando o dia (com clamp).
  const monthsToAdd = freq === 'mensal' ? 1 : 12
  const targetMonthIndex = (m - 1) + monthsToAdd
  const targetYear = y + Math.floor(targetMonthIndex / 12)
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12
  const lastDayOfTarget = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  const day = Math.min(d, lastDayOfTarget)
  return new Date(Date.UTC(targetYear, targetMonth, day)).toISOString().slice(0, 10)
}

// Projeção PURAMENTE de leitura das próximas ocorrências FUTURAS de um modelo recorrente — usada
// para exibir "previsão" na UI. NÃO materializa nada no banco (diferente de computeMissingDueDates,
// que alimenta a geração real). Devolve apenas datas estritamente após `today`, até `horizon`
// (inclusive), no máximo `maxCount`, pulando as já existentes (modelo + filhos já gerados).
export function projectFutureOccurrences(
  modelDueDate: string,
  freq: FinancialRecurrence,
  existingDueDates: string[],
  today: string,
  horizon: string,
  maxCount = 6,
  maxIterations = 5000
): string[] {
  if (freq === 'nenhuma') return []
  const existing = new Set(existingDueDates)
  const out: string[] = []
  let cursor: string | null = modelDueDate
  let i = 0
  while (cursor && cursor <= horizon && out.length < maxCount && i < maxIterations) {
    if (cursor > today && !existing.has(cursor)) out.push(cursor)
    cursor = nextDueDate(cursor, freq)
    i++
  }
  return out
}

// Dado o lançamento "modelo" (primeira ocorrência, com due_date = modelDueDate) e a frequência,
// computa todas as datas de vencimento das ocorrências cuja data já chegou (<= today) e que
// ainda NÃO foram materializadas (não estão em existingDueDates, que inclui o próprio modelo e
// os filhos já gerados). Gera TODAS as ocorrências perdidas, não só a mais recente.
export function computeMissingDueDates(
  modelDueDate: string,
  freq: FinancialRecurrence,
  existingDueDates: string[],
  today: string,
  maxIterations = 1200
): string[] {
  if (freq === 'nenhuma') return []
  const existing = new Set(existingDueDates)
  const missing: string[] = []
  let cursor = nextDueDate(modelDueDate, freq)
  let i = 0
  while (cursor && cursor <= today && i < maxIterations) {
    if (!existing.has(cursor)) missing.push(cursor)
    cursor = nextDueDate(cursor, freq)
    i++
  }
  return missing
}
