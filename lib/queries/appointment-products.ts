import { createClient } from '@/lib/supabase/server'
import type { ProductUnit } from '@/lib/types/database'

export type AppointmentProductLine = {
  id: string
  product_id: string
  quantity: number
  unit_price: number
  sold_by_user_id: string | null
  sold_by_label: string | null
  commission_percent_snapshot: number | null
  product: { name: string; unit: ProductUnit }
}

// Linhas de produto ATIVAS de uma comanda, com nome/unidade do produto.
export async function getActiveAppointmentProducts(
  appointmentId: string
): Promise<AppointmentProductLine[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('appointment_products')
    .select(`
      id, product_id, quantity, unit_price, sold_by_user_id, sold_by_label, commission_percent_snapshot,
      product:products!appointment_products_product_id_fkey(name, unit)
    `)
    .eq('appointment_id', appointmentId)
    .eq('active', true)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as unknown as AppointmentProductLine[]
}

// Subtotal de produtos ativos (Σ quantity × unit_price). Usado no total da comanda.
export function sumProductsSubtotal(lines: { quantity: number; unit_price: number }[]): number {
  return lines.reduce((sum, l) => sum + l.quantity * Number(l.unit_price), 0)
}
