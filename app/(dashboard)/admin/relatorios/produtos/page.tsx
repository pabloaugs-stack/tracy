import { redirect } from 'next/navigation'
import { getSessionProfile } from '@/lib/auth/session'
import { canAccessReports } from '@/lib/reports/access'
import { getProductsRanking } from '@/lib/queries/reports/products-ranking'
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
  const rows = await getProductsRanking(profile.salon_id, resolved)

  const csv = {
    filename: 'ranking-produtos',
    headers: ['Produto', 'Qtd vendida', 'Faturamento'],
    rows: rows.map((r) => [r.name, r.qty, r.revenue.toFixed(2)] as (string | number)[]),
  }

  return (
    <ReportLayout
      title="Ranking de produtos"
      description="Produtos vendidos em comandas fechadas no período. Ordenado por quantidade."
      period={key}
      start={start}
      end={end}
      csv={csv}
    >
      <div className="bg-tracy-surface border border-tracy-border rounded-xl overflow-hidden">
        <div className="grid grid-cols-[1fr_120px_160px] px-5 py-2 border-b border-tracy-border/40">
          <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest">Produto</span>
          <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest text-right">Qtd</span>
          <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest text-right">Faturamento</span>
        </div>
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-sm text-tracy-muted text-center">Sem produtos vendidos no período.</p>
        ) : (
          rows.map((r, i) => (
            <div key={r.productId} className={`grid grid-cols-[1fr_120px_160px] px-5 py-3 ${i < rows.length - 1 ? 'border-b border-tracy-border/30' : ''}`}>
              <span className="text-sm text-tracy-text truncate">{r.name}</span>
              <span className="text-sm text-tracy-muted text-right tabular-nums">{r.qty}</span>
              <span className="text-sm text-tracy-text text-right tabular-nums">{brl(r.revenue)}</span>
            </div>
          ))
        )}
      </div>
    </ReportLayout>
  )
}
