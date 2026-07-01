import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSessionProfile } from '@/lib/auth/session'
import { canViewFinancial } from '@/lib/financial/access'
import { listProfessionals } from '@/lib/queries/users'
import { listCommissionEntries } from '@/lib/queries/commission'
import { getSalonSettings } from '@/app/actions/salon-settings'
import { brazilToday } from '@/lib/reports/period'
import { FinanceTabs } from '../_components/FinanceTabs'
import { CommissionTab } from './_components/CommissionTab'

export default async function ComissoesPage() {
  const profile = await getSessionProfile()
  if (!canViewFinancial(profile)) redirect('/admin')

  // Carrega todas as entradas ativas (pendentes e pagas). "Comissões a pagar" precisa mostrar toda
  // pendência independentemente de período — o filtro fino é aplicado no cliente.
  const [professionals, entries, settings] = await Promise.all([
    listProfessionals(profile.salon_id),
    listCommissionEntries(profile.salon_id),
    getSalonSettings(),
  ])

  return (
    <div>
      <Link href="/admin" className="inline-block text-tracy-muted hover:text-tracy-text text-sm transition-colors mb-6">
        ← Dashboard
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-black tracking-tight text-tracy-text">Financeiro</h1>
        <p className="text-tracy-muted text-sm mt-0.5">Comissões a pagar por profissional.</p>
      </div>

      <FinanceTabs active="comissoes" />

      <CommissionTab
        entries={entries}
        professionals={professionals.map((p) => ({ id: p.id, name: p.name }))}
        today={brazilToday()}
        commissionCycle={settings?.commission_cycle ?? 'livre'}
      />
    </div>
  )
}
