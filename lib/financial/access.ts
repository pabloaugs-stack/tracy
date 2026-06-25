import type { SessionProfile } from '@/lib/auth/session'

// Quem acessa o módulo Financeiro: dono sempre + qualquer usuário com a flag can_view_financial.
// Espelha o helper RLS auth_user_can_view_financial() — as duas camadas precisam concordar.
export function canViewFinancial(profile: Pick<SessionProfile, 'role' | 'can_view_financial'>): boolean {
  return profile.role === 'dono' || profile.can_view_financial
}
