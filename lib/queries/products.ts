import { createClient } from '@/lib/supabase/server'
import type { ProductRow } from '@/lib/types/database'

// Lista produtos do salão. `active` undefined = todos; true/false filtra.
export async function listProductsBySalon(salonId: string, active?: boolean): Promise<ProductRow[]> {
  const supabase = await createClient()
  const base = supabase
    .from('products')
    .select('*')
    .eq('salon_id', salonId)
    .order('name', { ascending: true })
  const { data, error } = await (active !== undefined ? base.eq('active', active) : base)
  if (error) throw error
  return data ?? []
}

export async function listActiveProductsBySalon(salonId: string): Promise<ProductRow[]> {
  return listProductsBySalon(salonId, true)
}

export async function getProductById(id: string): Promise<ProductRow | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('products').select('*').eq('id', id).single()
  return data ?? null
}
