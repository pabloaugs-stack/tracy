"use server"

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionProfile } from '@/lib/auth/session'
import { getAppointmentById, type AppointmentDetail } from '@/lib/queries/appointments'
import { getAppointmentPayments, type AppointmentPaymentCompact } from '@/lib/queries/appointment-payments'
import { getActiveAppointmentProducts, type AppointmentProductLine } from '@/lib/queries/appointment-products'
import { getActiveAppointmentMaterials, type AppointmentMaterialLine } from '@/lib/queries/appointment-materials'
import { getInstallmentFee } from '@/lib/queries/card_tree'
import { round2, cardFeeAmount } from '@/lib/payments/card-fee'
import type { AppointmentStatus, RoleInAppointment, DiscountType, AppointmentPaymentInsert } from '@/lib/types/database'

export type AppointmentActionState = { error: string } | undefined
export type CloseActionResult = { error?: string }
export type StatusActionResult = { error?: string }
export type ComandaDetailResult =
  | {
      detail: AppointmentDetail
      payments: AppointmentPaymentCompact[]
      products: AppointmentProductLine[]
      materials: AppointmentMaterialLine[]
    }
  | { error: string }

// total_price guarda o snapshot do serviço; productsTotal é o subtotal das linhas de produto ativas.
// A base do cálculo = serviço + produtos; o desconto incide sobre essa base; total_override sobrescreve tudo.
function computeFinalTotal(
  totalPrice: number,
  discountType: string | null,
  discountValue: number | null,
  totalOverride: number | null,
  productsTotal: number = 0
): number {
  if (totalOverride !== null) return totalOverride
  const base = totalPrice + productsTotal
  if (!discountType || discountValue === null) return base
  if (discountType === 'fixed') return Math.max(0, base - discountValue)
  return Math.max(0, base * (1 - discountValue / 100))
}

function brazilToday(): string {
  return new Intl.DateTimeFormat('sv', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

// Núcleo de criação da comanda — não navega; devolve { id } no sucesso ou { error }.
// Reutilizado por createAppointmentAction (página standalone, redireciona) e
// createAppointmentInlineAction (modal da agenda, fecha + refresh sem perder o ?date=).
async function insertAppointment(
  formData: FormData
): Promise<{ error: string } | { id: string }> {
  const client_id = (formData.get('client_id') as string | null)?.trim()
  const service_id = (formData.get('service_id') as string | null)?.trim()
  const date = (formData.get('date') as string | null)?.trim()
  const time = (formData.get('time') as string | null)?.trim()

  if (!client_id) return { error: 'Selecione um cliente.' }
  if (!service_id) return { error: 'Selecione um serviço.' }
  if (!date || !time) return { error: 'Data e hora são obrigatórios.' }

  // Compõe o timestamp com o fuso de Brasília (UTC-3)
  const scheduled_at = `${date}T${time}:00-03:00`
  const notes = (formData.get('notes') as string | null)?.trim() || null
  const profCount = parseInt((formData.get('prof_count') as string | null) ?? '0', 10)

  // Desconto e override de total
  const discountTypeRaw = (formData.get('discount_type') as string | null)?.trim()
  const discount_type: DiscountType | null =
    discountTypeRaw === 'fixed' || discountTypeRaw === 'percent' ? discountTypeRaw : null
  const discountValueRaw = (formData.get('discount_value') as string | null)?.trim()
  const discount_value = discount_type && discountValueRaw ? parseFloat(discountValueRaw) || null : null
  const totalOverrideRaw = (formData.get('total_override') as string | null)?.trim()
  const total_override = totalOverrideRaw ? parseFloat(totalOverrideRaw) || null : null

  // Sinal
  const depositTypeRaw = (formData.get('deposit_type') as string | null)?.trim()
  const deposit_type: 'fixed' | 'percent' | null =
    depositTypeRaw === 'fixed' || depositTypeRaw === 'percent' ? depositTypeRaw : null
  const depositValueRaw = (formData.get('deposit_value') as string | null)?.trim()
  const deposit_value_num = deposit_type && depositValueRaw ? parseFloat(depositValueRaw) : null

  const profile = await getSessionProfile()
  if (!profile.can_create_appointments) return { error: 'sem_permissao_criar_comanda' }

  // Pelo menos 1 profissional é obrigatório para criar uma comanda
  if (profCount === 0) return { error: 'profissional_obrigatorio' }

  const supabase = await createClient()

  const { data: service, error: serviceError } = await supabase
    .from('services')
    .select('price')
    .eq('id', service_id)
    .single()

  if (serviceError || !service) return { error: 'Serviço não encontrado.' }

  // Validação server-side do limite de desconto
  if (discount_type && discount_value && profile.discount_limit_percent !== null) {
    const base = service.price
    const discountPct =
      discount_type === 'percent'
        ? discount_value
        : base > 0
          ? (discount_value / base) * 100
          : 0
    if (discountPct > profile.discount_limit_percent) {
      return {
        error: `Desconto de ${discountPct.toFixed(1)}% excede seu limite de ${profile.discount_limit_percent}%.`,
      }
    }
  }

  // Validações do sinal
  let deposit_payment_method_id: string | null = null
  let deposit_paid_at: string | null = null
  let depositAmount: number | null = null
  // Cartão do sinal (preenchidos só quando a forma do sinal é crédito).
  let deposit_card_machine_id: string | null = null
  let deposit_card_brand_id: string | null = null
  let deposit_card_installment_id: string | null = null
  let deposit_fee_amount: number | null = null

  if (deposit_type) {
    if (!deposit_value_num || deposit_value_num <= 0)
      return { error: 'Valor do sinal deve ser maior que zero.' }
    if (deposit_type === 'percent' && deposit_value_num > 100)
      return { error: 'Sinal em porcentagem não pode ultrapassar 100%.' }

    const effectiveTotal = computeFinalTotal(service.price, discount_type, discount_value, total_override)

    if (deposit_type === 'fixed' && deposit_value_num > effectiveTotal)
      return { error: 'Sinal não pode ser maior que o total da comanda.' }

    depositAmount =
      deposit_type === 'fixed'
        ? deposit_value_num
        : effectiveTotal * (deposit_value_num / 100)

    // Forma de pagamento é obrigatória quando o sinal existe
    deposit_payment_method_id =
      (formData.get('deposit_payment_method_id') as string | null)?.trim() || null
    if (!deposit_payment_method_id)
      return { error: 'Selecione a forma de recebimento do sinal.' }

    // Valida que a forma pertence ao salão e está ativa
    const { data: pm } = await supabase
      .from('payment_methods')
      .select('id, kind')
      .eq('id', deposit_payment_method_id)
      .eq('salon_id', profile.salon_id)
      .eq('active', true)
      .maybeSingle()

    if (!pm) return { error: 'Forma de pagamento do sinal inválida.' }

    // Sinal de crédito consome a MESMA árvore e o MESMO cálculo de taxa que o final.
    if (pm.kind === 'credito') {
      const cm = (formData.get('deposit_card_machine_id') as string | null)?.trim() || null
      const cb = (formData.get('deposit_card_brand_id') as string | null)?.trim() || null
      const ci = (formData.get('deposit_card_installment_id') as string | null)?.trim() || null
      if (!cm || !cb || !ci) return { error: 'credito_requer_dados_cartao' }
      const fee = await getInstallmentFee(cm, cb, ci, profile.salon_id)
      if (!fee) return { error: 'arvore_cartao_inconsistente' }
      deposit_card_machine_id = cm
      deposit_card_brand_id = cb
      deposit_card_installment_id = ci
      deposit_fee_amount = cardFeeAmount(depositAmount, fee.feePercent)
    }

    deposit_paid_at =
      (formData.get('deposit_paid_at') as string | null)?.trim() || brazilToday()

    // Data do sinal não pode ser futura (recepção pode lançar hoje um sinal recebido ontem)
    if (deposit_paid_at > brazilToday()) return { error: 'data_sinal_invalida' }
  }

  const deposit_value = deposit_value_num ?? null

  const { data: appointment, error: apptError } = await supabase
    .from('appointments')
    .insert({
      salon_id: profile.salon_id,
      client_id,
      service_id,
      scheduled_at,
      total_price: service.price,
      discount_type,
      discount_value,
      total_override,
      deposit_type,
      deposit_value,
      notes,
    })
    .select('id')
    .single()

  if (apptError || !appointment) return { error: apptError?.message ?? 'Erro ao criar comanda.' }

  // Vincula profissionais
  const profInserts = []
  for (let i = 0; i < profCount; i++) {
    const user_id = (formData.get(`prof_user_id_${i}`) as string | null)?.trim()
    const role_in_appointment = formData.get(`prof_role_${i}`) as RoleInAppointment | null
    const commissionStr = (formData.get(`prof_commission_${i}`) as string | null)?.trim()
    const commission_override = commissionStr ? parseFloat(commissionStr) : null

    if (!user_id || !role_in_appointment) continue
    profInserts.push({ appointment_id: appointment.id, user_id, role_in_appointment, commission_override })
  }

  if (profInserts.length > 0) {
    const { error: profError } = await supabase.from('appointment_professionals').insert(profInserts)
    if (profError) return { error: profError.message }
  }

  // Materiais não são mais vinculados na criação — passam a ser linhas vivas no modal da comanda
  // (ComandaMaterialsSection), com baixa de estoque na adição.

  // Grava sinal como recebido (active=true) já na criação
  if (deposit_type && depositAmount !== null && deposit_payment_method_id && deposit_paid_at) {
    const { error: payError } = await supabase.from('appointment_payments').insert({
      appointment_id: appointment.id,
      salon_id: profile.salon_id,
      payment_method_id: deposit_payment_method_id,
      payment_type: 'sinal',
      amount: depositAmount,
      paid_at: deposit_paid_at,
      active: true,
      card_machine_id: deposit_card_machine_id,
      card_brand_id: deposit_card_brand_id,
      card_installment_id: deposit_card_installment_id,
      fee_amount: deposit_fee_amount,
    })
    if (payError) return { error: payError.message }
  }

  return { id: appointment.id }
}

// Página standalone /admin/agenda/nova-comanda — redireciona para a agenda no sucesso.
export async function createAppointmentAction(
  prevState: AppointmentActionState,
  formData: FormData
): Promise<AppointmentActionState> {
  const result = await insertAppointment(formData)
  if ('error' in result) return { error: result.error }
  // redirect() fica FORA de try/catch (lança exceção interna no Next 16).
  redirect('/admin/agenda')
}

// Modal de criação na agenda — sem redirect; revalida e devolve sucesso para o modal fechar + refresh.
export async function createAppointmentInlineAction(
  prevState: AppointmentActionState,
  formData: FormData
): Promise<AppointmentActionState> {
  const result = await insertAppointment(formData)
  if ('error' in result) return { error: result.error }
  revalidatePath('/admin/agenda')
  return undefined
}

const VALID_STATUSES: AppointmentStatus[] = [
  'agendado',
  'em_andamento',
  'concluido',
  'cancelado',
  'nao_compareceu',
]

// Muda o status de uma comanda. Gate especial para 'em_andamento': além de dono/gerente/recepcionista,
// qualquer profissional ALOCADA na comanda (qualquer role_in_appointment) pode iniciar o atendimento.
export async function changeStatusAction(
  appointmentId: string,
  newStatus: AppointmentStatus
): Promise<StatusActionResult> {
  if (!VALID_STATUSES.includes(newStatus)) return { error: 'Status inválido.' }

  const profile = await getSessionProfile()
  const supabase = await createClient()

  const { data: appt } = await supabase
    .from('appointments')
    .select('closed_at, status')
    .eq('id', appointmentId)
    .eq('salon_id', profile.salon_id)
    .single()

  if (!appt) return { error: 'Comanda não encontrada.' }

  // Comanda fechada bloqueia qualquer mudança de status — reabrir (reopenAppointmentAction) primeiro.
  if (appt.closed_at !== null) return { error: 'Comanda fechada. Reabra antes de alterar.' }

  const canManage = profile.can_create_appointments

  if (newStatus === 'em_andamento') {
    let allowed = canManage
    if (!allowed) {
      // Profissional alocada na comanda pode iniciar — reaproveita o vínculo em appointment_professionals
      const { data: link } = await supabase
        .from('appointment_professionals')
        .select('appointment_id')
        .eq('appointment_id', appointmentId)
        .eq('user_id', profile.id)
        .maybeSingle()
      allowed = !!link
    }
    if (!allowed) return { error: 'sem_permissao_para_iniciar_atendimento' }
  } else {
    // Demais status (cancelado, nao_compareceu, concluido, agendado): exige can_create_appointments
    if (!canManage) return { error: 'Sem permissão para alterar status.' }
  }

  // A RLS de UPDATE em appointments só cobre can_create/can_close — não a profissional alocada.
  // O gate acima já valida salão, alocação/role e closed_at; o UPDATE de status vai pelo admin client
  // (mesmo padrão de team.ts para mutations gated em código), evitando uma migration de policy neste bloco.
  const admin = createAdminClient()
  const { data: updated, error } = await admin
    .from('appointments')
    .update({ status: newStatus })
    .eq('id', appointmentId)
    .eq('salon_id', profile.salon_id)
    .select('id')

  if (error) return { error: error.message }
  if (!updated || updated.length === 0)
    return { error: 'Não foi possível alterar o status.' }

  // Cancelar devolve TODOS os produtos ativos da comanda ao estoque e marca as linhas como inativas.
  // Não há devolução ao reabrir uma comanda concluída — só o cancelamento restitui o estoque.
  if (newStatus === 'cancelado') {
    const { data: prodLines } = await admin
      .from('appointment_products')
      .select('id, product_id, quantity')
      .eq('appointment_id', appointmentId)
      .eq('active', true)
    for (const line of prodLines ?? []) {
      await admin.rpc('adjust_product_stock', {
        p_product_id: line.product_id,
        p_salon_id: profile.salon_id,
        p_delta: line.quantity,
      })
    }
    if ((prodLines ?? []).length > 0) {
      await admin
        .from('appointment_products')
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq('appointment_id', appointmentId)
        .eq('active', true)
    }

    // Mesma devolução para materiais (insumos).
    const { data: matLines } = await admin
      .from('appointment_materials')
      .select('id, color_id, quantity')
      .eq('appointment_id', appointmentId)
      .eq('active', true)
    for (const line of matLines ?? []) {
      await admin.rpc('adjust_material_color_stock', {
        p_color_id: line.color_id,
        p_salon_id: profile.salon_id,
        p_delta: line.quantity,
      })
    }
    if ((matLines ?? []).length > 0) {
      await admin
        .from('appointment_materials')
        .update({ active: false })
        .eq('appointment_id', appointmentId)
        .eq('active', true)
    }
  }

  revalidatePath('/admin/agenda')
  revalidatePath(`/admin/agenda/${appointmentId}`)
  return {}
}

// Form action (StatusForm) — delega para changeStatusAction.
export async function updateAppointmentStatusAction(
  appointmentId: string,
  prevState: AppointmentActionState,
  formData: FormData
): Promise<AppointmentActionState> {
  const newStatus = formData.get('status') as AppointmentStatus | null
  if (!newStatus || !VALID_STATUSES.includes(newStatus)) return { error: 'Status inválido.' }
  const result = await changeStatusAction(appointmentId, newStatus)
  if (result.error) return { error: result.error }
  return undefined
}

// Carrega detalhe completo + histórico de pagamentos de uma comanda — usado pelo modal da agenda.
export async function getComandaDetailAction(id: string): Promise<ComandaDetailResult> {
  const detail = await getAppointmentById(id)
  if (!detail) return { error: 'Comanda não encontrada.' }
  const [payments, products, materials] = await Promise.all([
    getAppointmentPayments(id),
    getActiveAppointmentProducts(id),
    getActiveAppointmentMaterials(id),
  ])
  return { detail, payments, products, materials }
}

// Atualiza campos da comanda. Recusa mudança em deposit_type/deposit_value se houver sinal recebido.
export async function updateAppointmentAction(
  appointmentId: string,
  prevState: AppointmentActionState,
  formData: FormData
): Promise<AppointmentActionState> {
  const profile = await getSessionProfile()
  if (!profile.can_create_appointments) return { error: 'Sem permissão para alterar comanda.' }

  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('appointments')
    .select('closed_at, deposit_type, deposit_value, service_id')
    .eq('id', appointmentId)
    .eq('salon_id', profile.salon_id)
    .single()

  if (!existing) return { error: 'Comanda não encontrada.' }
  if (existing.closed_at !== null) return { error: 'Comanda fechada. Reabra antes de alterar.' }

  const client_id = (formData.get('client_id') as string | null)?.trim()
  const service_id = (formData.get('service_id') as string | null)?.trim()
  const date = (formData.get('date') as string | null)?.trim()
  const time = (formData.get('time') as string | null)?.trim()

  if (!client_id) return { error: 'Selecione um cliente.' }
  if (!service_id) return { error: 'Selecione um serviço.' }
  if (!date || !time) return { error: 'Data e hora são obrigatórios.' }

  const scheduled_at = `${date}T${time}:00-03:00`
  const notes = (formData.get('notes') as string | null)?.trim() || null
  const profCount = parseInt((formData.get('prof_count') as string | null) ?? '0', 10)

  if (profCount === 0) return { error: 'profissional_obrigatorio' }

  const discountTypeRaw = (formData.get('discount_type') as string | null)?.trim()
  const discount_type: DiscountType | null =
    discountTypeRaw === 'fixed' || discountTypeRaw === 'percent' ? discountTypeRaw : null
  const discountValueRaw = (formData.get('discount_value') as string | null)?.trim()
  const discount_value = discount_type && discountValueRaw ? parseFloat(discountValueRaw) || null : null
  const totalOverrideRaw = (formData.get('total_override') as string | null)?.trim()
  const total_override = totalOverrideRaw ? parseFloat(totalOverrideRaw) || null : null

  const depositTypeRaw = (formData.get('deposit_type') as string | null)?.trim()
  const deposit_type: 'fixed' | 'percent' | null =
    depositTypeRaw === 'fixed' || depositTypeRaw === 'percent' ? depositTypeRaw : null
  const depositValueRaw = (formData.get('deposit_value') as string | null)?.trim()
  const deposit_value_num = deposit_type && depositValueRaw ? parseFloat(depositValueRaw) || null : null
  const deposit_value = deposit_value_num ?? null

  // Trava do sinal: se sinal já foi recebido, recusa qualquer mudança em deposit_type/deposit_value
  const depositChanged =
    deposit_type !== existing.deposit_type ||
    deposit_value !== existing.deposit_value

  if (depositChanged) {
    const { data: activeSinal } = await supabase
      .from('appointment_payments')
      .select('id')
      .eq('appointment_id', appointmentId)
      .eq('payment_type', 'sinal')
      .eq('active', true)
      .maybeSingle()

    if (activeSinal) return { error: 'sinal_recebido_trava_alteracao' }
  }

  // Busca preço do serviço (pode ter mudado)
  const { data: service, error: serviceError } = await supabase
    .from('services')
    .select('price')
    .eq('id', service_id)
    .single()

  if (serviceError || !service) return { error: 'Serviço não encontrado.' }

  // Validação server-side do limite de desconto
  if (discount_type && discount_value && profile.discount_limit_percent !== null) {
    const discountPct =
      discount_type === 'percent'
        ? discount_value
        : service.price > 0
          ? (discount_value / service.price) * 100
          : 0
    if (discountPct > profile.discount_limit_percent) {
      return {
        error: `Desconto de ${discountPct.toFixed(1)}% excede seu limite de ${profile.discount_limit_percent}%.`,
      }
    }
  }

  // Validações do sinal (apenas se não há sinal recebido, pois depositChanged já teria bloqueado)
  if (deposit_type) {
    if (!deposit_value_num || deposit_value_num <= 0)
      return { error: 'Valor do sinal deve ser maior que zero.' }
    if (deposit_type === 'percent' && deposit_value_num > 100)
      return { error: 'Sinal em porcentagem não pode ultrapassar 100%.' }
    const effectiveTotal = computeFinalTotal(service.price, discount_type, discount_value, total_override)
    if (deposit_type === 'fixed' && deposit_value_num > effectiveTotal)
      return { error: 'Sinal não pode ser maior que o total da comanda.' }
  }

  const { error: updateError } = await supabase
    .from('appointments')
    .update({
      client_id,
      service_id,
      scheduled_at,
      total_price: service.price,
      discount_type,
      discount_value,
      total_override,
      deposit_type,
      deposit_value,
      notes,
    })
    .eq('id', appointmentId)
    .eq('salon_id', profile.salon_id)

  if (updateError) return { error: updateError.message }

  // Substitui profissionais e materiais
  await supabase
    .from('appointment_professionals')
    .delete()
    .eq('appointment_id', appointmentId)

  const profInserts = []
  for (let i = 0; i < profCount; i++) {
    const user_id = (formData.get(`prof_user_id_${i}`) as string | null)?.trim()
    const role_in_appointment = formData.get(`prof_role_${i}`) as RoleInAppointment | null
    const commissionStr = (formData.get(`prof_commission_${i}`) as string | null)?.trim()
    const commission_override = commissionStr ? parseFloat(commissionStr) : null

    if (!user_id || !role_in_appointment) continue
    profInserts.push({ appointment_id: appointmentId, user_id, role_in_appointment, commission_override })
  }

  if (profInserts.length > 0) {
    const { error: profError } = await supabase.from('appointment_professionals').insert(profInserts)
    if (profError) return { error: profError.message }
  }

  // Materiais não são tocados aqui — são geridos como linhas vivas no modal (com baixa de estoque).

  revalidatePath(`/admin/agenda/${appointmentId}`)
  revalidatePath('/admin/agenda')
  return undefined
}

// Uma linha de pagamento do fechamento dividido. Campos de cartão obrigatórios só quando a forma é crédito.
export type PaymentLineInput = {
  payment_method_id: string
  amount: number
  paid_at?: string
  card_machine_id?: string | null
  card_brand_id?: string | null
  card_installment_id?: string | null
}

// Fecha a comanda registrando N pagamentos finais (pagamento dividido) e seta closed_at = now().
// Quem pode FECHAR: can_close_appointments (role) OU profissional ALOCADA nesta comanda — caso
// "dona solo" (BLOCO 8.1). Reabrir (reopenAppointmentAction) permanece role-only.
//
// Regras (decisões de produto do BLOCO Pagamento dividido):
// - Saldo a dividir = computeFinalTotal − Σ sinais ativos. Sinal NÃO entra na divisão.
// - A soma das linhas DEVE bater com o saldo (tolerância R$ 0,01 de arredondamento). Sem troco/sobra.
// - Taxa de cartão: linha de crédito grava fee_amount = round(amount × fee_percent / 100) como SNAPSHOT.
//   A taxa NÃO é descontada do amount (cliente paga cheio; taxa é custo do salão).
export async function closeAppointmentAction(
  appointmentId: string,
  payments: PaymentLineInput[]
): Promise<CloseActionResult> {
  const profile = await getSessionProfile()
  const supabase = await createClient()
  const admin = createAdminClient()

  // Estado + alocação via admin para o gate ser determinístico (a RLS de SELECT esconderia a comanda
  // de uma profissional não-alocada, devolvendo "não encontrada" no lugar do erro de permissão).
  const { data: appt } = await admin
    .from('appointments')
    .select('closed_at, salon_id, total_price, discount_type, discount_value, total_override')
    .eq('id', appointmentId)
    .eq('salon_id', profile.salon_id)
    .single()

  if (!appt) return { error: 'Comanda não encontrada.' }
  if (appt.closed_at !== null) return { error: 'Comanda já está fechada.' }

  let allowed = profile.can_close_appointments
  if (!allowed) {
    const { data: link } = await admin
      .from('appointment_professionals')
      .select('appointment_id')
      .eq('appointment_id', appointmentId)
      .eq('user_id', profile.id)
      .maybeSingle()
    allowed = !!link
  }
  if (!allowed) return { error: 'sem_permissao_para_fechar_comanda' }

  // Subtotal de produtos ativos entra na base do total.
  const { data: prodLines } = await admin
    .from('appointment_products')
    .select('quantity, unit_price')
    .eq('appointment_id', appointmentId)
    .eq('active', true)
  const productsTotal = (prodLines ?? []).reduce((s, l) => s + l.quantity * Number(l.unit_price), 0)

  const finalTotal = computeFinalTotal(
    appt.total_price,
    appt.discount_type,
    appt.discount_value,
    appt.total_override,
    productsTotal
  )

  // Saldo a dividir = total − sinais ativos (sinal não entra na divisão).
  const { data: sinais } = await supabase
    .from('appointment_payments')
    .select('amount')
    .eq('appointment_id', appointmentId)
    .eq('payment_type', 'sinal')
    .eq('active', true)

  const totalSinais = (sinais ?? []).reduce((sum, s) => sum + (s.amount as number), 0)
  const saldo = round2(Math.max(0, finalTotal - totalSinais))

  // Saldo zerado (sinal cobre tudo): fecha sem finais. Linhas enviadas são ignoradas.
  if (saldo <= 0) {
    return finalizeClose(admin, appointmentId, profile.salon_id)
  }

  // Há saldo: exige ao menos 1 linha e que a soma bata com o saldo (tolerância R$ 0,01).
  if (payments.length === 0) return { error: 'Informe a forma de pagamento para fechar.' }

  let soma = 0
  for (const p of payments) {
    const amount = round2(Number(p.amount))
    if (!(amount > 0)) return { error: 'valor_invalido' }
    soma = round2(soma + amount)
  }
  if (Math.abs(soma - saldo) > 0.01) return { error: 'soma_diferente_do_saldo' }

  // Valida as formas (do salão + ativas) e monta as linhas com snapshot de taxa de cartão.
  const methodIds = [...new Set(payments.map((p) => p.payment_method_id))]
  const { data: methods } = await supabase
    .from('payment_methods')
    .select('id, kind, active')
    .eq('salon_id', profile.salon_id)
    .in('id', methodIds)
  const methodMap = new Map((methods ?? []).map((m) => [m.id, m]))

  const rows: AppointmentPaymentInsert[] = []
  const paidAtDefault = brazilToday()
  for (const p of payments) {
    const method = methodMap.get(p.payment_method_id)
    if (!method || !method.active) return { error: 'forma_pagamento_invalida' }
    const amount = round2(Number(p.amount))

    let feeAmount: number | null = null
    let cardMachineId: string | null = null
    let cardBrandId: string | null = null
    let cardInstallmentId: string | null = null

    if (method.kind === 'credito') {
      if (!p.card_machine_id || !p.card_brand_id || !p.card_installment_id) {
        return { error: 'credito_requer_dados_cartao' }
      }
      const fee = await getInstallmentFee(p.card_machine_id, p.card_brand_id, p.card_installment_id, profile.salon_id)
      if (!fee) return { error: 'arvore_cartao_inconsistente' }
      cardMachineId = p.card_machine_id
      cardBrandId = p.card_brand_id
      cardInstallmentId = p.card_installment_id
      // Snapshot: taxa não muda depois mesmo que a árvore mude. Não desconta do amount.
      feeAmount = cardFeeAmount(amount, fee.feePercent)
    } else if (p.card_machine_id || p.card_brand_id || p.card_installment_id) {
      // Forma não-crédito não pode carregar dados de cartão.
      return { error: 'nao_credito_sem_dados_cartao' }
    }

    rows.push({
      appointment_id: appointmentId,
      salon_id: profile.salon_id,
      payment_method_id: p.payment_method_id,
      payment_type: 'final',
      amount,
      paid_at: p.paid_at ?? paidAtDefault,
      active: true,
      card_machine_id: cardMachineId,
      card_brand_id: cardBrandId,
      card_installment_id: cardInstallmentId,
      fee_amount: feeAmount,
    })
  }

  // Insert das N linhas via client normal — a RLS de appointment_payments_insert_final é o guarda real.
  const { error: payError } = await supabase.from('appointment_payments').insert(rows)
  if (payError) return { error: payError.message }

  return finalizeClose(admin, appointmentId, profile.salon_id)
}

// Avança status → concluido e seta closed_at via admin (a policy appointments_update_close é role-only;
// a profissional alocada seria filtrada pela RLS, mas o gate já foi validado em código).
async function finalizeClose(
  admin: ReturnType<typeof createAdminClient>,
  appointmentId: string,
  salonId: string
): Promise<CloseActionResult> {
  const { error } = await admin
    .from('appointments')
    .update({ closed_at: new Date().toISOString(), status: 'concluido' })
    .eq('id', appointmentId)
    .eq('salon_id', salonId)
  if (error) return { error: error.message }
  revalidatePath(`/admin/agenda/${appointmentId}`)
  revalidatePath('/admin/agenda')
  return {}
}

// Reabre a comanda: soft-delete em CASCATA de todos os finais ativos; sinal permanece. Refecha do zero.
export async function reopenAppointmentAction(appointmentId: string): Promise<CloseActionResult> {
  const profile = await getSessionProfile()
  if (!profile.can_close_appointments) return { error: 'Sem permissão para reabrir comanda.' }

  const supabase = await createClient()

  const { data: appt } = await supabase
    .from('appointments')
    .select('closed_at')
    .eq('id', appointmentId)
    .eq('salon_id', profile.salon_id)
    .single()

  if (!appt) return { error: 'Comanda não encontrada.' }
  if (appt.closed_at === null) return { error: 'Comanda já está aberta.' }

  // Soft-delete de TODOS os finais ativos (pagamento dividido → N linhas); sinal intacto.
  const { error: payError } = await supabase
    .from('appointment_payments')
    .update({ active: false })
    .eq('appointment_id', appointmentId)
    .eq('payment_type', 'final')
    .eq('active', true)

  if (payError) return { error: payError.message }

  // Reabrir devolve ao estado anterior ao fechamento: status 'em_andamento' e closed_at = NULL.
  const { error } = await supabase
    .from('appointments')
    .update({ closed_at: null, status: 'em_andamento' })
    .eq('id', appointmentId)

  if (error) return { error: error.message }

  revalidatePath(`/admin/agenda/${appointmentId}`)
  revalidatePath('/admin/agenda')
  return {}
}
