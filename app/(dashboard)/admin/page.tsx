import Link from 'next/link'
import { getSessionProfile } from '@/lib/auth/session'
import { canAccessReports } from '@/lib/reports/access'
import { canViewFinancial } from '@/lib/financial/access'
import { getDashboardMetrics } from '@/lib/queries/dashboard'
import { getFinancialAlerts } from '@/lib/queries/financial-entries'
import { brazilToday } from '@/lib/reports/period'
import { DashboardMetrics } from './_components/DashboardMetrics'

function getGreeting(): string {
  const hour = new Intl.DateTimeFormat('pt-BR', {
    hour: 'numeric',
    hour12: false,
    timeZone: 'America/Sao_Paulo',
  }).format(new Date())
  const h = parseInt(hour)
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

function getTodayFormatted(): string {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date())
}

export default async function AdminPage() {
  const profile = await getSessionProfile()
  const firstName = profile.name.split(' ')[0]

  // Métricas só para dono/gerente (mesmo gate dos relatórios). Demais roles veem a home simples.
  const showMetrics = canAccessReports(profile.role)
  // Alertas de vencimento dentro do dashboard de métricas, só para quem acessa o Financeiro.
  const showFinancial = showMetrics && canViewFinancial(profile)
  const [metrics, financialAlerts] = await Promise.all([
    showMetrics ? getDashboardMetrics(profile.salon_id) : Promise.resolve(null),
    showFinancial ? getFinancialAlerts(profile.salon_id, brazilToday()) : Promise.resolve(undefined),
  ])

  return (
    <div>
      {/* Saudação */}
      <div className="mb-10">
        <h1 className="text-3xl font-black tracking-tight text-tracy-text">
          {getGreeting()}, {firstName}
        </h1>
        <p className="text-tracy-muted text-sm mt-1 capitalize">
          {getTodayFormatted()}
        </p>
      </div>

      {/* Ações rápidas */}
      <div className="mb-10">
        <p className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest mb-3">
          Ações rápidas
        </p>
        <div className="flex flex-wrap gap-3">
          {profile.can_create_appointments && (
            <Link
              href="/admin/agenda/nova-comanda"
              className="bg-tracy-gold text-tracy-bg font-semibold rounded-lg px-4 py-2.5 text-sm hover:opacity-90 transition-opacity"
            >
              + Nova comanda
            </Link>
          )}
          {profile.can_manage_clients && (
            <Link
              href="/admin/clientes/novo"
              className="border border-tracy-border text-tracy-text rounded-lg px-4 py-2.5 text-sm hover:border-tracy-muted transition-colors"
            >
              + Novo cliente
            </Link>
          )}
        </div>
      </div>

      {/* Métricas (dono/gerente). Demais roles não veem este bloco. */}
      {metrics && <DashboardMetrics metrics={metrics} financialAlerts={financialAlerts} />}
    </div>
  )
}
