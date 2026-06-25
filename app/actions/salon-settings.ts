"use server"

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import type { SalonSettingsRow } from '@/lib/types/database'

export type SalonSettingsActionResult = { success: true } | { error: string }

export async function getSalonSettings(): Promise<SalonSettingsRow | null> {
  const profile = await getSessionProfile()
  const supabase = await createClient()
  const { data } = await supabase
    .from('salon_settings')
    .select('*')
    .eq('salon_id', profile.salon_id)
    .single()
  return data ?? null
}

export async function updateDepositSettings(
  prevState: SalonSettingsActionResult | undefined,
  formData: FormData
): Promise<SalonSettingsActionResult> {
  const profile = await getSessionProfile()
  if (!['dono', 'gerente'].includes(profile.role)) return { error: 'Sem permissão.' }

  const enabledRaw = formData.get('deposit_enabled')
  const deposit_enabled = enabledRaw === 'true' || enabledRaw === '1'

  if (!deposit_enabled) {
    const supabase = await createClient()
    const { error } = await supabase
      .from('salon_settings')
      .update({ deposit_enabled: false, deposit_type: null, deposit_value: null })
      .eq('salon_id', profile.salon_id)
    if (error) return { error: error.message }
    revalidatePath('/admin/configuracoes')
    return { success: true }
  }

  const typeRaw = (formData.get('deposit_type') as string | null)?.trim()
  if (typeRaw !== 'fixed' && typeRaw !== 'percent')
    return { error: 'Tipo de sinal inválido.' }

  const valueRaw = (formData.get('deposit_value') as string | null)?.trim()
  const deposit_value = valueRaw ? parseFloat(valueRaw) : null

  if (!deposit_value || deposit_value <= 0)
    return { error: 'Valor do sinal deve ser maior que zero.' }
  if (typeRaw === 'percent' && deposit_value > 100)
    return { error: 'Porcentagem não pode ultrapassar 100%.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('salon_settings')
    .update({ deposit_enabled: true, deposit_type: typeRaw, deposit_value })
    .eq('salon_id', profile.salon_id)

  if (error) return { error: error.message }
  revalidatePath('/admin/configuracoes')
  return { success: true }
}

// Comissão sobre venda de produto: liga/desliga + modalidade (por_profissional | por_produto).
// Trocar de modalidade depois é permitido; não migra valores entre as fontes (cada uma é configurada
// do zero). A coluna oposta permanece persistida mas ignorada.
export async function updateProductCommissionSettings(
  prevState: SalonSettingsActionResult | undefined,
  formData: FormData
): Promise<SalonSettingsActionResult> {
  const profile = await getSessionProfile()
  if (!['dono', 'gerente'].includes(profile.role)) return { error: 'Sem permissão.' }

  const enabledRaw = formData.get('product_commission_enabled')
  const enabled = enabledRaw === 'true' || enabledRaw === '1'

  const supabase = await createClient()

  if (!enabled) {
    const { error } = await supabase
      .from('salon_settings')
      .update({ product_commission_enabled: false, product_commission_mode: null })
      .eq('salon_id', profile.salon_id)
    if (error) return { error: error.message }
    revalidatePath('/admin/configuracoes')
    return { success: true }
  }

  const mode = (formData.get('product_commission_mode') as string | null)?.trim()
  if (mode !== 'por_profissional' && mode !== 'por_produto')
    return { error: 'Selecione a modalidade da comissão.' }

  const { error } = await supabase
    .from('salon_settings')
    .update({ product_commission_enabled: true, product_commission_mode: mode })
    .eq('salon_id', profile.salon_id)
  if (error) return { error: error.message }
  revalidatePath('/admin/configuracoes')
  return { success: true }
}

// Toggle: repassar a taxa de cartão ao cliente. Config única por salão. NÃO altera total/saldo/amount —
// só decide se a UI soma a taxa ao valor cobrado no cartão (ver lib/payments/card-fee.ts e CLAUDE.md).
export async function updateCardFeePassthroughSetting(
  prevState: SalonSettingsActionResult | undefined,
  formData: FormData
): Promise<SalonSettingsActionResult> {
  const profile = await getSessionProfile()
  if (!['dono', 'gerente'].includes(profile.role)) return { error: 'Sem permissão.' }

  const raw = formData.get('card_fee_passthrough_enabled')
  const enabled = raw === 'true' || raw === '1'

  const supabase = await createClient()
  const { error } = await supabase
    .from('salon_settings')
    .update({ card_fee_passthrough_enabled: enabled })
    .eq('salon_id', profile.salon_id)
  if (error) return { error: error.message }
  revalidatePath('/admin/configuracoes')
  return { success: true }
}

// Toggle: permitir editar preço de produto direto na comanda.
export async function updateProductPriceEditSetting(
  prevState: SalonSettingsActionResult | undefined,
  formData: FormData
): Promise<SalonSettingsActionResult> {
  const profile = await getSessionProfile()
  if (!['dono', 'gerente'].includes(profile.role)) return { error: 'Sem permissão.' }

  const raw = formData.get('allow_edit_product_price')
  const allow = raw === 'true' || raw === '1'

  const supabase = await createClient()
  const { error } = await supabase
    .from('salon_settings')
    .update({ allow_edit_product_price: allow })
    .eq('salon_id', profile.salon_id)
  if (error) return { error: error.message }
  revalidatePath('/admin/configuracoes')
  return { success: true }
}
