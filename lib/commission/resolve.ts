import type { CommissionType, CommissionRoleResolved, RoleInAppointment } from '@/lib/types/database'

// Resolução PURA (sem IO) do percentual de comissão de SERVIÇO de uma profissional numa comanda.
// Toda a regra de negócio da Fatia 3 vive aqui — o Server Action só junta os dados e chama esta função.
// Produto tem cálculo próprio (commission_percent_snapshot), não passa por aqui.

export type ResolveCommissionParams = {
  commissionType: CommissionType
  roleInAppointment: RoleInAppointment
  // A profissional atende sozinha? (trancista é a única profissional da comanda).
  // Calculado no Server Action a partir da contagem de profissionais — não rebuscar aqui.
  isSolo: boolean
  // Percentuais configurados no perfil da profissional (podem ser null quando não se aplicam ao tipo).
  commissionSimplePercent?: number | null
  commissionSoloPercent?: number | null
  commissionWithAuxPercent?: number | null
  commissionAsAuxPercent?: number | null
  // Padrões do serviço (modalidade 'categoria').
  categoryDefaultTrancista?: number | null
  categoryDefaultAuxiliar?: number | null
  // Override por comanda (appointment_professionals.commission_override).
  commissionOverride?: number | null
  // Gate do override: já resolvido no Server Action (dono/gerente OU can_edit_commission).
  canUseOverride: boolean
  // Perfil de quem está fechando — informativo/defensivo; a decisão real usa canUseOverride.
  commissionerProfile: { role: string; can_edit_commission: boolean }
}

export type ResolvedCommission = {
  percent: number
  roleResolved: CommissionRoleResolved
  overrideUsed: boolean
}

function toNum(v: number | null | undefined): number {
  return v == null ? 0 : Number(v)
}

export function resolveCommissionPercent(params: ResolveCommissionParams): ResolvedCommission {
  const {
    commissionType,
    roleInAppointment,
    isSolo,
    commissionSimplePercent,
    commissionSoloPercent,
    commissionWithAuxPercent,
    commissionAsAuxPercent,
    categoryDefaultTrancista,
    categoryDefaultAuxiliar,
    commissionOverride,
    canUseOverride,
    commissionerProfile,
  } = params

  // 1. Papel real naquela comanda.
  let roleResolved: CommissionRoleResolved
  if (roleInAppointment === 'auxiliar') {
    roleResolved = 'como_auxiliar'
  } else {
    roleResolved = isSolo ? 'sozinha' : 'com_auxiliar'
  }

  // 2. Percentual conforme o tipo de comissão configurado no perfil.
  let percent: number
  switch (commissionType) {
    case 'nao_comissiona':
      percent = 0
      break
    case 'simples':
      percent = toNum(commissionSimplePercent)
      break
    case 'avancado':
      percent =
        roleResolved === 'sozinha'
          ? toNum(commissionSoloPercent)
          : roleResolved === 'com_auxiliar'
            ? toNum(commissionWithAuxPercent)
            : toNum(commissionAsAuxPercent)
      break
    case 'categoria':
    default:
      percent =
        roleInAppointment === 'trancista'
          ? toNum(categoryDefaultTrancista)
          : toNum(categoryDefaultAuxiliar)
      break
  }

  // 3. Override por comanda: só quando existe E o gate permite. Substitui o percentual resolvido.
  // Defensivo: reconfere o perfil além do flag já resolvido (as duas fontes precisam concordar).
  const profileAllows =
    commissionerProfile.role === 'dono' ||
    commissionerProfile.role === 'gerente' ||
    commissionerProfile.can_edit_commission
  let overrideUsed = false
  if (commissionOverride != null && canUseOverride && profileAllows) {
    percent = Number(commissionOverride)
    overrideUsed = true
  }

  return { percent, roleResolved, overrideUsed }
}
