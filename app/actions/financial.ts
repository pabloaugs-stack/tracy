"use server"

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { canViewFinancial } from '@/lib/financial/access'
import { brazilToday } from '@/lib/reports/period'
import { computeMissingDueDates } from '@/lib/financial/recurrence'
import type {
  FinancialEntryInsert,
  FinancialEntryKind,
  FinancialEntryType,
  FinancialExpenseCategory,
  FinancialRecurrence,
} from '@/lib/types/database'

export type FinancialActionState = { error: string } | undefined
export type FinancialActionResult = { success: true } | { error: string }

const VALID_KINDS: FinancialEntryKind[] = ['aporte', 'despesa', 'retirada']
const VALID_CATEGORIES: FinancialExpenseCategory[] = [
  'aluguel', 'salarios', 'agua_luz', 'manutencao', 'marketing', 'taxas_impostos', 'outro',
]
const VALID_RECURRENCES: FinancialRecurrence[] = ['nenhuma', 'mensal', 'quinzenal', 'semanal', 'anual']

// type é derivado da natureza econômica (kind): só aporte é entrada.
function typeForKind(kind: FinancialEntryKind): FinancialEntryType {
  return kind === 'aporte' ? 'entrada' : 'saida'
}

// Valida e monta o payload comum a criar/editar a partir do FormData. Retorna erro legível.
function parseEntryForm(formData: FormData):
  | { ok: true; data: Omit<FinancialEntryInsert, 'salon_id' | 'id'> }
  | { ok: false; error: string } {
  const kind = formData.get('kind') as FinancialEntryKind | null
  if (!kind || !VALID_KINDS.includes(kind)) return { ok: false, error: 'Tipo de lançamento inválido.' }

  const amountRaw = (formData.get('amount') as string | null)?.trim().replace(',', '.')
  const amount = amountRaw ? parseFloat(amountRaw) : NaN
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'Valor deve ser maior que zero.' }

  const due_date = (formData.get('due_date') as string | null)?.trim()
  if (!due_date || !/^\d{4}-\d{2}-\d{2}$/.test(due_date)) return { ok: false, error: 'Data de vencimento inválida.' }

  const descriptionRaw = (formData.get('description') as string | null)?.trim() || null

  // Categoria só vale para despesa (e é obrigatória nela).
  let category: FinancialExpenseCategory | null = null
  if (kind === 'despesa') {
    const cat = formData.get('category') as FinancialExpenseCategory | null
    if (!cat || !VALID_CATEGORIES.includes(cat)) return { ok: false, error: 'Selecione a categoria da despesa.' }
    category = cat
    if (cat === 'outro' && !descriptionRaw) return { ok: false, error: 'Descreva a despesa "Outro".' }
  }

  // Status / data de pagamento.
  const statusRaw = formData.get('status') as string | null
  const isPaid = statusRaw === 'pago'
  const today = brazilToday()
  let paid_at: string | null = null
  if (isPaid) {
    const pRaw = (formData.get('paid_at') as string | null)?.trim()
    paid_at = pRaw && /^\d{4}-\d{2}-\d{2}$/.test(pRaw) ? pRaw : today
    if (paid_at > today) return { ok: false, error: 'A data de pagamento não pode ser futura.' }
  }

  // Recorrência.
  const recurrence = (formData.get('recurrence') as FinancialRecurrence | null) ?? 'nenhuma'
  if (!VALID_RECURRENCES.includes(recurrence)) return { ok: false, error: 'Recorrência inválida.' }
  const is_recurring = recurrence !== 'nenhuma'
  // dia de vencimento = dia do due_date (informativo na UI; a geração avança a partir do due_date).
  const recurrence_day = is_recurring ? Number(due_date.slice(8, 10)) : null

  return {
    ok: true,
    data: {
      type: typeForKind(kind),
      kind,
      category,
      description: descriptionRaw,
      amount,
      status: isPaid ? 'pago' : 'pendente',
      due_date,
      paid_at,
      is_recurring,
      recurrence,
      recurrence_day,
    },
  }
}

export async function createFinancialEntryAction(
  prevState: FinancialActionState,
  formData: FormData
): Promise<FinancialActionState> {
  const profile = await getSessionProfile()
  if (!canViewFinancial(profile)) return { error: 'Sem permissão.' }

  const parsed = parseEntryForm(formData)
  if (!parsed.ok) return { error: parsed.error }

  const supabase = await createClient()
  const { error } = await supabase.from('financial_entries').insert({
    salon_id: profile.salon_id,
    ...parsed.data,
  })
  if (error) return { error: error.message }

  revalidatePath('/admin/financeiro')
  return undefined
}

export async function updateFinancialEntryAction(
  id: string,
  prevState: FinancialActionState,
  formData: FormData
): Promise<FinancialActionState> {
  const profile = await getSessionProfile()
  if (!canViewFinancial(profile)) return { error: 'Sem permissão.' }

  const parsed = parseEntryForm(formData)
  if (!parsed.ok) return { error: parsed.error }

  const supabase = await createClient()
  const { error } = await supabase
    .from('financial_entries')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('salon_id', profile.salon_id)
  if (error) return { error: error.message }

  revalidatePath('/admin/financeiro')
  return undefined
}

// Alterna pendente ↔ pago. Marcar pago grava paid_at (default hoje); voltar a pendente limpa.
export async function setFinancialEntryPaidAction(
  id: string,
  paid: boolean,
  paidAt?: string
): Promise<FinancialActionResult> {
  const profile = await getSessionProfile()
  if (!canViewFinancial(profile)) return { error: 'Sem permissão.' }

  const today = brazilToday()
  let paid_at: string | null = null
  if (paid) {
    paid_at = paidAt && /^\d{4}-\d{2}-\d{2}$/.test(paidAt) ? paidAt : today
    if (paid_at > today) return { error: 'A data de pagamento não pode ser futura.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('financial_entries')
    .update({ status: paid ? 'pago' : 'pendente', paid_at, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('salon_id', profile.salon_id)
  if (error) return { error: error.message }

  revalidatePath('/admin/financeiro')
  return { success: true }
}

// Soft delete (active = false). Em um lançamento recorrente "modelo", cancelar também interrompe
// a geração de novas ocorrências (a geração só considera modelos ativos). Histórico fica intacto.
export async function cancelFinancialEntryAction(id: string): Promise<FinancialActionResult> {
  const profile = await getSessionProfile()
  if (!canViewFinancial(profile)) return { error: 'Sem permissão.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('financial_entries')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('salon_id', profile.salon_id)
  if (error) return { error: error.message }

  revalidatePath('/admin/financeiro')
  return { success: true }
}

// Geração PREGUIÇOSA: chamada ao carregar a tela de Lançamentos. Para cada lançamento recorrente
// modelo ativo, materializa todas as ocorrências cuja data de vencimento já chegou e ainda não
// existem (pode haver várias atrasadas se o salão ficou dias sem abrir o sistema). Retorna quantas
// foram criadas. Idempotente: rodar duas vezes seguidas não duplica.
export async function generateDueRecurringEntries(salonId: string): Promise<number> {
  const supabase = await createClient()
  const today = brazilToday()

  const { data: models } = await supabase
    .from('financial_entries')
    .select('id, type, kind, category, description, amount, due_date, recurrence')
    .eq('salon_id', salonId)
    .eq('active', true)
    .eq('is_recurring', true)
    .is('parent_recurring_id', null)
    .neq('recurrence', 'nenhuma')

  if (!models || models.length === 0) return 0

  const toInsert: FinancialEntryInsert[] = []

  for (const model of models) {
    // Datas já materializadas: o próprio modelo + todos os filhos (inclui cancelados, para não
    // recriar uma ocorrência que o usuário apagou de propósito).
    const { data: children } = await supabase
      .from('financial_entries')
      .select('due_date')
      .eq('parent_recurring_id', model.id)

    const existing = [model.due_date, ...(children ?? []).map((c) => c.due_date)]
    const missing = computeMissingDueDates(model.due_date, model.recurrence, existing, today)

    for (const due of missing) {
      toInsert.push({
        salon_id: salonId,
        type: model.type,
        kind: model.kind,
        category: model.category,
        description: model.description,
        amount: model.amount,
        status: 'pendente',
        due_date: due,
        paid_at: null,
        is_recurring: false,
        recurrence: 'nenhuma',
        recurrence_day: null,
        parent_recurring_id: model.id,
      })
    }
  }

  if (toInsert.length === 0) return 0

  const { error } = await supabase.from('financial_entries').insert(toInsert)
  if (error) throw error
  return toInsert.length
}
