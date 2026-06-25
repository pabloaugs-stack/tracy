import { createClient } from '@/lib/supabase/server'
import type { MaterialColorRow } from '@/lib/types/database'

export async function listActiveColors(salonId: string): Promise<MaterialColorRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('material_colors')
    .select('*')
    .eq('salon_id', salonId)
    .eq('active', true)
    .order('name', { ascending: true })
  if (error) throw error
  return data ?? []
}
