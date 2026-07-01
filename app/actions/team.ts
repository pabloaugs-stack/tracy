"use server"

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionProfile } from '@/lib/auth/session'
import type { UserRole, CommissionType } from '@/lib/types/database'

export type TeamActionState = { error: string } | undefined
export type ToggleActionResult = { success: true } | { error: string }

type PermissionDefaults = {
  can_create_appointments: boolean
  can_manage_clients: boolean
  can_close_appointments: boolean
  can_view_financial: boolean
  can_manage_catalog_services: boolean
  can_manage_catalog_products: boolean
  can_view_other_agendas: boolean
  can_view_other_clients: boolean
  can_edit_commission: boolean
  discount_limit_percent: number | null
}

// Campos de comissão do perfil (Sprint 7 / Fatia 3). Parse + validação a partir do FormData da Equipe.
type CommissionFields = {
  commission_type: CommissionType
  commission_simple_percent: number | null
  commission_solo_percent: number | null
  commission_with_aux_percent: number | null
  commission_as_aux_percent: number | null
  product_commission_percent: number | null
}

function parsePercent(formData: FormData, key: string): number | null {
  const raw = (formData.get(key) as string | null)?.trim()
  if (!raw) return null
  const n = parseFloat(raw.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function parseCommissionFields(formData: FormData): { error: string } | { fields: CommissionFields } {
  const typeRaw = (formData.get('commission_type') as string | null)?.trim() ?? 'categoria'
  const commission_type = (['nao_comissiona', 'categoria', 'simples', 'avancado'].includes(typeRaw)
    ? typeRaw
    : 'categoria') as CommissionType

  const simple = parsePercent(formData, 'commission_simple_percent')
  const solo = parsePercent(formData, 'commission_solo_percent')
  const withAux = parsePercent(formData, 'commission_with_aux_percent')
  const asAux = parsePercent(formData, 'commission_as_aux_percent')
  const product = parsePercent(formData, 'product_commission_percent')

  for (const v of [simple, solo, withAux, asAux, product]) {
    if (v != null && (v < 0 || v > 100)) return { error: 'Percentual de comissão deve estar entre 0 e 100.' }
  }
  if (commission_type === 'simples' && !(simple != null && simple > 0)) {
    return { error: 'Informe a comissão única (maior que zero).' }
  }
  if (commission_type === 'avancado') {
    if (!(solo != null && solo > 0) || !(withAux != null && withAux > 0) || !(asAux != null && asAux > 0)) {
      return { error: 'Informe os três percentuais da comissão por papel (maiores que zero).' }
    }
  }

  return {
    fields: {
      commission_type,
      commission_simple_percent: simple,
      commission_solo_percent: solo,
      commission_with_aux_percent: withAux,
      commission_as_aux_percent: asAux,
      product_commission_percent: product,
    },
  }
}

function getRolePermissionDefaults(role: UserRole): PermissionDefaults {
  if (role === 'dono' || role === 'gerente') {
    return {
      can_create_appointments: true,
      can_manage_clients: true,
      can_close_appointments: true,
      // Financeiro: por padrão só o dono nasce com acesso (Sprint 7). Gerente/recepção ganham
      // a flag manualmente. Dono também tem acesso garantido pelo helper RLS, independente disto.
      can_view_financial: role === 'dono',
      can_manage_catalog_services: true,
      can_manage_catalog_products: true,
      can_view_other_agendas: true,
      can_view_other_clients: true,
      // dono/gerente sempre podem editar override por código; a flag nasce false.
      can_edit_commission: false,
      discount_limit_percent: null,
    }
  }
  if (role === 'recepcionista') {
    return {
      can_create_appointments: true,
      can_manage_clients: true,
      can_close_appointments: true,
      can_view_financial: false,
      can_manage_catalog_services: false,
      can_manage_catalog_products: false,
      can_view_other_agendas: true,
      can_view_other_clients: true,
      can_edit_commission: false,
      discount_limit_percent: null,
    }
  }
  // trancista, auxiliar
  return {
    can_create_appointments: false,
    can_manage_clients: false,
    can_close_appointments: false,
    can_view_financial: false,
    can_manage_catalog_services: false,
    can_manage_catalog_products: false,
    can_view_other_agendas: false,
    can_view_other_clients: false,
    can_edit_commission: false,
    discount_limit_percent: null,
  }
}

function readPermBool(formData: FormData, key: string, fallback: boolean): boolean {
  const val = formData.get(key)
  if (val === 'true') return true
  if (val === 'false') return false
  return fallback
}

const MANAGEABLE_ROLES: UserRole[] = ['trancista', 'auxiliar', 'recepcionista', 'gerente']

// Conta appointments futuros de um membro onde ela ainda precisa comparecer.
// Usa client normal — dono/gerente já têm acesso via RLS. Guard de role por segurança.
export async function getFutureAppointmentsCount(memberId: string): Promise<number> {
  const profile = await getSessionProfile()
  if (!['dono', 'gerente'].includes(profile.role)) return 0

  const supabase = await createClient()

  const { data: links } = await supabase
    .from('appointment_professionals')
    .select('appointment_id')
    .eq('user_id', memberId)

  const ids = (links ?? []).map((l) => l.appointment_id)
  if (ids.length === 0) return 0

  const { count } = await supabase
    .from('appointments')
    .select('*', { count: 'exact', head: true })
    .in('id', ids)
    .in('status', ['agendado', 'em_andamento'])
    .gte('scheduled_at', new Date().toISOString())

  return count ?? 0
}

export async function createTeamMemberAction(
  prevState: TeamActionState,
  formData: FormData
): Promise<TeamActionState> {
  const profile = await getSessionProfile()
  if (!['dono', 'gerente'].includes(profile.role)) return { error: 'Sem permissão.' }

  const name = (formData.get('name') as string | null)?.trim()
  const email = (formData.get('email') as string | null)?.trim()
  const role = formData.get('role') as string | null
  const phone = (formData.get('phone') as string | null)?.trim() || null

  if (!name) return { error: 'Nome é obrigatório.' }
  if (!email) return { error: 'Email é obrigatório.' }
  if (!role || !MANAGEABLE_ROLES.includes(role as UserRole)) return { error: 'Função inválida.' }

  const admin = createAdminClient()

  // Verifica se o email já existe na equipe deste salão
  const { data: existingMember } = await admin
    .from('users')
    .select('id')
    .eq('salon_id', profile.salon_id)
    .eq('email', email)
    .maybeSingle()

  if (existingMember) return { error: 'Este email já está cadastrado na equipe.' }

  // Cria registro em auth.users e envia convite por email.
  // O id retornado satisfaz a FK users_id_fkey (public.users.id → auth.users.id).
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    email,
    { redirectTo: `${siteUrl}/auth/accept-invite` }
  )

  if (inviteError || !inviteData?.user) {
    const msg = inviteError?.message ?? ''
    if (msg.toLowerCase().includes('already')) {
      return { error: 'Este email já possui conta ou convite pendente.' }
    }
    return { error: msg || 'Erro ao enviar convite.' }
  }

  // Permissões: usa valores do formData quando presentes, senão aplica defaults por role
  const defaults = getRolePermissionDefaults(role as UserRole)
  const perms: PermissionDefaults = {
    can_create_appointments: readPermBool(formData, 'perm_can_create_appointments', defaults.can_create_appointments),
    can_manage_clients: readPermBool(formData, 'perm_can_manage_clients', defaults.can_manage_clients),
    can_close_appointments: readPermBool(formData, 'perm_can_close_appointments', defaults.can_close_appointments),
    can_view_financial: readPermBool(formData, 'perm_can_view_financial', defaults.can_view_financial),
    can_manage_catalog_services: readPermBool(formData, 'perm_can_manage_catalog_services', defaults.can_manage_catalog_services),
    can_manage_catalog_products: readPermBool(formData, 'perm_can_manage_catalog_products', defaults.can_manage_catalog_products),
    can_view_other_agendas: readPermBool(formData, 'perm_can_view_other_agendas', defaults.can_view_other_agendas),
    can_view_other_clients: readPermBool(formData, 'perm_can_view_other_clients', defaults.can_view_other_clients),
    can_edit_commission: readPermBool(formData, 'perm_can_edit_commission', defaults.can_edit_commission),
    discount_limit_percent: defaults.discount_limit_percent,
  }

  const commissionParsed = parseCommissionFields(formData)
  if ('error' in commissionParsed) return { error: commissionParsed.error }

  // Insere o perfil vinculado ao salão com o id do auth user criado
  const { error: insertError } = await admin.from('users').insert({
    id: inviteData.user.id,
    salon_id: profile.salon_id,
    name,
    email,
    phone,
    role: role as UserRole,
    ...perms,
    ...commissionParsed.fields,
  })

  if (insertError) {
    // Remove o auth user criado para não deixar registro órfão
    await admin.auth.admin.deleteUser(inviteData.user.id)
    return { error: insertError.message }
  }

  redirect('/admin/equipe')
}

export async function updateTeamMemberAction(
  memberId: string,
  prevState: TeamActionState,
  formData: FormData
): Promise<TeamActionState> {
  const profile = await getSessionProfile()
  if (!['dono', 'gerente'].includes(profile.role)) return { error: 'Sem permissão.' }

  const name = (formData.get('name') as string | null)?.trim()
  const email = (formData.get('email') as string | null)?.trim()
  const role = formData.get('role') as string | null
  const phone = (formData.get('phone') as string | null)?.trim() || null

  if (!name) return { error: 'Nome é obrigatório.' }
  if (!email) return { error: 'Email é obrigatório.' }
  if (!role || !MANAGEABLE_ROLES.includes(role as UserRole)) return { error: 'Função inválida.' }

  const commissionParsed = parseCommissionFields(formData)
  if ('error' in commissionParsed) return { error: commissionParsed.error }

  const admin = createAdminClient()

  try {
    const { error } = await admin
      .from('users')
      .update({ name, email, phone, role: role as UserRole, ...commissionParsed.fields })
      .eq('id', memberId)
      .eq('salon_id', profile.salon_id)

    if (error) return { error: error.message }
  } catch {
    return { error: 'Erro ao atualizar membro da equipe.' }
  }

  revalidatePath('/admin/equipe')
  redirect('/admin/equipe')
}

export type PermissionsActionResult = { success: true } | { error: string }

type PermUpdate = {
  can_create_appointments?: boolean
  can_manage_clients?: boolean
  can_close_appointments?: boolean
  can_view_financial?: boolean
  can_manage_catalog_services?: boolean
  can_manage_catalog_products?: boolean
  can_view_other_agendas?: boolean
  can_view_other_clients?: boolean
  can_edit_commission?: boolean
  discount_limit_percent?: number | null
}

export async function updateTeamMemberPermissions(
  memberId: string,
  permissions: PermUpdate
): Promise<PermissionsActionResult> {
  const profile = await getSessionProfile()
  if (!['dono', 'gerente'].includes(profile.role)) return { error: 'Sem permissão.' }
  if (memberId === profile.id) return { error: 'Você não pode alterar suas próprias permissões.' }

  const BOOL_FLAGS: (keyof Omit<PermUpdate, 'discount_limit_percent'>)[] = [
    'can_create_appointments',
    'can_manage_clients',
    'can_close_appointments',
    'can_view_financial',
    'can_manage_catalog_services',
    'can_manage_catalog_products',
    'can_view_other_agendas',
    'can_view_other_clients',
    'can_edit_commission',
  ]

  const updates: PermUpdate = {}
  for (const flag of BOOL_FLAGS) {
    if (permissions[flag] !== undefined) updates[flag] = permissions[flag] as boolean
  }
  if ('discount_limit_percent' in permissions) {
    updates.discount_limit_percent = permissions.discount_limit_percent
  }
  if (Object.keys(updates).length === 0) return { success: true }

  const supabase = await createClient()
  const { error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', memberId)
    .eq('salon_id', profile.salon_id)

  if (error) return { error: error.message }

  revalidatePath('/admin/equipe')
  return { success: true }
}

export async function toggleTeamMemberAction(memberId: string): Promise<ToggleActionResult> {
  const profile = await getSessionProfile()
  if (!['dono', 'gerente'].includes(profile.role)) return { error: 'Sem permissão.' }

  const admin = createAdminClient()

  try {
    const { data: member } = await admin
      .from('users')
      .select('active')
      .eq('id', memberId)
      .eq('salon_id', profile.salon_id)
      .single()

    if (!member) return { error: 'Profissional não encontrada.' }

    const { error } = await admin
      .from('users')
      .update({ active: !member.active })
      .eq('id', memberId)

    if (error) return { error: error.message }
    return { success: true }
  } catch {
    return { error: 'Erro ao atualizar status.' }
  }
}
