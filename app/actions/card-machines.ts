'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { AUG_CARD_TEMPLATE } from '@/lib/card-templates'
import type { CardBrand } from '@/lib/types/database'

export type CardActionResult = { success: true } | { error: string }

const VALID_BRANDS: CardBrand[] = ['visa', 'mastercard', 'elo', 'amex', 'outro']

async function requireManager() {
  const profile = await getSessionProfile()
  if (!['dono', 'gerente'].includes(profile.role)) throw new Error('Sem permissão.')
  return profile
}

function parsePercent(raw: FormDataEntryValue | null): number | null {
  const s = (raw as string | null)?.trim().replace(',', '.')
  if (s === undefined || s === null || s === '') return 0
  const n = Number(s)
  if (Number.isNaN(n) || n < 0) return null
  return n
}

// ── Nível 1: maquininha ──
export async function createCardMachineAction(formData: FormData): Promise<CardActionResult> {
  try {
    const profile = await requireManager()
    const supabase = await createClient()

    const name = (formData.get('name') as string | null)?.trim()
    if (!name) return { error: 'Nome da maquininha é obrigatório.' }

    let paymentMethodId = (formData.get('payment_method_id') as string | null)?.trim() || null
    const newMethodName = (formData.get('new_method_name') as string | null)?.trim() || null
    const useTemplate = formData.get('use_template') === 'true'

    // Vincular a um payment_method de crédito existente OU criar um novo inline (kind='credito').
    if (!paymentMethodId) {
      if (!newMethodName) return { error: 'Selecione uma forma de pagamento de crédito ou crie uma nova.' }
      const { data: pm, error: pmErr } = await supabase
        .from('payment_methods')
        .insert({ salon_id: profile.salon_id, name: newMethodName, kind: 'credito' })
        .select('id')
        .single()
      if (pmErr || !pm) return { error: pmErr?.message ?? 'Falha ao criar forma de pagamento.' }
      paymentMethodId = pm.id
    } else {
      // Confirma que a forma escolhida é do salão e de crédito.
      const { data: pm } = await supabase
        .from('payment_methods')
        .select('id, kind')
        .eq('id', paymentMethodId)
        .eq('salon_id', profile.salon_id)
        .single()
      if (!pm) return { error: 'Forma de pagamento não encontrada.' }
      if (pm.kind !== 'credito') return { error: 'A forma de pagamento precisa ser do tipo crédito.' }
    }

    const { data: machine, error } = await supabase
      .from('card_machines')
      .insert({ salon_id: profile.salon_id, payment_method_id: paymentMethodId, name })
      .select('id')
      .single()
    if (error || !machine) return { error: error?.message ?? 'Falha ao criar maquininha.' }

    if (useTemplate) {
      for (const t of AUG_CARD_TEMPLATE) {
        const { data: brand, error: bErr } = await supabase
          .from('card_machine_brands')
          .insert({
            salon_id: profile.salon_id,
            card_machine_id: machine.id,
            brand: t.brand,
            is_aug_template: true,
          })
          .select('id')
          .single()
        if (bErr || !brand) return { error: bErr?.message ?? 'Falha ao aplicar template AUG.' }
        if (t.installments.length > 0) {
          const { error: iErr } = await supabase.from('card_installment_fees').insert(
            t.installments.map((i) => ({
              salon_id: profile.salon_id,
              card_machine_brand_id: brand.id,
              installments: i.installments,
              fee_percent: i.fee_percent,
              is_aug_template: true,
            }))
          )
          if (iErr) return { error: iErr.message }
        }
      }
    }

    revalidatePath('/admin/configuracoes')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro desconhecido.' }
  }
}

export async function updateCardMachineAction(id: string, formData: FormData): Promise<CardActionResult> {
  try {
    const profile = await requireManager()
    const supabase = await createClient()
    const name = (formData.get('name') as string | null)?.trim()
    if (!name) return { error: 'Nome da maquininha é obrigatório.' }
    const { error } = await supabase
      .from('card_machines')
      .update({ name })
      .eq('id', id)
      .eq('salon_id', profile.salon_id)
    if (error) return { error: error.message }
    revalidatePath('/admin/configuracoes')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro desconhecido.' }
  }
}

export async function toggleCardMachineAction(id: string): Promise<CardActionResult> {
  return toggleRow('card_machines', id)
}

// ── Nível 2: bandeira ──
export async function addBrandAction(machineId: string, formData: FormData): Promise<CardActionResult> {
  try {
    const profile = await requireManager()
    const supabase = await createClient()

    const brand = (formData.get('brand') as string | null)?.trim() as CardBrand
    if (!brand || !VALID_BRANDS.includes(brand)) return { error: 'Bandeira inválida.' }

    // Confirma posse da maquininha (RLS só checa salon_id na linha nova, não o pai).
    const { data: machine } = await supabase
      .from('card_machines').select('id').eq('id', machineId).eq('salon_id', profile.salon_id).single()
    if (!machine) return { error: 'Maquininha não encontrada.' }

    // "À vista" não é mais campo da bandeira — é a linha 1x na lista de parcelamento (adicionada à parte).
    const { error } = await supabase.from('card_machine_brands').insert({
      salon_id: profile.salon_id,
      card_machine_id: machineId,
      brand,
    })
    if (error) {
      if (error.code === '23505') return { error: 'Essa bandeira já existe nesta maquininha.' }
      return { error: error.message }
    }
    revalidatePath('/admin/configuracoes')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro desconhecido.' }
  }
}

export async function updateBrandAction(id: string, formData: FormData): Promise<CardActionResult> {
  try {
    const profile = await requireManager()
    const supabase = await createClient()
    const fee = parsePercent(formData.get('upfront_fee_percent'))
    if (fee === null) return { error: 'Taxa à vista inválida.' }
    const { error } = await supabase
      .from('card_machine_brands')
      .update({ upfront_fee_percent: fee })
      .eq('id', id)
      .eq('salon_id', profile.salon_id)
    if (error) return { error: error.message }
    revalidatePath('/admin/configuracoes')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro desconhecido.' }
  }
}

export async function toggleBrandAction(id: string): Promise<CardActionResult> {
  return toggleRow('card_machine_brands', id)
}

// ── Nível 3: parcelamento ──
export async function addInstallmentAction(brandId: string, formData: FormData): Promise<CardActionResult> {
  try {
    const profile = await requireManager()
    const supabase = await createClient()

    const installments = Number((formData.get('installments') as string | null)?.trim())
    if (!Number.isInteger(installments) || installments < 1) return { error: 'Número de parcelas inválido.' }
    const fee = parsePercent(formData.get('fee_percent'))
    if (fee === null) return { error: 'Taxa inválida.' }

    const { data: brand } = await supabase
      .from('card_machine_brands').select('id').eq('id', brandId).eq('salon_id', profile.salon_id).single()
    if (!brand) return { error: 'Bandeira não encontrada.' }

    const { error } = await supabase.from('card_installment_fees').insert({
      salon_id: profile.salon_id,
      card_machine_brand_id: brandId,
      installments,
      fee_percent: fee,
    })
    if (error) {
      if (error.code === '23505') return { error: `Já existe linha para ${installments}x nesta bandeira.` }
      return { error: error.message }
    }
    revalidatePath('/admin/configuracoes')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro desconhecido.' }
  }
}

export async function updateInstallmentAction(id: string, formData: FormData): Promise<CardActionResult> {
  try {
    const profile = await requireManager()
    const supabase = await createClient()
    const fee = parsePercent(formData.get('fee_percent'))
    if (fee === null) return { error: 'Taxa inválida.' }
    const { error } = await supabase
      .from('card_installment_fees')
      .update({ fee_percent: fee })
      .eq('id', id)
      .eq('salon_id', profile.salon_id)
    if (error) return { error: error.message }
    revalidatePath('/admin/configuracoes')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro desconhecido.' }
  }
}

export async function toggleInstallmentAction(id: string): Promise<CardActionResult> {
  return toggleRow('card_installment_fees', id)
}

// Toggle genérico de soft delete (active) escopado por salão, para os 3 níveis da árvore.
async function toggleRow(
  table: 'card_machines' | 'card_machine_brands' | 'card_installment_fees',
  id: string
): Promise<CardActionResult> {
  try {
    const profile = await requireManager()
    const supabase = await createClient()
    const { data: row } = await supabase
      .from(table).select('active').eq('id', id).eq('salon_id', profile.salon_id).single()
    if (!row) return { error: 'Registro não encontrado.' }
    const { error } = await supabase
      .from(table).update({ active: !row.active }).eq('id', id).eq('salon_id', profile.salon_id)
    if (error) return { error: error.message }
    revalidatePath('/admin/configuracoes')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro desconhecido.' }
  }
}
