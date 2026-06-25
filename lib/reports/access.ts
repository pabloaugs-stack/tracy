import type { UserRole } from '@/lib/types/database'

// Relatórios são acessíveis apenas a dono/gerente (role-based, sem flag dedicada).
export function canAccessReports(role: UserRole): boolean {
  return role === 'dono' || role === 'gerente'
}
