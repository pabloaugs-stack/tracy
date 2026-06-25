import { redirect } from 'next/navigation'
import { getSessionProfile } from '@/lib/auth/session'
import { canAccessReports } from '@/lib/reports/access'
import { listCategories } from '@/lib/queries/service_categories'
import { getServicesRanking } from '@/lib/queries/reports/services-ranking'
import { parsePeriod } from '@/lib/reports/period'
import { ReportLayout } from '../_components/ReportLayout'

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; start?: string; end?: string; cat?: string }>
}) {
  const profile = await getSessionProfile()
  if (!canAccessReports(profile.role)) redirect('/admin')

  const sp = await searchParams
  const { key, start, end, resolved } = parsePeriod(sp)
  const [rows, categories] = await Promise.all([
    getServicesRanking(profile.salon_id, resolved, sp.cat || undefined),
    listCategories(profile.salon_id),
  ])

  const csv = {
    filename: 'ranking-servicos',
    headers: ['Serviço', 'Qtd vendida', 'Faturamento'],
    rows: rows.map((r) => [r.name, r.count, r.revenue.toFixed(2)] as (string | number)[]),
  }

  return (
    <ReportLayout
      title="Ranking de serviços"
      description="Comandas fechadas no período. Ordenado por quantidade."
      period={key}
      start={start}
      end={end}
      extras={[{ kind: 'select', key: 'cat', label: 'Categoria', value: sp.cat ?? '', options: categories.map((c) => ({ value: c.id, label: c.name })) }]}
      csv={csv}
    >
      <div className="bg-tracy-surface border border-tracy-border rounded-xl overflow-hidden">
        <div className="grid grid-cols-[1fr_120px_160px] px-5 py-2 border-b border-tracy-border/40">
          <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest">Serviço</span>
          <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest text-right">Qtd</span>
          <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest text-right">Faturamento</span>
        </div>
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-sm text-tracy-muted text-center">Sem serviços no período.</p>
        ) : (
          rows.map((r, i) => (
            <div key={r.serviceId} className={`grid grid-cols-[1fr_120px_160px] px-5 py-3 ${i < rows.length - 1 ? 'border-b border-tracy-border/30' : ''}`}>
              <span className="text-sm text-tracy-text truncate">{r.name}</span>
              <span className="text-sm text-tracy-muted text-right tabular-nums">{r.count}</span>
              <span className="text-sm text-tracy-text text-right tabular-nums">{brl(r.revenue)}</span>
            </div>
          ))
        )}
      </div>
    </ReportLayout>
  )
}
