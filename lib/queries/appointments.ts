import { createClient } from '@/lib/supabase/server'
import type { AppointmentRow, UserRole, RoleInAppointment, MaterialType, DiscountType } from '@/lib/types/database'

export type AppointmentProfessionalCompact = {
  user_id: string
  role_in_appointment: RoleInAppointment
  user: { name: string }
}

export type AppointmentWithRelations = AppointmentRow & {
  client: { id: string; name: string }
  service: { id: string; name: string; price: number; estimated_duration_min: number | null }
  professionals: AppointmentProfessionalCompact[]
  materials: { type: MaterialType; color: { name: string } }[]
}

export type AppointmentProfessional = {
  user_id: string
  role_in_appointment: RoleInAppointment
  commission_override: number | null
  user: { name: string }
}

export type AppointmentMaterial = {
  id: string
  type: MaterialType
  color_id: string
  color: { name: string }
}

export type AppointmentDetail = AppointmentRow & {
  client: { id: string; name: string; phone: string | null }
  service: { id: string; name: string; price: number; estimated_duration_min: number | null }
  professionals: AppointmentProfessional[]
  materials: AppointmentMaterial[]
  discount_type: DiscountType | null
  discount_value: number | null
  total_override: number | null
}

// Retorna YYYY-MM-DD do dia seguinte (aritmética pura, sem depender de timezone do servidor)
function nextDateStr(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const next = new Date(y, m - 1, d + 1)
  return [
    next.getFullYear(),
    String(next.getMonth() + 1).padStart(2, '0'),
    String(next.getDate()).padStart(2, '0'),
  ].join('-')
}

const AGENDA_SELECT = `
  *,
  client:clients!appointments_client_id_fkey(id, name),
  service:services!appointments_service_id_fkey(id, name, price, estimated_duration_min),
  professionals:appointment_professionals!appointment_professionals_appointment_id_fkey(
    user_id,
    role_in_appointment,
    user:users!appointment_professionals_user_id_fkey(name)
  ),
  materials:appointment_materials!appointment_materials_appointment_id_fkey(
    type,
    color:material_colors!appointment_materials_color_id_fkey(name)
  )
`

export async function listAppointmentsByDay(
  salonId: string,
  dateStr: string,
  role?: UserRole,
  userId?: string
): Promise<AppointmentWithRelations[]> {
  const supabase = await createClient()

  // Limites de dia no timezone de Brasília: [início_do_dia, início_do_dia_seguinte)
  // Usar .lt() exclusivo evita perder sub-segundos que .lte('23:59:59.999') deixaria escapar
  const start = `${dateStr}T00:00:00-03:00`
  const end = `${nextDateStr(dateStr)}T00:00:00-03:00`

  // Trancista e auxiliar veem apenas as próprias comandas (2ª camada além da RLS)
  if ((role === 'trancista' || role === 'auxiliar') && userId) {
    const { data: links } = await supabase
      .from('appointment_professionals')
      .select('appointment_id')
      .eq('user_id', userId)

    const ids = (links ?? []).map((l) => l.appointment_id)
    if (ids.length === 0) return []

    const { data, error } = await supabase
      .from('appointments')
      .select(AGENDA_SELECT)
      .eq('salon_id', salonId)
      .in('id', ids)
      .gte('scheduled_at', start)
      .lt('scheduled_at', end)
      .order('scheduled_at', { ascending: true })

    if (error) throw error
    return (data ?? []) as unknown as AppointmentWithRelations[]
  }

  // Dono, gerente, recepcionista: todas as comandas da data
  const { data, error } = await supabase
    .from('appointments')
    .select(AGENDA_SELECT)
    .eq('salon_id', salonId)
    .gte('scheduled_at', start)
    .lt('scheduled_at', end)
    .order('scheduled_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as unknown as AppointmentWithRelations[]
}

export async function getAppointmentById(id: string): Promise<AppointmentDetail | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('appointments')
    .select(`
      *,
      client:clients!appointments_client_id_fkey(id, name, phone),
      service:services!appointments_service_id_fkey(id, name, price, estimated_duration_min),
      professionals:appointment_professionals!appointment_professionals_appointment_id_fkey(
        user_id,
        role_in_appointment,
        commission_override,
        user:users!appointment_professionals_user_id_fkey(name)
      ),
      materials:appointment_materials!appointment_materials_appointment_id_fkey(
        id,
        type,
        color_id,
        color:material_colors!appointment_materials_color_id_fkey(name)
      )
    `)
    .eq('id', id)
    .single()

  if (error || !data) return null
  return data as unknown as AppointmentDetail
}
