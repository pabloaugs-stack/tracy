import { createClient } from '@/lib/supabase/server'
import type { PaymentMethodRow } from '@/lib/types/database'

export async function listActivePaymentMethods(salonId: string): Promise<PaymentMethodRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('payment_methods')
    .select('*')
    .eq('salon_id', salonId)
    .eq('active', true)
    .order('name', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function listAllPaymentMethods(salonId: string): Promise<PaymentMethodRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('payment_methods')
    .select('*')
    .eq('salon_id', salonId)
    .order('name', { ascending: true })
  if (error) throw error
  return data ?? []
}
