import { createClient } from '@/lib/supabase/server'
import type { AppointmentPaymentType, PaymentMethodKind, CardBrand } from '@/lib/types/database'

export type AppointmentPaymentCompact = {
  id: string
  payment_type: AppointmentPaymentType
  amount: number
  paid_at: string
  active: boolean
  fee_amount: number | null
  payment_method: { id: string; name: string; kind: PaymentMethodKind }
  // Preenchido só em finais de crédito (para exibir bandeira/parcelas no detalhe).
  card_brand: { brand: CardBrand } | null
  card_installment: { installments: number } | null
}

const SELECT = `
  id,
  payment_type,
  amount,
  paid_at,
  active,
  fee_amount,
  payment_method:payment_methods!appointment_payments_payment_method_id_fkey(id, name, kind),
  card_brand:card_machine_brands!appointment_payments_card_brand_id_fkey(brand),
  card_installment:card_installment_fees!appointment_payments_card_installment_id_fkey(installments)
`

export async function getAppointmentPayments(
  appointmentId: string
): Promise<AppointmentPaymentCompact[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('appointment_payments')
    .select(SELECT)
    .eq('appointment_id', appointmentId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as AppointmentPaymentCompact[]
}

// Só os pagamentos ativos (sinal + finais). Usado por relatórios/testes e pelo cálculo de saldo.
export async function getActivePayments(
  appointmentId: string
): Promise<AppointmentPaymentCompact[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('appointment_payments')
    .select(SELECT)
    .eq('appointment_id', appointmentId)
    .eq('active', true)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as AppointmentPaymentCompact[]
}
