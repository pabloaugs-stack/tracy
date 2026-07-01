import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { UserRole } from '@/lib/types/database'

export type SessionProfile = {
  id: string
  role: UserRole
  salon_id: string
  name: string
  can_create_appointments: boolean
  can_manage_clients: boolean
  can_close_appointments: boolean
  can_view_financial: boolean
  can_manage_catalog_services: boolean
  can_manage_catalog_products: boolean
  can_view_other_agendas: boolean
  can_view_other_clients: boolean
  discount_limit_percent: number | null
  can_edit_commission: boolean
}

export async function getSessionProfile(): Promise<SessionProfile> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Admin client bypassa o RLS — necessário porque a política SELECT da tabela
  // users usa auth_salon_id() que lê de users, criando dependência circular.
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users')
    .select('id, role, salon_id, name, can_create_appointments, can_manage_clients, can_close_appointments, can_view_financial, can_manage_catalog_services, can_manage_catalog_products, can_view_other_agendas, can_view_other_clients, discount_limit_percent, can_edit_commission')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')
  return profile as unknown as SessionProfile
}
