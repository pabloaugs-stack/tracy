import { redirect } from 'next/navigation'
import { getSessionProfile } from '@/lib/auth/session'
import { canAccessReports } from '@/lib/reports/access'
import { getCommissionByProfessional } from '@/lib/queries/reports/commission-by-professional'
import { getSalonSettings } from '@/app/actions/salon-settings'
import { parsePeriod } from '@/lib/reports/period'
import { ReportLayout } from '../_components/ReportLayout'

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; start?: string; end?: string }>
}) {
  const profile = await getSessionProfile()
  if (!canAccessReports(profile.role)) redirect('/admin')

  const sp = await searchParams
  const { key, start, end, resolved } = parsePeriod(sp)
  const [rows, settings] = await Promise.all([
    getCommissionByProfessional(profile.salon_id, resolved),
    getSalonSettings(),
  ])
  // Coluna de comissão de produto fica oculta quando a comissão de produto está desligada no salão.
  const showProduct = !!settings?.product_commission_enabled

  const csv = {
    filename: 'comissao-por-profissional',
    headers: showProduct
      ? ['Profissional', 'Comissão serviço', 'Comissão produto', 'Total']
      : ['Profissional', 'Comissão serviço', 'Total'],
    rows: rows.map((r) =>
      showProduct
        ? [r.name, r.serviceCommission.toFixed(2), r.productCommission.toFixed(2), r.total.toFixed(2)]
        : [r.name, r.serviceCommission.toFixed(2), r.total.toFixed(2)]
    ) as (string | number)[][],
  }

  const cols = showProduct ? 'grid-cols-[1fr_140px_140px_140px]' : 'grid-cols-[1fr_160px_160px]'

  return (
    <ReportLayout
      title="Comissão por profissional"
      description="Comandas fechadas no período. Comissão de serviço e de produto (snapshot)."
      period={key}
      start={start}
      end={end}
      csv={csv}
    >
      <div className="bg-tracy-surface border border-tracy-border rounded-xl overflow-hidden">
        <div className={`grid ${cols} px-5 py-2 border-b border-tracy-border/40`}>
          <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest">Profissional</span>
          <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest text-right">Serviço</span>
          {showProduct && <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest text-right">Produto</span>}
          <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest text-right">Total</span>
        </div>
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-sm text-tracy-muted text-center">Sem comissões no período.</p>
        ) : (
          rows.map((r, i) => (
            <div key={r.userId} className={`grid ${cols} px-5 py-3 ${i < rows.length - 1 ? 'border-b border-tracy-border/30' : ''}`}>
              <span className="text-sm text-tracy-text truncate">{r.name}</span>
              <span className="text-sm text-tracy-muted text-right tabular-nums">{brl(r.serviceCommission)}</span>
              {showProduct && <span className="text-sm text-tracy-muted text-right tabular-nums">{brl(r.productCommission)}</span>}
              <span className="text-sm text-tracy-text text-right tabular-nums">{brl(r.total)}</span>
            </div>
          ))
        )}
      </div>
    </ReportLayout>
  )
}
