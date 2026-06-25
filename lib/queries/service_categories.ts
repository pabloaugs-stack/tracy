import { createClient } from '@/lib/supabase/server'
import type { ServiceCategoryRow } from '@/lib/types/database'

export async function listCategories(salonId: string): Promise<ServiceCategoryRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('service_categories')
    .select('*')
    .eq('salon_id', salonId)
    .order('name', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function getCategoryById(id: string): Promise<ServiceCategoryRow | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('service_categories')
    .select('*')
    .eq('id', id)
    .single()
  return data
}
