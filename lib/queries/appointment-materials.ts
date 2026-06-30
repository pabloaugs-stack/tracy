import { createClient } from '@/lib/supabase/server'
import type { MaterialType } from '@/lib/types/database'

export type AppointmentMaterialLine = {
  id: string
  type: MaterialType
  color_id: string
  quantity: number
  consumption_unit_snapshot: string | null
  color: { name: string; consumption_unit: string }
}

// Linhas de material ATIVAS de uma comanda, com nome e unidade de consumo da cor.
export async function getActiveAppointmentMaterials(
  appointmentId: string
): Promise<AppointmentMaterialLine[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('appointment_materials')
    .select(`
      id, type, color_id, quantity, consumption_unit_snapshot,
      color:material_colors!appointment_materials_color_id_fkey(name, consumption_unit)
    `)
    .eq('appointment_id', appointmentId)
    .eq('active', true)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as unknown as AppointmentMaterialLine[]
}
