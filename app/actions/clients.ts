"use server"

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'

export type ClientActionState = { error: string } | undefined

export async function createClientAction(
  prevState: ClientActionState,
  formData: FormData
): Promise<ClientActionState> {
  const name = (formData.get('name') as string | null)?.trim()
  if (!name) return { error: 'Nome é obrigatório.' }

  const profile = await getSessionProfile()
  if (!profile.can_manage_clients) {
    return { error: 'sem_permissao_gerenciar_clientes' }
  }

  const supabase = await createClient()

  const { error } = await supabase.from('clients').insert({
    salon_id: profile.salon_id,
    name,
    phone: (formData.get('phone') as string | null)?.trim() || null,
    email: (formData.get('email') as string | null)?.trim() || null,
    notes: (formData.get('notes') as string | null)?.trim() || null,
  })

  if (error) return { error: error.message }
  redirect('/admin/clientes')
}

// Versão inline: cria o cliente e retorna o objeto criado, sem redirecionar.
// Usada no modal de nova comanda para já selecionar o cliente recém-criado.
export async function createClientInlineAction(
  formData: FormData
): Promise<{ id: string; name: string; phone: string | null } | { error: string }> {
  const name = (formData.get('name') as string | null)?.trim()
  if (!name) return { error: 'Nome é obrigatório.' }

  const profile = await getSessionProfile()
  if (!profile.can_manage_clients) {
    return { error: 'sem_permissao_gerenciar_clientes' }
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('clients')
    .insert({
      salon_id: profile.salon_id,
      name,
      phone: (formData.get('phone') as string | null)?.trim() || null,
    })
    .select('id, name, phone')
    .single()

  if (error || !data) return { error: error?.message ?? 'Erro ao criar cliente.' }
  return { id: data.id, name: data.name, phone: data.phone }
}

export async function updateClientAction(
  clientId: string,
  prevState: ClientActionState,
  formData: FormData
): Promise<ClientActionState> {
  const name = (formData.get('name') as string | null)?.trim()
  if (!name) return { error: 'Nome é obrigatório.' }

  const profile = await getSessionProfile()
  if (!profile.can_manage_clients) {
    return { error: 'sem_permissao_gerenciar_clientes' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sessão expirada.' }

  const { error } = await supabase
    .from('clients')
    .update({
      name,
      phone: (formData.get('phone') as string | null)?.trim() || null,
      email: (formData.get('email') as string | null)?.trim() || null,
      notes: (formData.get('notes') as string | null)?.trim() || null,
    })
    .eq('id', clientId)

  if (error) return { error: error.message }
  redirect('/admin/clientes')
}

export async function deleteClientAction(clientId: string, _formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  await supabase.from('clients').delete().eq('id', clientId)
  redirect('/admin/clientes')
}
