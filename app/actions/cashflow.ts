"use server"

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionProfile } from '@/lib/auth/session'
import { canViewFinancial } from '@/lib/financial/access'
import { brazilToday } from '@/lib/reports/period'
import type { InventoryPurchasePaymentInsert } from '@/lib/types/database'

export type CashflowActionResult = { success: true } | { error: string }

// Gate de operações de compra/parcela: dono/gerente (espelha a RLS de inventory_purchases/_payments).
function canManageInventory(profile: { role: string }): boolean {
  return profile.role === 'dono' || profile.role === 'gerente'
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// ── Saldo inicial do Caixa (salon_settings.opening_balance / opening_balance_date) ──
// Gate = can_view_financial (dono sempre; outros com a flag). A RLS de UPDATE em salon_settings é
// dono/gerente-only, então o write vai pelo admin client (o gate de código é o guarda real) — mesmo
// padrão já usado em outros pontos onde a RLS bloquearia um caminho já validado em código.
export async function updateOpeningBalanceAction(formData: FormData): Promise<CashflowActionResult> {
  const profile = await getSessionProfile()
  if (!canViewFinancial(profile)) return { error: 'Sem permissão.' }

  const balanceRaw = (formData.get('opening_balance') as string | null)?.trim().replace(',', '.')
  const opening_balance = balanceRaw ? parseFloat(balanceRaw) : 0
  if (!Number.isFinite(opening_balance) || opening_balance < 0)
    return { error: 'Saldo inicial não pode ser negativo.' }

  const dateRaw = (formData.get('opening_balance_date') as string | null)?.trim()
  let opening_balance_date: string | null = null
  if (dateRaw) {
    if (!DATE_RE.test(dateRaw)) return { error: 'Data de início inválida.' }
    if (dateRaw > brazilToday()) return { error: 'A data de início não pode ser futura.' }
    opening_balance_date = dateRaw
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('salon_settings')
    .update({
      opening_balance: Math.round(opening_balance * 100) / 100,
      opening_balance_date,
      updated_at: new Date().toISOString(),
    })
    .eq('salon_id', profile.salon_id)
  if (error) return { error: error.message }

  revalidatePath('/admin/financeiro')
  revalidatePath('/admin/configuracoes')
  return { success: true }
}

// ── Parcelas de pagamento de uma compra (inventory_purchase_payments) ──
// Divide o total_cost da compra em N parcelas independentes. Σ das parcelas DEVE igualar o total_cost
// (tolerância R$ 0,01). Nasce tudo 'pendente'; marcar pago é passo separado. Gate dono/gerente; RLS real.
export async function createPurchasePaymentsAction(formData: FormData): Promise<CashflowActionResult> {
  const profile = await getSessionProfile()
  if (!canManageInventory(profile)) return { error: 'Sem permissão.' }

  const purchaseId = (formData.get('purchase_id') as string | null)?.trim()
  if (!purchaseId) return { error: 'Compra inválida.' }

  const supabase = await createClient()
  const { data: purchase } = await supabase
    .from('inventory_purchases')
    .select('id, total_cost')
    .eq('id', purchaseId)
    .eq('salon_id', profile.salon_id)
    .maybeSingle()
  if (!purchase) return { error: 'Compra não encontrada.' }

  const count = parseInt((formData.get('pay_count') as string | null) ?? '0', 10)
  if (!Number.isInteger(count) || count < 1) return { error: 'Informe ao menos uma parcela.' }

  // Formas de pagamento válidas do salão (para validar payment_method_id opcional).
  const { data: methods } = await supabase
    .from('payment_methods')
    .select('id')
    .eq('salon_id', profile.salon_id)
  const validMethodIds = new Set((methods ?? []).map((m) => m.id))

  const rows: InventoryPurchasePaymentInsert[] = []
  let sum = 0
  let prevDue = ''

  for (let i = 0; i < count; i++) {
    const amtRaw = (formData.get(`pay_amount_${i}`) as string | null)?.trim().replace(',', '.')
    const amount = amtRaw ? parseFloat(amtRaw) : NaN
    if (!Number.isFinite(amount) || amount <= 0) return { error: 'Cada parcela deve ter valor maior que zero.' }

    const due = (formData.get(`pay_due_date_${i}`) as string | null)?.trim()
    if (!due || !DATE_RE.test(due)) return { error: 'Data de vencimento inválida em uma das parcelas.' }
    // Vencimentos em ordem crescente quando há mais de uma parcela.
    if (count > 1 && prevDue && due < prevDue)
      return { error: 'Os vencimentos das parcelas devem estar em ordem crescente.' }
    prevDue = due

    const methodRaw = (formData.get(`pay_method_${i}`) as string | null)?.trim() || null
    if (methodRaw && !validMethodIds.has(methodRaw)) return { error: 'Forma de pagamento inválida.' }

    const notes = (formData.get(`pay_notes_${i}`) as string | null)?.trim() || null

    sum += amount
    rows.push({
      salon_id: profile.salon_id,
      purchase_id: purchaseId,
      payment_method_id: methodRaw,
      amount: Math.round(amount * 100) / 100,
      due_date: due,
      status: 'pendente',
      paid_at: null,
      installment_number: i + 1,
      installment_total: count,
      notes,
    })
  }

  // Σ das parcelas deve bater com o total da nota (tolerância R$ 0,01).
  if (Math.abs(Math.round(sum * 100) / 100 - Number(purchase.total_cost)) > 0.01)
    return { error: 'A soma das parcelas deve ser igual ao total da compra.' }

  const { error: insErr } = await supabase.from('inventory_purchase_payments').insert(rows)
  if (insErr) return { error: insErr.message }

  // A partir daqui a compra deixa de ser "à vista" legada: status reflete as parcelas (todas pendentes).
  await syncPurchaseStatus(purchaseId, profile.salon_id)

  revalidatePath('/admin/estoque')
  revalidatePath('/admin/financeiro')
  return { success: true }
}

// ── Marcar uma parcela como paga ──
export async function markPurchasePaymentPaidAction(
  paymentId: string,
  paidAt?: string
): Promise<CashflowActionResult> {
  const profile = await getSessionProfile()
  if (!canManageInventory(profile)) return { error: 'Sem permissão.' }

  const today = brazilToday()
  const paid_at = paidAt && DATE_RE.test(paidAt) ? paidAt : today
  if (paid_at > today) return { error: 'A data de pagamento não pode ser futura.' }

  const supabase = await createClient()
  // Confirma que a parcela é do salão e recupera a compra para sincronizar o status.
  const { data: payment } = await supabase
    .from('inventory_purchase_payments')
    .select('id, purchase_id')
    .eq('id', paymentId)
    .eq('salon_id', profile.salon_id)
    .maybeSingle()
  if (!payment) return { error: 'Parcela não encontrada.' }

  const { error } = await supabase
    .from('inventory_purchase_payments')
    .update({ status: 'pago', paid_at, updated_at: new Date().toISOString() })
    .eq('id', paymentId)
    .eq('salon_id', profile.salon_id)
  if (error) return { error: error.message }

  await syncPurchaseStatus(payment.purchase_id, profile.salon_id)

  revalidatePath('/admin/estoque')
  revalidatePath('/admin/financeiro')
  return { success: true }
}

// Recalcula inventory_purchases.status a partir das parcelas: 'pago' se todas as parcelas estão pagas,
// senão 'pendente'. Sem parcelas mantém o legado ('pago' à vista).
async function syncPurchaseStatus(purchaseId: string, salonId: string): Promise<void> {
  const supabase = await createClient()
  const { data: payments } = await supabase
    .from('inventory_purchase_payments')
    .select('status')
    .eq('purchase_id', purchaseId)
    .eq('salon_id', salonId)
  const rows = payments ?? []
  if (rows.length === 0) return
  const allPaid = rows.every((p) => p.status === 'pago')
  await supabase
    .from('inventory_purchases')
    .update({ status: allPaid ? 'pago' : 'pendente', updated_at: new Date().toISOString() })
    .eq('id', purchaseId)
    .eq('salon_id', salonId)
}
