import { redirect } from 'next/navigation'
import { getSessionProfile } from '@/lib/auth/session'
import { canAccessReports } from '@/lib/reports/access'
import { getRevenueByMonth } from '@/lib/queries/reports/revenue-by-month'
import { parsePeriod } from '@/lib/reports/period'
import { ReportLayout } from '../_components/ReportLayout'
import { LineChart } from '../_components/Charts'

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function monthLabel(ym: string) {
  const [y, m] = ym.split('-')
  return `${m}/${y.slice(2)}`
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; start?: string; end?: string }>
}) {
  const profile = await getSessionProfile()
  if (!canAccessReports(profile.role)) redirect('/admin')

  const sp = await searchParams
  const { key, start, end, resolved } = parsePeriod(sp, '12m')
  const rows = await getRevenueByMonth(profile.salon_id, resolved)

  const csv = {
    filename: 'faturamento-mensal',
    headers: ['Mês', 'Faturamento'],
    rows: rows.map((r) => [r.month, r.total.toFixed(2)] as (string | number)[]),
  }

  return (
    <ReportLayout
      title="Faturamento por mês"
      description="Recebimentos ativos por mês (pela data de recebimento — paid_at)."
      period={key}
      start={start}
      end={end}
      csv={csv}
    >
      <div className="bg-tracy-surface border border-tracy-border rounded-xl p-5 mb-4">
        {rows.length === 0 ? (
          <p className="text-sm text-tracy-muted">Sem recebimentos no período.</p>
        ) : (
          <LineChart data={rows.map((r) => ({ label: monthLabel(r.month), value: r.total }))} />
        )}
      </div>

      <div className="bg-tracy-surface border border-tracy-border rounded-xl overflow-hidden">
        <div className="grid grid-cols-[1fr_200px] px-5 py-2 border-b border-tracy-border/40">
          <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest">Mês</span>
          <span className="text-[10px] font-semibold text-tracy-muted uppercase tracking-widest text-right">Faturamento</span>
        </div>
        {rows.map((r, i) => (
          <div key={r.month} className={`grid grid-cols-[1fr_200px] px-5 py-3 ${i < rows.length - 1 ? 'border-b border-tracy-border/30' : ''}`}>
            <span className="text-sm text-tracy-text tabular-nums">{monthLabel(r.month)}</span>
            <span className="text-sm text-tracy-text text-right tabular-nums">{brl(r.total)}</span>
          </div>
        ))}
      </div>
    </ReportLayout>
  )
}
