import { createClient } from '@/lib/supabase/server'
import type { ServiceRow } from '@/lib/types/database'

export async function listServicesBySalon(salonId: string): Promise<ServiceRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('services')
    .select('*')
    .eq('salon_id', salonId)
    .order('name', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function getServiceById(id: string): Promise<ServiceRow | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('services')
    .select('*')
    .eq('id', id)
    .single()
  return data
}

export async function listActiveServicesBySalon(salonId: string): Promise<ServiceRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('services')
    .select('*')
    .eq('salon_id', salonId)
    .eq('active', true)
    .order('name', { ascending: true })
  if (error) throw error
  return data ?? []
}
