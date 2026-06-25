"use server"

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'

export type ServiceActionState = { error: string } | undefined

const AUG_TEMPLATES = [
  { name: 'Gypsy Braids', services: ['Gypsy Braids P', 'Gypsy Braids M', 'Gypsy Braids G'] },
  { name: 'Knotless Braids', services: ['Knotless Braids P', 'Knotless Braids M', 'Knotless Braids G'] },
  { name: 'Box Braids', services: ['Box Braids P', 'Box Braids M', 'Box Braids G'] },
  { name: 'Nagôs', services: ['Nagôs P', 'Nagôs M', 'Nagôs G'] },
] as const

function parseNullablePositiveFloat(val: FormDataEntryValue | null): number | null {
  const n = parseFloat(val as string)
  return isNaN(n) || n <= 0 ? null : n
}

// ─── CATEGORIAS ──────────────────────────────────────────────────────────────

export async function createCategory(
  prevState: ServiceActionState,
  formData: FormData
): Promise<ServiceActionState> {
  const name = (formData.get('name') as string | null)?.trim()
  if (!name) return { error: 'Nome é obrigatório.' }

  const profile = await getSessionProfile()
  if (!profile.can_manage_catalog_services) return { error: 'Sem permissão para gerenciar catálogo.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('service_categories')
    .insert({ name, salon_id: profile.salon_id })

  if (error) return { error: error.message }
  redirect('/admin/catalogo')
}

export async function updateCategory(
  categoriaId: string,
  prevState: ServiceActionState,
  formData: FormData
): Promise<ServiceActionState> {
  const name = (formData.get('name') as string | null)?.trim()
  if (!name) return { error: 'Nome é obrigatório.' }

  const profile = await getSessionProfile()
  if (!profile.can_manage_catalog_services) return { error: 'Sem permissão para gerenciar catálogo.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('service_categories')
    .update({ name })
    .eq('id', categoriaId)

  if (error) return { error: error.message }
  redirect('/admin/catalogo')
}

export async function deleteCategory(categoriaId: string, _formData: FormData) {
  const profile = await getSessionProfile()
  if (!['dono', 'gerente'].includes(profile.role)) redirect('/admin/catalogo')

  const supabase = await createClient()
  await supabase.from('services').delete().eq('category_id', categoriaId)
  await supabase.from('service_categories').delete().eq('id', categoriaId)

  redirect('/admin/catalogo')
}

// ─── SERVIÇOS ────────────────────────────────────────────────────────────────

export async function createService(
  categoriaId: string,
  prevState: ServiceActionState,
  formData: FormData
): Promise<ServiceActionState> {
  const name = (formData.get('name') as string | null)?.trim()
  if (!name) return { error: 'Nome é obrigatório.' }

  const durationRaw = (formData.get('estimated_duration_min') as string | null)?.trim()
  const estimated_duration_min = durationRaw ? parseInt(durationRaw, 10) : NaN
  if (isNaN(estimated_duration_min) || estimated_duration_min <= 0)
    return { error: 'Duração estimada é obrigatória e deve ser maior que zero.' }

  const profile = await getSessionProfile()
  if (!profile.can_manage_catalog_services) return { error: 'Sem permissão para gerenciar catálogo.' }

  const supabase = await createClient()
  const price = parseFloat(formData.get('price') as string) || 0

  const { error } = await supabase.from('services').insert({
    name,
    price,
    estimated_duration_min,
    commission_default_trancista: parseNullablePositiveFloat(formData.get('commission_trancista')),
    commission_default_auxiliar: parseNullablePositiveFloat(formData.get('commission_auxiliar')),
    category_id: categoriaId,
    salon_id: profile.salon_id,
  })

  if (error) return { error: error.message }
  redirect('/admin/catalogo')
}

export async function updateService(
  servicoId: string,
  prevState: ServiceActionState,
  formData: FormData
): Promise<ServiceActionState> {
  const name = (formData.get('name') as string | null)?.trim()
  if (!name) return { error: 'Nome é obrigatório.' }

  const durationRaw = (formData.get('estimated_duration_min') as string | null)?.trim()
  const estimated_duration_min = durationRaw ? parseInt(durationRaw, 10) : NaN
  if (isNaN(estimated_duration_min) || estimated_duration_min <= 0)
    return { error: 'Duração estimada é obrigatória e deve ser maior que zero.' }

  const profile = await getSessionProfile()
  if (!profile.can_manage_catalog_services) return { error: 'Sem permissão para gerenciar catálogo.' }

  const supabase = await createClient()
  const price = parseFloat(formData.get('price') as string) || 0

  const { error } = await supabase
    .from('services')
    .update({
      name,
      price,
      estimated_duration_min,
      commission_default_trancista: parseNullablePositiveFloat(formData.get('commission_trancista')),
      commission_default_auxiliar: parseNullablePositiveFloat(formData.get('commission_auxiliar')),
    })
    .eq('id', servicoId)

  if (error) return { error: error.message }
  redirect('/admin/catalogo')
}

export async function deleteService(servicoId: string, _formData: FormData) {
  const profile = await getSessionProfile()
  if (!['dono', 'gerente'].includes(profile.role)) redirect('/admin/catalogo')

  const supabase = await createClient()
  await supabase.from('services').delete().eq('id', servicoId)
  redirect('/admin/catalogo')
}

// ─── TEMPLATES AUG ───────────────────────────────────────────────────────────

export async function importAugTemplates(_formData: FormData) {
  const profile = await getSessionProfile()
  if (!profile.can_manage_catalog_services) redirect('/admin/catalogo?erro=sem-permissao')

  const supabase = await createClient()
  const { salon_id } = profile

  const { data: existing } = await supabase
    .from('service_categories')
    .select('id')
    .eq('salon_id', salon_id)
    .eq('is_aug_template', true)
    .limit(1)

  if (existing && existing.length > 0) {
    redirect('/admin/catalogo?aviso=ja-importados')
  }

  for (const template of AUG_TEMPLATES) {
    const { data: category } = await supabase
      .from('service_categories')
      .insert({ name: template.name, salon_id, is_aug_template: true })
      .select('id')
      .single()

    if (!category) continue

    await supabase.from('services').insert(
      template.services.map((serviceName) => ({
        name: serviceName,
        salon_id,
        category_id: category.id,
        price: 0,
      }))
    )
  }

  redirect('/admin/catalogo?ok=templates-importados')
}
