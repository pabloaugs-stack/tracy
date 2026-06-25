"use server"

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionProfile } from '@/lib/auth/session'

export type ProductLineResult = { error?: string }

// Encoding de "Vendido por" vindo da UI: '' = ninguém, 'recepcao' = recepção, ou um user_id.
export type SoldByInput = string

// ── Gate: comanda aberta + permissão (can_create OU profissional alocada) ──
// Espelha o gate de closeAppointmentAction. Leitura via admin para erro determinístico.
async function gateComanda(
  appointmentId: string
): Promise<{ error: string } | { salon_id: string }> {
  const profile = await getSessionProfile()
  const admin = createAdminClient()

  const { data: appt } = await admin
    .from('appointments')
    .select('closed_at, salon_id')
    .eq('id', appointmentId)
    .eq('salon_id', profile.salon_id)
    .single()

  if (!appt) return { error: 'Comanda não encontrada.' }
  if (appt.closed_at !== null) return { error: 'comanda_fechada' }

  let allowed = profile.can_create_appointments
  if (!allowed) {
    const { data: link } = await admin
      .from('appointment_professionals')
      .select('appointment_id')
      .eq('appointment_id', appointmentId)
      .eq('user_id', profile.id)
      .maybeSingle()
    allowed = !!link
  }
  if (!allowed) return { error: 'sem_permissao' }
  return { salon_id: appt.salon_id }
}

// Resolve sold_by_user_id/label a partir do encoding da UI. Valida que o user é profissional alocado.
async function resolveSoldBy(
  value: SoldByInput,
  appointmentId: string
): Promise<{ error: string } | { user_id: string | null; label: string | null }> {
  const v = (value ?? '').trim()
  if (v === '') return { user_id: null, label: null }
  if (v === 'recepcao') return { user_id: null, label: 'recepcao' }

  const admin = createAdminClient()
  const { data: link } = await admin
    .from('appointment_professionals')
    .select('user_id')
    .eq('appointment_id', appointmentId)
    .eq('user_id', v)
    .maybeSingle()
  if (!link) return { error: 'Vendedor inválido — selecione uma profissional alocada na comanda.' }
  return { user_id: v, label: null }
}

// Snapshot de % de comissão da linha no momento da adição/edição.
// Null quando a comissão de produto está desligada. 0 quando vendido por ninguém/recepção.
async function resolveCommissionSnapshot(
  appointmentSalonId: string,
  soldByUserId: string | null,
  product: { commission_percent: number | null }
): Promise<number | null> {
  const admin = createAdminClient()
  const { data: settings } = await admin
    .from('salon_settings')
    .select('product_commission_enabled, product_commission_mode')
    .eq('salon_id', appointmentSalonId)
    .single()

  if (!settings?.product_commission_enabled) return null
  if (!soldByUserId) return 0

  if (settings.product_commission_mode === 'por_profissional') {
    const { data: u } = await admin
      .from('users')
      .select('product_commission_percent')
      .eq('id', soldByUserId)
      .single()
    return u?.product_commission_percent != null ? Number(u.product_commission_percent) : 0
  }
  // por_produto
  return product.commission_percent != null ? Number(product.commission_percent) : 0
}

// ── Adicionar produto à comanda (baixa de estoque na adição) ──
export async function addProductToComandaAction(
  appointmentId: string,
  input: { productId: string; quantity: number; unitPrice?: number | null; soldBy?: SoldByInput }
): Promise<ProductLineResult> {
  const gate = await gateComanda(appointmentId)
  if ('error' in gate) return { error: gate.error }
  const salonId = gate.salon_id

  const quantity = Math.trunc(input.quantity)
  if (!Number.isInteger(quantity) || quantity < 1) return { error: 'Quantidade deve ser ao menos 1.' }

  const admin = createAdminClient()
  const { data: product } = await admin
    .from('products')
    .select('id, price, active, commission_percent, salon_id')
    .eq('id', input.productId)
    .eq('salon_id', salonId)
    .single()
  if (!product || !product.active) return { error: 'Produto inválido ou inativo.' }

  // Preço: catálogo por padrão; custom só se o salão permitir editar preço na comanda.
  const { data: settings } = await admin
    .from('salon_settings')
    .select('allow_edit_product_price')
    .eq('salon_id', salonId)
    .single()
  const allowEdit = !!settings?.allow_edit_product_price

  let unit_price = Number(product.price)
  if (input.unitPrice != null && input.unitPrice !== undefined) {
    const custom = Number(input.unitPrice)
    if (!allowEdit && custom !== Number(product.price)) return { error: 'edicao_preco_desabilitada' }
    if (custom < 0) return { error: 'Preço não pode ser negativo.' }
    unit_price = custom
  }

  const sold = await resolveSoldBy(input.soldBy ?? '', appointmentId)
  if ('error' in sold) return { error: sold.error }

  const commission_percent_snapshot = await resolveCommissionSnapshot(salonId, sold.user_id, product)

  // Baixa de estoque ANTES de inserir a linha (RPC atômico, nunca negativo). Recusa se insuficiente.
  const { data: ok } = await admin.rpc('adjust_product_stock', {
    p_product_id: product.id,
    p_salon_id: salonId,
    p_delta: -quantity,
  })
  if (!ok) return { error: 'estoque_insuficiente' }

  // Insere a linha pelo client autenticado (RLS é o gate). Em falha, devolve o estoque (compensação).
  const supabase = await createClient()
  const { error } = await supabase.from('appointment_products').insert({
    appointment_id: appointmentId,
    salon_id: salonId,
    product_id: product.id,
    quantity,
    unit_price,
    sold_by_user_id: sold.user_id,
    sold_by_label: sold.label,
    commission_percent_snapshot,
  })
  if (error) {
    await admin.rpc('adjust_product_stock', { p_product_id: product.id, p_salon_id: salonId, p_delta: quantity })
    return { error: error.message }
  }

  revalidatePath(`/admin/agenda/${appointmentId}`)
  revalidatePath('/admin/agenda')
  return {}
}

// Carrega a linha (admin) e valida que pertence à comanda informada.
async function loadLine(lineId: string, appointmentId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('appointment_products')
    .select('id, appointment_id, salon_id, product_id, quantity, unit_price, active')
    .eq('id', lineId)
    .eq('appointment_id', appointmentId)
    .single()
  return data
}

// ── Alterar quantidade (baixa/devolve a diferença) ──
export async function updateComandaProductQuantityAction(
  appointmentId: string,
  lineId: string,
  newQuantity: number
): Promise<ProductLineResult> {
  const gate = await gateComanda(appointmentId)
  if ('error' in gate) return { error: gate.error }

  const qty = Math.trunc(newQuantity)
  if (!Number.isInteger(qty) || qty < 1) return { error: 'Quantidade deve ser ao menos 1.' }

  const line = await loadLine(lineId, appointmentId)
  if (!line || !line.active) return { error: 'Linha de produto não encontrada.' }

  const admin = createAdminClient()
  const delta = qty - line.quantity // >0 consome mais, <0 devolve
  if (delta !== 0) {
    const { data: ok } = await admin.rpc('adjust_product_stock', {
      p_product_id: line.product_id,
      p_salon_id: line.salon_id,
      p_delta: -delta,
    })
    if (!ok) return { error: 'estoque_insuficiente' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('appointment_products')
    .update({ quantity: qty, updated_at: new Date().toISOString() })
    .eq('id', lineId)
  if (error) {
    if (delta !== 0)
      await admin.rpc('adjust_product_stock', { p_product_id: line.product_id, p_salon_id: line.salon_id, p_delta: delta })
    return { error: error.message }
  }

  revalidatePath(`/admin/agenda/${appointmentId}`)
  revalidatePath('/admin/agenda')
  return {}
}

// ── Alterar preço unitário (só se o salão permitir; sem efeito no estoque) ──
export async function updateComandaProductPriceAction(
  appointmentId: string,
  lineId: string,
  newUnitPrice: number
): Promise<ProductLineResult> {
  const gate = await gateComanda(appointmentId)
  if ('error' in gate) return { error: gate.error }

  const admin = createAdminClient()
  const { data: settings } = await admin
    .from('salon_settings')
    .select('allow_edit_product_price')
    .eq('salon_id', gate.salon_id)
    .single()
  if (!settings?.allow_edit_product_price) return { error: 'edicao_preco_desabilitada' }

  const price = Number(newUnitPrice)
  if (!Number.isFinite(price) || price < 0) return { error: 'Preço não pode ser negativo.' }

  const line = await loadLine(lineId, appointmentId)
  if (!line || !line.active) return { error: 'Linha de produto não encontrada.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('appointment_products')
    .update({ unit_price: price, updated_at: new Date().toISOString() })
    .eq('id', lineId)
  if (error) return { error: error.message }

  revalidatePath(`/admin/agenda/${appointmentId}`)
  revalidatePath('/admin/agenda')
  return {}
}

// ── Alterar "Vendido por" (recalcula o snapshot de comissão) ──
export async function updateComandaProductSoldByAction(
  appointmentId: string,
  lineId: string,
  soldBy: SoldByInput
): Promise<ProductLineResult> {
  const gate = await gateComanda(appointmentId)
  if ('error' in gate) return { error: gate.error }

  const line = await loadLine(lineId, appointmentId)
  if (!line || !line.active) return { error: 'Linha de produto não encontrada.' }

  const sold = await resolveSoldBy(soldBy, appointmentId)
  if ('error' in sold) return { error: sold.error }

  const admin = createAdminClient()
  const { data: product } = await admin
    .from('products')
    .select('commission_percent')
    .eq('id', line.product_id)
    .single()

  const commission_percent_snapshot = await resolveCommissionSnapshot(
    line.salon_id,
    sold.user_id,
    { commission_percent: product?.commission_percent ?? null }
  )

  const supabase = await createClient()
  const { error } = await supabase
    .from('appointment_products')
    .update({
      sold_by_user_id: sold.user_id,
      sold_by_label: sold.label,
      commission_percent_snapshot,
      updated_at: new Date().toISOString(),
    })
    .eq('id', lineId)
  if (error) return { error: error.message }

  revalidatePath(`/admin/agenda/${appointmentId}`)
  revalidatePath('/admin/agenda')
  return {}
}

// ── Remover linha (soft delete; devolve toda a quantidade ao estoque) ──
export async function removeComandaProductAction(
  appointmentId: string,
  lineId: string
): Promise<ProductLineResult> {
  const gate = await gateComanda(appointmentId)
  if ('error' in gate) return { error: gate.error }

  const line = await loadLine(lineId, appointmentId)
  if (!line || !line.active) return { error: 'Linha de produto não encontrada.' }

  const admin = createAdminClient()
  const supabase = await createClient()
  const { error } = await supabase
    .from('appointment_products')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', lineId)
  if (error) return { error: error.message }

  // Devolve o estoque após o soft-delete da linha.
  await admin.rpc('adjust_product_stock', {
    p_product_id: line.product_id,
    p_salon_id: line.salon_id,
    p_delta: line.quantity,
  })

  revalidatePath(`/admin/agenda/${appointmentId}`)
  revalidatePath('/admin/agenda')
  return {}
}
