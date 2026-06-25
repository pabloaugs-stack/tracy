"use server"

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import type { PaymentMethodKind } from '@/lib/types/database'

export type PaymentMethodActionResult = { success: true } | { error: string }

const VALID_KINDS: PaymentMethodKind[] = ['dinheiro', 'pix', 'debito', 'credito', 'outro']

async function requireManagerRole() {
  const profile = await getSessionProfile()
  if (!['dono', 'gerente'].includes(profile.role)) throw new Error('Sem permissão.')
  return profile
}

export async function createPaymentMethodAction(
  prevState: PaymentMethodActionResult | undefined,
  formData: FormData
): Promise<PaymentMethodActionResult> {
  try {
    const profile = await requireManagerRole()

    const name = (formData.get('name') as string | null)?.trim()
    const kindRaw = (formData.get('kind') as string | null)?.trim()

    if (!name) return { error: 'Nome é obrigatório.' }
    if (!kindRaw || !VALID_KINDS.includes(kindRaw as PaymentMethodKind))
      return { error: 'Tipo inválido.' }

    const supabase = await createClient()
    const { error } = await supabase.from('payment_methods').insert({
      salon_id: profile.salon_id,
      name,
      kind: kindRaw as PaymentMethodKind,
    })

    if (error) return { error: error.message }

    revalidatePath('/admin/configuracoes')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro desconhecido.' }
  }
}

export async function updatePaymentMethodAction(
  id: string,
  prevState: PaymentMethodActionResult | undefined,
  formData: FormData
): Promise<PaymentMethodActionResult> {
  try {
    const profile = await requireManagerRole()

    const name = (formData.get('name') as string | null)?.trim()
    const kindRaw = (formData.get('kind') as string | null)?.trim()

    if (!name) return { error: 'Nome é obrigatório.' }
    if (!kindRaw || !VALID_KINDS.includes(kindRaw as PaymentMethodKind))
      return { error: 'Tipo inválido.' }

    const supabase = await createClient()
    const { error } = await supabase
      .from('payment_methods')
      .update({ name, kind: kindRaw as PaymentMethodKind })
      .eq('id', id)
      .eq('salon_id', profile.salon_id)

    if (error) return { error: error.message }

    revalidatePath('/admin/configuracoes')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro desconhecido.' }
  }
}

export async function togglePaymentMethodAction(id: string): Promise<PaymentMethodActionResult> {
  try {
    const profile = await requireManagerRole()
    const supabase = await createClient()

    const { data: pm } = await supabase
      .from('payment_methods')
      .select('active')
      .eq('id', id)
      .eq('salon_id', profile.salon_id)
      .single()

    if (!pm) return { error: 'Forma de pagamento não encontrada.' }

    const { error } = await supabase
      .from('payment_methods')
      .update({ active: !pm.active })
      .eq('id', id)
      .eq('salon_id', profile.salon_id)

    if (error) return { error: error.message }

    revalidatePath('/admin/configuracoes')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro desconhecido.' }
  }
}
