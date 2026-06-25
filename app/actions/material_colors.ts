"use server"

import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'

// Cria uma cor inline e retorna o objeto criado, sem redirecionar.
// Usada no modal da comanda para já selecionar a cor recém-criada.
export async function createMaterialColorInlineAction(
  formData: FormData
): Promise<{ id: string; name: string } | { error: string }> {
  const name = (formData.get('name') as string | null)?.trim()
  if (!name) return { error: 'Nome da cor é obrigatório.' }

  const profile = await getSessionProfile()
  if (!['dono', 'gerente', 'recepcionista'].includes(profile.role)) {
    return { error: 'Sem permissão.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('material_colors')
    .insert({ salon_id: profile.salon_id, name })
    .select('id, name')
    .single()

  if (error || !data) return { error: error?.message ?? 'Erro ao criar cor.' }
  return { id: data.id, name: data.name }
}
