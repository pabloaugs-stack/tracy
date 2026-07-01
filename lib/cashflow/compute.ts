// Lógica PURA do Caixa (Sprint 7 / Fatia 4) — sem IO, testável isolada.
// A camada de query (lib/queries/cashflow.ts) faz os fetches e delega toda a montagem/ordenação/
// acúmulo aqui. O script de teste alimenta os mesmos dados crus e chama estas funções — exercendo a
// mesma matemática do saldo que a aplicação usa.

import { formatAppointmentNumber } from '@/lib/appointments/format'

export type CashflowCategory = 'comanda' | 'aporte' | 'despesa' | 'retirada' | 'comissao' | 'compra'
export type CashflowType = 'entrada' | 'saida'

export type CashflowEntry = {
  id: string
  date: string
  type: CashflowType
  category: CashflowCategory
  label: string
  amount: number
  running_balance: number
  source_type: 'appointment_payment' | 'financial_entry' | 'commission_payment' | 'purchase_payment'
  source_id: string
}

export type CashflowPreviewEntry = {
  id: string
  due_date: string
  type: 'saida'
  category: 'despesa' | 'comissao_futura' | 'compra'
  label: string
  amount: number
}

export type CashflowFilters = {
  start?: string
  end?: string
  type?: CashflowType
  category?: CashflowCategory
}

export type CashflowSummary = {
  total_entradas: number
  total_saidas: number
  saldo_periodo: number
  saldo_atual: number
  opening_balance: number
  opening_balance_date: string | null
}

// Movimento cru (sem running_balance) — a unidade antes de ordenar/acumular.
export type RawMovement = Omit<CashflowEntry, 'running_balance'> & { created_at: string }

// Linhas cruas de cada fonte (formato agnóstico de IO — a query mapeia o Supabase para isto).
export type ApRow = { id: string; amount: number; paid_at: string; payment_type: string; created_at: string; appointment_number: number | null }
export type FeRow = { id: string; amount: number; paid_at: string; kind: 'aporte' | 'despesa' | 'retirada'; description: string | null; created_at: string }
export type CpRow = { id: string; total_amount: number; paid_at: string; created_at: string; professional_name: string | null }
export type PpRow = { id: string; amount: number; paid_at: string; installment_number: number; installment_total: number; created_at: string; purchase_notes: string | null; purchase_date: string | null }

export type FePreviewRow = { id: string; amount: number; due_date: string; kind: 'despesa' | 'retirada'; description: string | null }
export type PpPreviewRow = { id: string; amount: number; due_date: string; installment_number: number; installment_total: number; purchase_notes: string | null; purchase_date: string | null }
export type CePreviewRow = { id: string; total_commission: number; created_at: string; professional_name: string | null }

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function paymentTypeLabel(t: string): string {
  return t === 'sinal' ? 'sinal' : 'pgto. final'
}

// dateStr + N dias (aritmética UTC pura).
export function shiftDate(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + deltaDays)).toISOString().slice(0, 10)
}

// Monta as movimentações a partir das 4 fontes cruas. commissionRanges = min/max das comandas cobertas
// por cada pagamento de comissão (para o rótulo).
export function assembleMovements(inputs: {
  ap: ApRow[]
  fe: FeRow[]
  cp: CpRow[]
  pp: PpRow[]
  commissionRanges: Map<string, { min: string; max: string }>
}): RawMovement[] {
  const out: RawMovement[] = []

  for (const r of inputs.ap) {
    out.push({
      id: `ap_${r.id}`,
      date: r.paid_at,
      type: 'entrada',
      category: 'comanda',
      label: `Comanda ${formatAppointmentNumber(r.appointment_number)} · ${paymentTypeLabel(r.payment_type)}`,
      amount: round2(Number(r.amount)),
      source_type: 'appointment_payment',
      source_id: r.id,
      created_at: r.created_at,
    })
  }

  for (const r of inputs.fe) {
    const isEntrada = r.kind === 'aporte'
    const kindLabel = r.kind === 'aporte' ? 'Aporte' : r.kind === 'despesa' ? 'Despesa' : 'Retirada'
    out.push({
      id: `fe_${r.id}`,
      date: r.paid_at,
      type: isEntrada ? 'entrada' : 'saida',
      category: r.kind,
      label: r.description ? `${kindLabel} · ${r.description}` : kindLabel,
      amount: round2(Number(r.amount)),
      source_type: 'financial_entry',
      source_id: r.id,
      created_at: r.created_at,
    })
  }

  for (const r of inputs.cp) {
    const range = inputs.commissionRanges.get(r.id)
    const suffix = range ? ` · ${range.min}–${range.max}` : ''
    out.push({
      id: `cp_${r.id}`,
      date: r.paid_at,
      type: 'saida',
      category: 'comissao',
      label: `Comissão · ${r.professional_name ?? '—'}${suffix}`,
      amount: round2(Number(r.total_amount)),
      source_type: 'commission_payment',
      source_id: r.id,
      created_at: r.created_at,
    })
  }

  for (const r of inputs.pp) {
    const desc = r.purchase_notes?.trim() || r.purchase_date || 'compra'
    out.push({
      id: `pp_${r.id}`,
      date: r.paid_at,
      type: 'saida',
      category: 'compra',
      label: `Compra · ${desc} · Parcela ${r.installment_number}/${r.installment_total}`,
      amount: round2(Number(r.amount)),
      source_type: 'purchase_payment',
      source_id: r.id,
      created_at: r.created_at,
    })
  }

  return out
}

// Ordena cronologicamente (date asc, created_at asc como desempate) e acumula o saldo corrente a
// partir do opening_balance. Retorna a lista COMPLETA com running_balance correto em cada linha.
export function buildRunningBalance(movements: RawMovement[], openingBalance: number): CashflowEntry[] {
  const sorted = [...movements].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0
  })
  let balance = openingBalance
  return sorted.map((m) => {
    balance = round2(balance + (m.type === 'entrada' ? m.amount : -m.amount))
    const { created_at: _created, ...rest } = m
    void _created
    return { ...rest, running_balance: balance }
  })
}

// Filtro de exibição: período (start..end), tipo e categoria. O saldo já foi acumulado sobre o total.
export function filterForDisplay(entries: CashflowEntry[], filters: CashflowFilters): CashflowEntry[] {
  return entries.filter((e) => {
    if (filters.start && e.date < filters.start) return false
    if (filters.end && e.date > filters.end) return false
    if (filters.type && e.type !== filters.type) return false
    if (filters.category && e.category !== filters.category) return false
    return true
  })
}

// Totais do período + saldo acumulado atual (saldo sobre TODAS as movimentações fornecidas).
export function summarize(
  movements: RawMovement[],
  openingBalance: number,
  openingBalanceDate: string | null,
  filters: CashflowFilters
): CashflowSummary {
  let saldoAtual = openingBalance
  let totalEntradas = 0
  let totalSaidas = 0
  for (const m of movements) {
    saldoAtual = round2(saldoAtual + (m.type === 'entrada' ? m.amount : -m.amount))
    const inStart = !filters.start || m.date >= filters.start
    const inEnd = !filters.end || m.date <= filters.end
    if (inStart && inEnd) {
      if (m.type === 'entrada') totalEntradas = round2(totalEntradas + m.amount)
      else totalSaidas = round2(totalSaidas + m.amount)
    }
  }
  return {
    total_entradas: totalEntradas,
    total_saidas: totalSaidas,
    saldo_periodo: round2(totalEntradas - totalSaidas),
    saldo_atual: saldoAtual,
    opening_balance: openingBalance,
    opening_balance_date: openingBalanceDate,
  }
}

// Monta a previsão de saídas futuras a partir das fontes pendentes. Ordenada por due_date.
export function assemblePreview(inputs: {
  fe: FePreviewRow[]
  pp: PpPreviewRow[]
  ce: CePreviewRow[]
}): CashflowPreviewEntry[] {
  const out: CashflowPreviewEntry[] = []

  for (const r of inputs.fe) {
    const kindLabel = r.kind === 'despesa' ? 'Despesa' : 'Retirada'
    out.push({
      id: `fe_${r.id}`,
      due_date: r.due_date,
      type: 'saida',
      category: 'despesa',
      label: r.description ? `${kindLabel} · ${r.description}` : kindLabel,
      amount: round2(Number(r.amount)),
    })
  }

  for (const r of inputs.pp) {
    const desc = r.purchase_notes?.trim() || r.purchase_date || 'compra'
    out.push({
      id: `pp_${r.id}`,
      due_date: r.due_date,
      type: 'saida',
      category: 'compra',
      label: `Compra · ${desc} · Parcela ${r.installment_number}/${r.installment_total}`,
      amount: round2(Number(r.amount)),
    })
  }

  for (const r of inputs.ce) {
    out.push({
      id: `ce_${r.id}`,
      due_date: r.created_at.slice(0, 10),
      type: 'saida',
      category: 'comissao_futura',
      label: `Comissão · ${r.professional_name ?? '—'} (estimativa)`,
      amount: round2(Number(r.total_commission)),
    })
  }

  return out.sort((a, b) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0))
}
