import { createClient } from '@/lib/supabase/server'
import type { ClientRow } from '@/lib/types/database'

export async function listClients(salonId: string): Promise<ClientRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('salon_id', salonId)
    .order('name', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function getClientById(id: string): Promise<ClientRow | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .single()
  return data
}
