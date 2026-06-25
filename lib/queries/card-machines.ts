import { createClient } from '@/lib/supabase/server'
import type { CardMachineRow, CardMachineBrandRow, CardInstallmentFeeRow } from '@/lib/types/database'

export type CardInstallmentFee = CardInstallmentFeeRow
export type CardBrandWithFees = CardMachineBrandRow & { installments: CardInstallmentFee[] }
export type CardMachineTree = CardMachineRow & {
  payment_method: { id: string; name: string } | null
  brands: CardBrandWithFees[]
}

// Árvore completa de cartão do salão: maquininhas → bandeiras → parcelamentos. Traz ativos E inativos
// (a UI de configuração mostra ambos com Inativar/Reativar). Ordenação estável para render previsível.
export async function listCardMachineTree(salonId: string): Promise<CardMachineTree[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('card_machines')
    .select(`
      *,
      payment_method:payment_methods!card_machines_payment_method_id_fkey(id, name),
      brands:card_machine_brands!card_machine_brands_card_machine_id_fkey(
        *,
        installments:card_installment_fees!card_installment_fees_card_machine_brand_id_fkey(*)
      )
    `)
    .eq('salon_id', salonId)
    .order('name', { ascending: true })

  if (error) throw error

  const tree = (data ?? []) as unknown as CardMachineTree[]
  // Ordena bandeiras por nome e parcelamentos por nº de parcelas (PostgREST não garante ordem em embeds).
  for (const m of tree) {
    m.brands = (m.brands ?? []).sort((a, b) => a.brand.localeCompare(b.brand))
    for (const b of m.brands) {
      b.installments = (b.installments ?? []).sort((a, c) => a.installments - c.installments)
    }
  }
  return tree
}

// Só os nós ativos nos 3 níveis — para o modal de fechamento (não oferecer maquininha/bandeira/
// parcelamento inativos como opção de pagamento).
export async function listActiveCardMachineTree(salonId: string): Promise<CardMachineTree[]> {
  const tree = await listCardMachineTree(salonId)
  return tree
    .filter((m) => m.active)
    .map((m) => ({
      ...m,
      brands: m.brands
        .filter((b) => b.active)
        .map((b) => ({ ...b, installments: b.installments.filter((i) => i.active) })),
    }))
}
