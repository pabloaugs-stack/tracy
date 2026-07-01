import Link from 'next/link'
import { getSessionProfile } from '@/lib/auth/session'
import { listTeamMembers } from '@/lib/queries/users'
import { ThreeDotsMenu } from './_components/ThreeDotsMenu'
import type { UserRole } from '@/lib/types/database'

const ROLE_LABELS: Record<UserRole, string> = {
  dono: 'Dono',
  gerente: 'Gerente',
  recepcionista: 'Recepcionista',
  trancista: 'Trancista',
  auxiliar: 'Auxiliar',
}

export default async function EquipePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const profile = await getSessionProfile()
  const params = await searchParams
  const tab = params.tab === 'inativos' ? 'inativos' : 'ativos'
  const isAtivos = tab === 'ativos'

  const members = await listTeamMembers(profile.salon_id, isAtivos)
  const canManage = ['dono', 'gerente'].includes(profile.role)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link
            href="/admin"
            className="text-tracy-muted hover:text-tracy-text text-sm transition-colors"
          >
            ← Dashboard
          </Link>
          <h1 className="text-2xl font-black tracking-tight text-tracy-text mt-3">Equipe</h1>
          <p className="text-tracy-muted text-sm mt-1">
            {members.length} {isAtivos ? 'ativo' : 'inativo'}
            {members.length !== 1 ? 's' : ''}
          </p>
        </div>
        {canManage && (
          <Link
            href="/admin/equipe/novo"
            className="bg-tracy-gold text-tracy-bg font-semibold rounded-lg px-4 py-2 text-sm hover:opacity-90 transition-opacity"
          >
            + Novo membro
          </Link>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-tracy-border mb-6">
        <Link
          href="/admin/equipe?tab=ativos"
          className={`pb-2.5 px-4 text-sm font-semibold transition-colors border-b-2 -mb-px ${
            isAtivos
              ? 'text-tracy-gold border-tracy-gold'
              : 'text-tracy-muted border-transparent hover:text-tracy-text'
          }`}
        >
          Ativos
        </Link>
        <Link
          href="/admin/equipe?tab=inativos"
          className={`pb-2.5 px-4 text-sm font-semibold transition-colors border-b-2 -mb-px ${
            !isAtivos
              ? 'text-tracy-gold border-tracy-gold'
              : 'text-tracy-muted border-transparent hover:text-tracy-text'
          }`}
        >
          Inativos
        </Link>
      </div>

      {members.length === 0 ? (
        <div className="border border-dashed border-tracy-border rounded-xl px-6 py-12 text-center">
          <p className="text-tracy-muted text-sm">
            {isAtivos ? 'Nenhum membro ativo.' : 'Nenhum membro inativo.'}
          </p>
          {isAtivos && canManage && (
            <Link
              href="/admin/equipe/novo"
              className="text-tracy-gold text-sm hover:underline mt-2 inline-block"
            >
              Cadastrar primeiro membro
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {members.map((member) => (
            <div
              key={member.id}
              className={`flex items-center justify-between bg-tracy-surface border border-tracy-border rounded-xl px-4 py-3 ${
                !isAtivos ? 'opacity-60' : ''
              }`}
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-tracy-text truncate">{member.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[11px] text-tracy-gold font-medium">
                    {ROLE_LABELS[member.role]}
                  </span>
                  {member.phone && (
                    <span className="text-[11px] text-tracy-muted">{member.phone}</span>
                  )}
                </div>
              </div>

              {canManage && (
                <div className="shrink-0">
                  <ThreeDotsMenu
                    memberId={member.id}
                    memberName={member.name}
                    isActive={isAtivos}
                    canCreateAppointments={member.can_create_appointments}
                    canCloseAppointments={member.can_close_appointments}
                    canViewOtherAgendas={member.can_view_other_agendas}
                    canManageClients={member.can_manage_clients}
                    canViewOtherClients={member.can_view_other_clients}
                    canManageCatalogServices={member.can_manage_catalog_services}
                    canManageCatalogProducts={member.can_manage_catalog_products}
                    canViewFinancial={member.can_view_financial}
                    canEditCommission={member.can_edit_commission}
                    discountLimitPercent={member.discount_limit_percent}
                    memberRole={member.role}
                    canManage={canManage}
                    isSelf={member.id === profile.id}
                    currentUserRole={profile.role}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
