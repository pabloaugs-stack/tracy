"use server"

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionProfile } from '@/lib/auth/session'
import type { MaterialType } from '@/lib/types/database'

export type MaterialLineResult = { error?: string }

// Consumo em unidade de consumo agora é fracionário (ex.: 2.5 gomos). Arredonda a 3 casas.
function roundQty(n: number): number {
  return Math.round(n * 1000) / 1000
}

// Gate: comanda aberta + permissão (can_create OU profissional alocada). Espelha appointment-products.
async function gateComanda(appointmentId: string): Promise<{ error: string } | { salon_id: string }> {
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

async function loadLine(lineId: string, appointmentId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('appointment_materials')
    .select('id, appointment_id, color_id, quantity, active')
    .eq('id', lineId)
    .eq('appointment_id', appointmentId)
    .single()
  return data
}

// Mensagem amigável de estoque insuficiente com o disponível devolvido pelo RPC FIFO.
function insufficientMsg(available: number | undefined, unit: string): string {
  return `Estoque insuficiente. Disponível: ${available ?? 0} ${unit}`.trim()
}

// ── Adicionar material (consumo FIFO de insumo na adição) ──
export async function addMaterialToComandaAction(
  appointmentId: string,
  input: { colorId: string; type: MaterialType; quantity: number }
): Promise<MaterialLineResult> {
  const gate = await gateComanda(appointmentId)
  if ('error' in gate) return { error: gate.error }
  const salonId = gate.salon_id

  if (input.type !== 'jumbo' && input.type !== 'cachos') return { error: 'Tipo de material inválido.' }
  const quantity = roundQty(input.quantity)
  if (!Number.isFinite(quantity) || quantity <= 0) return { error: 'Quantidade deve ser maior que zero.' }

  const admin = createAdminClient()
  const { data: color } = await admin
    .from('material_colors')
    .select('id, active, salon_id, consumption_unit')
    .eq('id', input.colorId)
    .eq('salon_id', salonId)
    .single()
  if (!color || !color.active) return { error: 'Cor de material inválida ou inativa.' }

  // Insere a linha (RLS, client normal) — precisa do id para amarrar o consumo de lote.
  const supabase = await createClient()
  const { data: line, error } = await supabase
    .from('appointment_materials')
    .insert({
      appointment_id: appointmentId,
      type: input.type,
      color_id: color.id,
      quantity,
      consumption_unit_snapshot: color.consumption_unit,
    })
    .select('id')
    .single()
  if (error || !line) return { error: error?.message ?? 'Erro ao adicionar material.' }

  // Baixa FIFO amarrada à linha. Em falta, desfaz a linha e devolve o disponível.
  const { data: r } = await admin.rpc('consume_inventory_fifo', {
    p_item_type: 'insumo',
    p_item_id: color.id,
    p_salon_id: salonId,
    p_quantity: quantity,
    p_source_type: 'appointment_material',
    p_source_id: line.id,
  })
  if (!r?.success) {
    await admin.from('appointment_materials').delete().eq('id', line.id)
    return { error: insufficientMsg(r?.available, color.consumption_unit) }
  }

  revalidatePath(`/admin/agenda/${appointmentId}`)
  revalidatePath('/admin/agenda')
  return {}
}

// ── Alterar quantidade (devolve o consumo antigo via FIFO e reconsome a nova quantidade) ──
export async function updateComandaMaterialQuantityAction(
  appointmentId: string,
  lineId: string,
  newQuantity: number
): Promise<MaterialLineResult> {
  const gate = await gateComanda(appointmentId)
  if ('error' in gate) return { error: gate.error }

  const qty = roundQty(newQuantity)
  if (!Number.isFinite(qty) || qty <= 0) return { error: 'Quantidade deve ser maior que zero.' }

  const line = await loadLine(lineId, appointmentId)
  if (!line || !line.active) return { error: 'Linha de material não encontrada.' }
  const oldQty = Number(line.quantity)
  if (qty === oldQty) return {}

  const admin = createAdminClient()
  const { data: color } = await admin
    .from('material_colors')
    .select('consumption_unit')
    .eq('id', line.color_id)
    .single()
  const unit = color?.consumption_unit ?? ''

  // Devolve o consumo antigo, depois reconsome a nova quantidade. Se faltar, restaura o consumo antigo.
  await admin.rpc('return_inventory_fifo', {
    p_source_type: 'appointment_material',
    p_source_id: lineId,
    p_salon_id: gate.salon_id,
  })
  const { data: r } = await admin.rpc('consume_inventory_fifo', {
    p_item_type: 'insumo',
    p_item_id: line.color_id,
    p_salon_id: gate.salon_id,
    p_quantity: qty,
    p_source_type: 'appointment_material',
    p_source_id: lineId,
  })
  if (!r?.success) {
    await admin.rpc('consume_inventory_fifo', {
      p_item_type: 'insumo',
      p_item_id: line.color_id,
      p_salon_id: gate.salon_id,
      p_quantity: oldQty,
      p_source_type: 'appointment_material',
      p_source_id: lineId,
    })
    return { error: insufficientMsg(r?.available, unit) }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('appointment_materials').update({ quantity: qty }).eq('id', lineId)
  if (error) {
    // Restaura o consumo original (devolve o novo, reconsome o antigo).
    await admin.rpc('return_inventory_fifo', { p_source_type: 'appointment_material', p_source_id: lineId, p_salon_id: gate.salon_id })
    await admin.rpc('consume_inventory_fifo', {
      p_item_type: 'insumo', p_item_id: line.color_id, p_salon_id: gate.salon_id,
      p_quantity: oldQty, p_source_type: 'appointment_material', p_source_id: lineId,
    })
    return { error: error.message }
  }

  revalidatePath(`/admin/agenda/${appointmentId}`)
  revalidatePath('/admin/agenda')
  return {}
}

// ── Remover linha (soft delete; devolve todo o consumo via FIFO) ──
export async function removeComandaMaterialAction(
  appointmentId: string,
  lineId: string
): Promise<MaterialLineResult> {
  const gate = await gateComanda(appointmentId)
  if ('error' in gate) return { error: gate.error }

  const line = await loadLine(lineId, appointmentId)
  if (!line || !line.active) return { error: 'Linha de material não encontrada.' }

  const admin = createAdminClient()
  await admin.rpc('return_inventory_fifo', {
    p_source_type: 'appointment_material',
    p_source_id: lineId,
    p_salon_id: gate.salon_id,
  })

  const supabase = await createClient()
  const { error } = await supabase.from('appointment_materials').update({ active: false }).eq('id', lineId)
  if (error) return { error: error.message }

  revalidatePath(`/admin/agenda/${appointmentId}`)
  revalidatePath('/admin/agenda')
  return {}
}
