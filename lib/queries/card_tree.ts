import { createClient } from '@/lib/supabase/server'

export type InstallmentFeeResult = {
  feePercent: number
  installments: number
  brand: string
}

// Valida a combinação (maquininha → bandeira → parcelamento) e devolve a taxa daquele parcelamento.
// Confere: parcelamento pertence à bandeira; bandeira pertence à maquininha; os 3 são do salão e
// estão active=true. Retorna null se qualquer elo quebrar — o caller trata como árvore inconsistente.
export async function getInstallmentFee(
  machineId: string,
  brandId: string,
  installmentId: string,
  salonId: string
): Promise<InstallmentFeeResult | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('card_installment_fees')
    .select(`
      id, fee_percent, installments, active, salon_id, card_machine_brand_id,
      brand:card_machine_brands!card_installment_fees_card_machine_brand_id_fkey(
        id, brand, active, salon_id, card_machine_id,
        machine:card_machines!card_machine_brands_card_machine_id_fkey(id, active, salon_id)
      )
    `)
    .eq('id', installmentId)
    .eq('salon_id', salonId)
    .maybeSingle()

  if (error || !data) return null

  type Row = {
    id: string; fee_percent: number; installments: number; active: boolean; salon_id: string; card_machine_brand_id: string
    brand: {
      id: string; brand: string; active: boolean; salon_id: string; card_machine_id: string
      machine: { id: string; active: boolean; salon_id: string } | null
    } | null
  }
  const r = data as unknown as Row

  if (!r.active || r.card_machine_brand_id !== brandId) return null
  const brand = r.brand
  if (!brand || !brand.active || brand.salon_id !== salonId || brand.id !== brandId || brand.card_machine_id !== machineId) return null
  const machine = brand.machine
  if (!machine || !machine.active || machine.salon_id !== salonId || machine.id !== machineId) return null

  return { feePercent: Number(r.fee_percent), installments: r.installments, brand: brand.brand }
}
