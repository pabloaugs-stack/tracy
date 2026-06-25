import { createClient } from '@/lib/supabase/server'
import type { UserRow } from '@/lib/types/database'

export async function listTeamMembers(salonId: string, active?: boolean): Promise<UserRow[]> {
  const supabase = await createClient()
  const base = supabase
    .from('users')
    .select('*')
    .eq('salon_id', salonId)
    .order('name', { ascending: true })
  const { data, error } = await (active !== undefined ? base.eq('active', active) : base)
  if (error) throw error
  return data ?? []
}

export async function getTeamMemberById(id: string): Promise<UserRow | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .single()
  return data ?? null
}

// Apenas trancistas e auxiliares ativos — usados na seleção de profissionais de uma comanda
export async function listProfessionals(salonId: string): Promise<UserRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('salon_id', salonId)
    .in('role', ['trancista', 'auxiliar'])
    .eq('active', true)
    .order('name', { ascending: true })
  if (error) throw error
  return data ?? []
}
