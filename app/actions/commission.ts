"use server"

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionProfile } from '@/lib/auth/session'
import { canViewFinancial } from '@/lib/financial/access'
import { resolveCommissionPercent } from '@/lib/commission/resolve'
import { round2 } from '@/lib/payments/card-fee'
import type {
  CommissionType,
  RoleInAppointment,
  CommissionEntryInsert,
  CommissionEntryUpdate,
} from '@/lib/types/database'

function brazilToday(): string {
  return new Intl.DateTimeFormat('sv', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

// Base do cálculo de comissão de SERVIÇO. Produtos NUNCA entram nesta base (têm cálculo próprio).
// Sem desconto na base (default): valor cheio do serviço (total_price).
// Com desconto na base: valor do serviço após desconto (computeFinalTotal sem produtos).
function serviceCommissionBase(
  totalPrice: number,
  discountType: string | null,
  discountValue: number | null,
  totalOverride: number | null,
  discountAffectsCommission: boolean
): number {
  if (!discountAffectsCommission) return Number(totalPrice)
  if (totalOverride !== null) return Number(totalOverride)
  const base = Number(totalPrice)
  if (!discountType || discountValue === null) return base
  if (discountType === 'fixed') return Math.max(0, base - Number(discountValue))
  return Math.max(0, base * (1 - Number(discountValue) / 100))
}

// Accrual automático de comissão no fechamento da comanda. Para CADA profissional alocada, resolve
// o percentual (papel × tipo de comissão, com override gated) e grava/atualiza a commission_entry.
// Chamada DENTRO de closeAppointmentAction — NÃO é action de UI. Usa admin client (o fechamento já usa),
// então roda mesmo quando quem fecha não tem acesso ao Financeiro (dona solo / trancista alocada).
export async function resolveAndSaveCommissions(
  appointmentId: string,
  salonId: string,
  discountAffectsCommission: boolean,
  closingUserProfile: { role: string; can_edit_commission: boolean }
): Promise<void> {
  const admin = createAdminClient()

  // 1. Comanda (base de serviço + serviço para os padrões de categoria)
  const { data: appt } = await admin
    .from('appointments')
    .select('service_id, total_price, discount_type, discount_value, total_override')
    .eq('id', appointmentId)
    .eq('salon_id', salonId)
    .maybeSingle()
  if (!appt) return

  // 2. Profissionais da comanda
  const { data: profs } = await admin
    .from('appointment_professionals')
    .select('user_id, role_in_appointment, commission_override')
    .eq('appointment_id', appointmentId)
  if (!profs || profs.length === 0) return

  // Padrões de comissão do serviço (modalidade 'categoria')
  const { data: service } = await admin
    .from('services')
    .select('commission_default_trancista, commission_default_auxiliar')
    .eq('id', appt.service_id)
    .maybeSingle()

  // Configuração de comissão de cada profissional
  const userIds = [...new Set(profs.map((p) => p.user_id))]
  const { data: users } = await admin
    .from('users')
    .select('id, commission_type, commission_simple_percent, commission_solo_percent, commission_with_aux_percent, commission_as_aux_percent')
    .in('id', userIds)
  const userMap = new Map((users ?? []).map((u) => [u.id, u]))

  // Comissão de produto só entra se estiver ON no salão
  const { data: settings } = await admin
    .from('salon_settings')
    .select('product_commission_enabled')
    .eq('salon_id', salonId)
    .maybeSingle()
  const productCommissionOn = !!settings?.product_commission_enabled

  let products: { sold_by_user_id: string | null; quantity: number; unit_price: number; commission_percent_snapshot: number | null }[] = []
  if (productCommissionOn) {
    const { data: prods } = await admin
      .from('appointment_products')
      .select('sold_by_user_id, quantity, unit_price, commission_percent_snapshot')
      .eq('appointment_id', appointmentId)
      .eq('active', true)
    products = (prods ?? []) as typeof products
  }

  const base = serviceCommissionBase(
    appt.total_price,
    appt.discount_type,
    appt.discount_value,
    appt.total_override,
    discountAffectsCommission
  )
  const canUseOverride =
    closingUserProfile.role === 'dono' ||
    closingUserProfile.role === 'gerente' ||
    closingUserProfile.can_edit_commission
  const totalProfs = profs.length

  for (const p of profs) {
    const u = userMap.get(p.user_id)
    const commissionType = (u?.commission_type ?? 'categoria') as CommissionType
    const roleInAppointment = p.role_in_appointment as RoleInAppointment
    // Sozinha = trancista é a única profissional da comanda.
    const isSolo = roleInAppointment === 'trancista' && totalProfs === 1

    const { percent, roleResolved, overrideUsed } = resolveCommissionPercent({
      commissionType,
      roleInAppointment,
      isSolo,
      commissionSimplePercent: u?.commission_simple_percent ?? null,
      commissionSoloPercent: u?.commission_solo_percent ?? null,
      commissionWithAuxPercent: u?.commission_with_aux_percent ?? null,
      commissionAsAuxPercent: u?.commission_as_aux_percent ?? null,
      categoryDefaultTrancista: service?.commission_default_trancista ?? null,
      categoryDefaultAuxiliar: service?.commission_default_auxiliar ?? null,
      commissionOverride: p.commission_override,
      canUseOverride,
      commissionerProfile: closingUserProfile,
    })

    const serviceCommission = round2((base * percent) / 100)

    let productCommission = 0
    if (productCommissionOn) {
      for (const prod of products) {
        if (prod.sold_by_user_id !== p.user_id) continue
        const pct = prod.commission_percent_snapshot != null ? Number(prod.commission_percent_snapshot) : 0
        if (pct === 0) continue
        productCommission += round2((Number(prod.unit_price) * prod.quantity * pct) / 100)
      }
      productCommission = round2(productCommission)
    }

    const total = round2(serviceCommission + productCommission)

    // UPSERT pelo índice único (appointment_id, professional_id) WHERE active.
    const { data: existing } = await admin
      .from('commission_entries')
      .select('id, status')
      .eq('appointment_id', appointmentId)
      .eq('professional_id', p.user_id)
      .eq('active', true)
      .maybeSingle()

    if (existing) {
      const update: CommissionEntryUpdate = {
        service_commission: serviceCommission,
        product_commission: productCommission,
        total_commission: total,
        commission_percent_used: percent,
        role_resolved: roleResolved,
        override_used: overrideUsed,
        discount_applied: discountAffectsCommission,
        updated_at: new Date().toISOString(),
      }
      // Comanda reaberta cuja comissão já foi paga: refechar altera o valor → sinaliza divergência.
      if (existing.status === 'pago') update.has_divergence = true
      await admin.from('commission_entries').update(update).eq('id', existing.id)
    } else {
      const insert: CommissionEntryInsert = {
        salon_id: salonId,
        appointment_id: appointmentId,
        professional_id: p.user_id,
        service_commission: serviceCommission,
        product_commission: productCommission,
        total_commission: total,
        commission_percent_used: percent,
        role_resolved: roleResolved,
        override_used: overrideUsed,
        discount_applied: discountAffectsCommission,
        status: 'pendente',
        has_divergence: false,
      }
      await admin.from('commission_entries').insert(insert)
    }
  }
}

// Registra o pagamento de N pendências de comissão de UMA profissional (seleção livre).
// Cria commission_payment e marca as entradas selecionadas como 'pago'. Gate: canViewFinancial.
export async function registerCommissionPaymentAction(
  formData: FormData
): Promise<{ success: true } | { error: string }> {
  const profile = await getSessionProfile()
  if (!canViewFinancial(profile)) return { error: 'sem_permissao_financeiro' }

  const professional_id = (formData.get('professional_id') as string | null)?.trim()
  const entryIdsRaw = (formData.get('entry_ids') as string | null) ?? ''
  const entry_ids = entryIdsRaw.split(',').map((s) => s.trim()).filter(Boolean)
  const paid_at = (formData.get('paid_at') as string | null)?.trim() || brazilToday()
  const nfRaw = formData.get('nf_emitida')
  const nf_emitida = nfRaw === 'true' || nfRaw === 'on'
  const nf_number = (formData.get('nf_number') as string | null)?.trim() || null
  const notes = (formData.get('notes') as string | null)?.trim() || null

  if (!professional_id) return { error: 'profissional_obrigatorio' }
  if (entry_ids.length === 0) return { error: 'selecione_ao_menos_uma_pendencia' }
  if (paid_at > brazilToday()) return { error: 'data_futura_invalida' }

  const supabase = await createClient()

  // Verifica que todas as entradas pertencem ao salão + profissional, ativas e ainda pendentes.
  const { data: entries, error: fetchErr } = await supabase
    .from('commission_entries')
    .select('id, total_commission')
    .in('id', entry_ids)
    .eq('salon_id', profile.salon_id)
    .eq('professional_id', professional_id)
    .eq('active', true)
    .eq('status', 'pendente')
  if (fetchErr) return { error: fetchErr.message }
  if (!entries || entries.length !== entry_ids.length) return { error: 'pendencias_invalidas' }

  const total = round2(entries.reduce((s, e) => s + Number(e.total_commission), 0))

  const { data: payment, error: payErr } = await supabase
    .from('commission_payments')
    .insert({
      salon_id: profile.salon_id,
      professional_id,
      paid_at,
      total_amount: total,
      nf_emitida,
      nf_number,
      notes,
      created_by: profile.id,
    })
    .select('id')
    .single()
  if (payErr || !payment) return { error: payErr?.message ?? 'erro_ao_registrar_pagamento' }

  const { error: updErr } = await supabase
    .from('commission_entries')
    .update({
      status: 'pago',
      commission_payment_id: payment.id,
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .in('id', entry_ids)
  if (updErr) return { error: updErr.message }

  revalidatePath('/admin/financeiro')
  return { success: true }
}
