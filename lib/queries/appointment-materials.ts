import { createClient } from '@/lib/supabase/server'
import type { MaterialType } from '@/lib/types/database'

export type AppointmentMaterialLine = {
  id: string
  type: MaterialType
  color_id: string
  quantity: number
  color: { name: string }
}

// Linhas de material ATIVAS de uma comanda, com nome da cor.
export async function getActiveAppointmentMaterials(
  appointmentId: string
): Promise<AppointmentMaterialLine[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('appointment_materials')
    .select(`
      id, type, color_id, quantity,
      color:material_colors!appointment_materials_color_id_fkey(name)
    `)
    .eq('appointment_id', appointmentId)
    .eq('active', true)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as unknown as AppointmentMaterialLine[]
}
