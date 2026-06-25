"use server"

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionProfile } from '@/lib/auth/session'
import type { MaterialType } from '@/lib/types/database'

export type MaterialLineResult = { error?: string }

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

// ── Adicionar material (baixa de insumo na adição) ──
export async function addMaterialToComandaAction(
  appointmentId: string,
  input: { colorId: string; type: MaterialType; quantity: number }
): Promise<MaterialLineResult> {
  const gate = await gateComanda(appointmentId)
  if ('error' in gate) return { error: gate.error }
  const salonId = gate.salon_id

  if (input.type !== 'jumbo' && input.type !== 'cachos') return { error: 'Tipo de material inválido.' }
  const quantity = Math.trunc(input.quantity)
  if (!Number.isInteger(quantity) || quantity < 1) return { error: 'Quantidade deve ser ao menos 1.' }

  const admin = createAdminClient()
  const { data: color } = await admin
    .from('material_colors')
    .select('id, active, salon_id')
    .eq('id', input.colorId)
    .eq('salon_id', salonId)
    .single()
  if (!color || !color.active) return { error: 'Cor de material inválida ou inativa.' }

  // Baixa de insumo ANTES de inserir a linha (RPC atômico, nunca negativo).
  const { data: ok } = await admin.rpc('adjust_material_color_stock', {
    p_color_id: color.id,
    p_salon_id: salonId,
    p_delta: -quantity,
  })
  if (!ok) return { error: 'estoque_insumo_insuficiente' }

  const supabase = await createClient()
  const { error } = await supabase.from('appointment_materials').insert({
    appointment_id: appointmentId,
    type: input.type,
    color_id: color.id,
    quantity,
  })
  if (error) {
    await admin.rpc('adjust_material_color_stock', { p_color_id: color.id, p_salon_id: salonId, p_delta: quantity })
    return { error: error.message }
  }

  revalidatePath(`/admin/agenda/${appointmentId}`)
  revalidatePath('/admin/agenda')
  return {}
}

// ── Alterar quantidade (baixa/devolve diferença) ──
export async function updateComandaMaterialQuantityAction(
  appointmentId: string,
  lineId: string,
  newQuantity: number
): Promise<MaterialLineResult> {
  const gate = await gateComanda(appointmentId)
  if ('error' in gate) return { error: gate.error }

  const qty = Math.trunc(newQuantity)
  if (!Number.isInteger(qty) || qty < 1) return { error: 'Quantidade deve ser ao menos 1.' }

  const line = await loadLine(lineId, appointmentId)
  if (!line || !line.active) return { error: 'Linha de material não encontrada.' }

  const admin = createAdminClient()
  const delta = qty - line.quantity
  if (delta !== 0) {
    const { data: ok } = await admin.rpc('adjust_material_color_stock', {
      p_color_id: line.color_id,
      p_salon_id: gate.salon_id,
      p_delta: -delta,
    })
    if (!ok) return { error: 'estoque_insumo_insuficiente' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('appointment_materials').update({ quantity: qty }).eq('id', lineId)
  if (error) {
    if (delta !== 0)
      await admin.rpc('adjust_material_color_stock', { p_color_id: line.color_id, p_salon_id: gate.salon_id, p_delta: delta })
    return { error: error.message }
  }

  revalidatePath(`/admin/agenda/${appointmentId}`)
  revalidatePath('/admin/agenda')
  return {}
}

// ── Remover linha (soft delete; devolve tudo) ──
export async function removeComandaMaterialAction(
  appointmentId: string,
  lineId: string
): Promise<MaterialLineResult> {
  const gate = await gateComanda(appointmentId)
  if ('error' in gate) return { error: gate.error }

  const line = await loadLine(lineId, appointmentId)
  if (!line || !line.active) return { error: 'Linha de material não encontrada.' }

  const admin = createAdminClient()
  const supabase = await createClient()
  const { error } = await supabase.from('appointment_materials').update({ active: false }).eq('id', lineId)
  if (error) return { error: error.message }

  await admin.rpc('adjust_material_color_stock', {
    p_color_id: line.color_id,
    p_salon_id: gate.salon_id,
    p_delta: line.quantity,
  })

  revalidatePath(`/admin/agenda/${appointmentId}`)
  revalidatePath('/admin/agenda')
  return {}
}
